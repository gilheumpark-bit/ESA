import { test, expect } from '@playwright/test';
// axe-core is already pinned in the existing ESLint accessibility toolchain.
// No runtime dependency or lockfile version is changed by these checks.
import axe from 'axe-core';
import { hasFirebaseClientConfig, readFirebaseClientConfig } from '../src/lib/firebase-client-config';
import { buildContentSecurityPolicy } from '../src/lib/security-headers';

const routes = ['/', '/calc', '/tools/sld', '/tools/ocr', '/tools/studio', '/compare', '/settings', '/projects'];
for (const colorScheme of ['light', 'dark'] as const) {
for (const width of [390, 1440]) {
  for (const route of routes) {
    test(`portable layout and accessibility ${route} (${width}px, ${colorScheme})`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
      const errors: string[] = [];
      const authRequests: string[] = [];
      page.on('request', (request) => {
        const target = new URL(request.url());
        if (target.hostname === 'apis.google.com' || target.pathname.startsWith('/__/auth/')) authRequests.push(target.origin + target.pathname);
      });
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(route);
      await expect(page).toHaveTitle(/\S+/);
      const main = page.locator('#main-content');
      await expect(main).toBeVisible();
      await expect(main).toContainText(/\S+/);
      await expect(page.locator('nextjs-portal')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.addScriptTag({ content: axe.source });
      const result = await page.evaluate(async () => {
        const engine = (window as unknown as { axe: typeof axe }).axe;
        return engine.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      });
      await info.attach('accessibility', { body: JSON.stringify(result), contentType: 'application/json' });
      expect(result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) }))).toEqual([]);
      expect(errors).toEqual([]);
      if (!hasFirebaseClientConfig(readFirebaseClientConfig())) expect(authRequests).toEqual([]);
      await info.attach('rendered-page', { body: await page.screenshot(), contentType: 'image/png' });
    });
  }
}
}

test('portable mobile menu opens, closes and restores keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tools/studio');
  const button = page.getByRole('button', { name: '메뉴 열기', exact: true });
  await button.click();
  const dialog = page.getByRole('dialog', { name: '메뉴', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Studio', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(button).toBeFocused();
});

test('portable Studio resize preserves typed input and keyboard bounds', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tools/studio');
  const composer = page.getByRole('textbox', { name: '메시지 입력', exact: true });
  await composer.fill('compatibility draft — do not send');
  const separator = page.getByRole('separator', { name: '도면과 검토 패널 너비 조절' });
  await separator.focus(); await separator.press('Home'); await expect(separator).toHaveAttribute('aria-valuenow', '25');
  await separator.press('End'); await expect(separator).toHaveAttribute('aria-valuenow', '75');
  await separator.press('ArrowLeft'); await expect(separator).toHaveAttribute('aria-valuenow', '70');
  await expect(composer).toHaveValue('compatibility draft — do not send');
  const box = await composer.boundingBox(); expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(900);
});


test('mobile engine status can be focused and scrolled by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const status = page.getByRole('region', { name: '계산 엔진 및 기준서 상태' });
  await status.focus();
  await expect(status).toBeFocused();
  expect(await status.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await status.press('ArrowRight');
  await expect.poll(() => status.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

for (const system of ['light', 'dark'] as const) {
  test(`manual theme overrides ${system} system for both tokens and form surfaces`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: system, reducedMotion: 'reduce' });
    await page.goto('/settings');
    const section = page.locator('main section').filter({ has: page.getByRole('heading', { name: '계산 기준 국가 / 표준', exact: true }) });
    const theme = page.locator('header').first().getByRole('button', { name: /^테마:/ });
    for (const choice of ['dark', 'light'] as const) {
      // Exercise the actual control, never mutate HTML classes in a test.
      for (let i = 0; i < 3 && !(await theme.getAttribute('aria-label'))?.includes(choice === 'dark' ? '어둡게' : '밝게'); i++) await theme.click();
      const selected = choice === 'dark';
      await expect.poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark'))).toBe(selected);
      await expect.poll(() => section.evaluate((element) => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.fillStyle = getComputedStyle(element).backgroundColor; context.fillRect(0, 0, 1, 1);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        return (pixel[0] + pixel[1] + pixel[2]) / 3 < 128;
      })).toBe(selected);
      await expect(page.getByRole('combobox', { name: '계산 기준 국가 / 표준' })).toBeVisible();
      await info.attach(`manual-theme-${choice}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
  });
}

/** Exercise the real policy builder in the browser without contacting an IdP.
 * Every external resource below is an explicitly synthetic intercepted fixture. */
test('configured Firebase CSP permits its resolver and blocks unrelated scripts and frames', async ({ page }, info) => {
  const authDomain = 'fixture.firebaseapp.com';
  const policy = buildContentSecurityPolicy(true, { apiKey: 'synthetic-key', projectId: 'fixture', authDomain });
  await page.route('https://apis.google.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.__allowedResolver = true;' }));
  await page.route(`https://${authDomain}/**`, (route) => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><title>Synthetic auth frame</title><script>parent.postMessage("synthetic-auth-frame", "*")</script>' }));
  await page.route('https://apis.google.com.evil.invalid/**', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.__unexpectedResolver = true;' }));
  await page.route('**/csp-policy-fixture', (route) => route.fulfill({ contentType: 'text/html',
    headers: { 'Content-Security-Policy': policy }, body: `<!doctype html><html lang="en"><title>CSP boundary fixture</title>
      <h1>Synthetic policy verification — not a login</h1><script>
      window.__frames = []; window.__cspViolations = [];
      addEventListener('message', event => { if (event.origin === 'https://${authDomain}') window.__frames.push(event.data); });
      addEventListener('securitypolicyviolation', event => window.__cspViolations.push(event.effectiveDirective));
      </script></html>` }));
  await page.goto('/csp-policy-fixture');
  const appendScript = (source: string) => page.evaluate((url) => new Promise<string>((resolve) => {
    const script = document.createElement('script'); script.src = url;
    script.onload = () => resolve('loaded'); script.onerror = () => resolve('blocked'); document.head.append(script);
  }), source);
  expect(await appendScript('https://apis.google.com/js/api.js')).toBe('loaded');
  expect(await appendScript('https://apis.google.com.evil.invalid/js/api.js')).toBe('blocked');
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__allowedResolver)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__unexpectedResolver)).toBeUndefined();
  await page.evaluate((url) => { const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame); }, `https://${authDomain}/__/auth/iframe`);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __frames: string[] }).__frames)).toEqual(['synthetic-auth-frame']);
  await page.evaluate((url) => { const frame = document.createElement('iframe'); frame.src = url; document.body.append(frame); }, `https://${authDomain}/outside-auth/`);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toContain('frame-src');
  expect(await page.evaluate(() => (window as unknown as { __frames: string[] }).__frames)).toEqual(['synthetic-auth-frame']);
  await info.attach('csp-policy', { body: JSON.stringify({ policy, mode: 'synthetic intercepted resources; no real authentication' }), contentType: 'application/json' });
});
