import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const out = process.env.FRONTEND_AUDIT_OUT ?? path.join(root, 'test-results/frontend-census');
mkdirSync(out, { recursive: true });
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const sources = walk(path.join(root, 'src')).filter((f) => f.endsWith('.tsx') && !f.includes('/__tests__/'));
const sourceControls = [];
for (const file of sources) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (['button', 'input', 'select', 'textarea', 'form', 'a', 'Link'].includes(tag)) {
        const attributes = Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.getText(source), a.initializer?.getText(source) ?? true]));
        sourceControls.push({ file: path.relative(root, file), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, tag, attributes });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
writeFileSync(`${out}/source-controls.json`, JSON.stringify(sourceControls, null, 2));
const pages = walk(path.join(root, 'src/app')).filter((file) => file.endsWith('/page.tsx'));
const routes = pages.map((file) => {
  const parts = path.relative(path.join(root, 'src/app'), path.dirname(file)).split(path.sep).filter((s) => !s.startsWith('('));
  let route = '/' + parts.join('/');
  if (route.includes('[category]')) route = '/calc/voltage-drop/voltage-drop';
  return route.replace('[id]', 'ui-audit-missing-id').replace('[token]', 'ui-audit-missing-token');
});
const browser = await chromium.launch({ headless: true });
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3021';
const results = [];
const localLinks = new Set();
const inventory = async (page) => page.evaluate(() => {
  const visible = (e) => Boolean(e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
  const controls = [...document.querySelectorAll('button,a,input,select,textarea,[role="tab"]')].filter(visible).map((e) => ({
    tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), type: e.getAttribute('type'),
    name: e.getAttribute('aria-label') || e.innerText?.trim().slice(0, 140) || e.getAttribute('title') || e.labels?.[0]?.innerText || e.getAttribute('placeholder') || '',
    id: e.id, href: e.getAttribute('href'), disabled: e.disabled === true || e.getAttribute('aria-disabled') === 'true',
    value: e instanceof HTMLInputElement && e.type !== 'password' ? e.value : undefined,
  }));
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  return { controls, duplicateIds: [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))],
    mainCount: document.querySelectorAll('main').length, mainText: document.querySelector('main')?.innerText?.slice(0, 1400) ?? '',
    overflow: document.documentElement.scrollWidth - innerWidth,
    overflowElements: [...document.querySelectorAll('main *')].filter(visible).filter((e) => e.getBoundingClientRect().right > innerWidth + 2).slice(0, 12).map((e) => ({ tag: e.tagName, text: e.innerText?.slice(0, 90), width: e.getBoundingClientRect().width, class: e.className })),
  };
});
for (const width of [1440, 390]) {
  for (const route of routes) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
    // Never contact external providers or perform real account/payment writes.
    await context.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (!['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol.startsWith('http')) return r.abort('blockedbyclient');
      return r.continue();
    });
    const page = await context.newPage();
    const errors = [];
    const httpErrors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (r.status() >= 400) httpErrors.push({ status: r.status(), url: r.url() }); });
    let row;
    try {
      const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(150);
      const state = await inventory(page);
      const name = `${width}-${route.replace(/[^a-zA-Z0-9]/g, '_') || 'home'}`;
      await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
      row = { route, width, status: response?.status(), finalUrl: page.url(), title: await page.title(), ...state, errors, httpErrors };
      state.controls.forEach((c) => { if (c.href?.startsWith('/') && !c.href.startsWith('//')) localLinks.add(c.href); });
      console.log('ROUTE', JSON.stringify({ route, width, status: row.status, main: state.mainCount, overflow: state.overflow, errors, buttons: state.controls.filter((c) => c.tag === 'button').map((c) => `${c.disabled ? '[disabled] ' : ''}${c.name}`), missingNames: state.controls.filter((c) => c.tag === 'button' && !c.name), duplicateIds: state.duplicateIds }));
    } catch (error) {
      row = { route, width, failure: String(error), errors, httpErrors };
      console.log('ROUTE_FAILURE', JSON.stringify(row));
    }
    results.push(row);
    await context.close();
  }
}
// Resolve every unique local navigation target discovered above, including all
// catalog calculator links. These are navigation checks, not calculation proof.
const linkResults = [];
const context = await browser.newContext();
const page = await context.newPage();
for (const href of [...localLinks].sort()) {
  try {
    const response = await page.goto(base + href, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const title = await page.title();
    const status = response?.status();
    linkResults.push({ href, status, title, finalUrl: page.url() });
    if (!status || status >= 400) console.log('LINK_FAILURE', JSON.stringify(linkResults.at(-1)));
  } catch (error) { linkResults.push({ href, failure: String(error) }); }
}
await context.close();
await browser.close();
let revision = 'unavailable';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* Source exports need not have Git metadata. */ }
const summary = { revision, sourcePages: pages.length, sourceControls: sourceControls.length, routeChecks: results.length, linkChecks: linkResults.length,
  renderFailures: results.filter((r) => r.failure || r.status >= 400 || r.errors.length || r.mainCount !== 1 || !r.mainText),
  overflow: results.filter((r) => r.overflow > 2), brokenLinks: linkResults.filter((r) => r.failure || r.status >= 400) };
writeFileSync(`${out}/route-inventory.json`, JSON.stringify(results, null, 2));
writeFileSync(`${out}/links.json`, JSON.stringify(linkResults, null, 2));
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log('AUDIT_SUMMARY', JSON.stringify(summary));
