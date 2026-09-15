import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classificationDocument, classificationDxf } from '../src/engine/topology/test-support/symbol-classification-fixture';

// Browser plugin not available. Production Chromium QA via existing Playwright.
// HTTP drawing fixtures exercise layout and controls, not external AI accuracy.
const evidenceDir = process.env.UI_SCREEN_DIR ?? join(tmpdir(), 'esa-ui-alignment');
const routes = ['/', '/calc', '/tools/sld', '/tools/ocr', '/tools/studio', '/compare', '/settings', '/projects'];
async function evidence(page: Page, name: string, fullPage = false) {
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: join(evidenceDir, `${name}.png`), fullPage, animations: 'disabled' });
}
async function layout(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('body header')!;
    return {
      url: location.pathname, title: document.title,
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      mainTextLength: document.querySelector('main')?.textContent?.length ?? 0,
      headerHeight: header.getBoundingClientRect().height,
      headerToken: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-height')),
    };
  });
}

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  test(`page shells keep stable widths, gutters and visible controls (${width}px)`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const observations = [];
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator('main h1')).toHaveCount(1);
      const state = await layout(page);
      expect(state.url).toBe(route);
      expect(state.title).toContain('ESVA');
      expect(state.mainTextLength).toBeGreaterThan(40);
      expect(state.scrollWidth, route).toBeLessThanOrEqual(width);
      expect(Math.abs(state.headerHeight - state.headerToken)).toBeLessThanOrEqual(1);
      await expect(page.locator('nextjs-portal')).toHaveCount(0);
      // These pages previously shrank to their copy instead of their width cap.
      const cap = route === '/tools/ocr' || route === '/settings' ? 672 : route === '/projects' ? 1024 : null;
      if (cap !== null) {
        const shell = page.locator('main > div').first();
        const box = (await shell.boundingBox())!;
        expect(Math.abs(box.width - Math.min(width, cap)), route).toBeLessThanOrEqual(1);
        const padding = await shell.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
        expect(padding).toBe(width < 640 ? 16 : 24);
      }
      const theme = page.locator('header').first().getByRole('button', { name: /^테마:/ });
      expect((await theme.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      observations.push({ route, ...state });
      if ([390, 768, 1440].includes(width)) await evidence(page, `${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-${width}`, true);
    }
    expect(errors).toEqual([]);
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(join(evidenceDir, `layout-${width}.json`), JSON.stringify({ observations, errors }, null, 2));
  });
}

for (const width of [768, 1440]) {
  test(`Studio composer fits the viewport and resizing stops on release (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/tools/studio', { waitUntil: 'networkidle' });
    const composer = page.getByRole('textbox', { name: '메시지 입력', exact: true });
    const inputBox = (await composer.boundingBox())!;
    expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(900);
    const separator = page.getByRole('separator', { name: '도면과 검토 패널 너비 조절' });
    await separator.focus(); await separator.press('ArrowRight');
    await expect(separator).toHaveAttribute('aria-valuenow', '55');
    await separator.press('Home'); await expect(separator).toHaveAttribute('aria-valuenow', '25');
    await separator.press('End'); await expect(separator).toHaveAttribute('aria-valuenow', '75');
    await separator.press('ArrowRight'); await expect(separator).toHaveAttribute('aria-valuenow', '75');
    const box = (await separator.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.mouse.down(); await page.mouse.move(width * 0.5, box.y + 80, { steps: 6 }); await page.mouse.up();
    const value = Number(await separator.getAttribute('aria-valuenow'));
    expect(value).toBeGreaterThanOrEqual(48); expect(value).toBeLessThanOrEqual(52);
    await page.mouse.move(width * 0.8, box.y + 150);
    await expect(separator).toHaveAttribute('aria-valuenow', String(value));
    await composer.fill('정렬 검사 중인 입력');
    await expect(composer).toHaveValue('정렬 검사 중인 입력');
    await expect(page.getByRole('button', { name: '전송', exact: true })).toBeEnabled();
    // No provider request is made by typing or resizing.
    await evidence(page, `studio-resized-${width}`);
    expect((await layout(page)).scrollWidth).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
  });
}

test('Studio touch resize captures the pointer and cancel releases ownership', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/tools/studio', { waitUntil: 'networkidle' });
  const separator = page.getByRole('separator', { name: '도면과 검토 패널 너비 조절' });
  const box = (await separator.boundingBox())!;
  // CDP creates trusted touch input; synthetic pointer events cannot prove capture.
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 4, y: box.y + 80 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 640, y: box.y + 80 }] });
  await expect.poll(async () => Number(await separator.getAttribute('aria-valuenow'))).toBeGreaterThan(55);
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const value = await separator.getAttribute('aria-valuenow');
  await page.mouse.move(280, box.y + 80);
  await expect(separator).toHaveAttribute('aria-valuenow', value!);
  await client.detach();
});

for (const width of [320, 390]) {
  test(`five quick-result tabs remain visible and keyboard operable (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/drawing-jobs', route => route.fulfill({ status: 503, json: { error: { message: '합성 UI 시험: 전체 검토는 별도 검사' } } }));
    await page.route('**/api/dxf', route => route.fulfill({ json: { success: true, data: {
      components: [{ id: 'q1', type: 'breaker', label: '합성 차단기', position: { x: 20, y: 20 } }],
      connections: [], suggestedCalculations: [], confidence: 0.7, rawDescription: 'Synthetic UI transport fixture',
    } } }));
    await page.goto('/tools/sld');
    await page.locator('input[accept=".dxf,.dwg"]').setInputFiles({ name: 'ui-tabs.dxf', mimeType: 'application/dxf', buffer: Buffer.from(classificationDxf()) });
    const tablist = page.getByRole('tablist', { name: '도면 분석 결과 항목' });
    await expect(tablist).toBeVisible();
    const tabs = tablist.getByRole('tab'); await expect(tabs).toHaveCount(5);
    const boxes = await tabs.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().toJSON()));
    for (const box of boxes) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); expect(box.height).toBeGreaterThanOrEqual(44); }
    const selected = tablist.locator('[aria-selected="true"]');
    await selected.focus(); await selected.press('End');
    await expect(tabs.nth(4)).toBeFocused(); await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
    await tabs.nth(4).press('ArrowRight'); await expect(tabs.nth(0)).toBeFocused();
    await tabs.nth(0).press('ArrowRight'); await expect(tabs.nth(1)).toBeFocused();
    await expect(page.getByRole('tabpanel', { name: '기기 1', exact: true })).toBeVisible();
    await evidence(page, `quick-tabs-${width}`);
    expect((await layout(page)).scrollWidth).toBeLessThanOrEqual(width);
  });

  test(`AX inventory columns and long labels stay inside the report (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const document = classificationDocument();
    document.evidenceGraph.symbols[0].rawLabel = 'LONG-LABEL-'.repeat(24);
    await page.route('**/api/drawing-jobs', route => route.fulfill({ json: { success: true, data: { jobId: 'alignment-inventory', status: 'COMPLETE', document } } }));
    await page.goto('/tools/sld');
    await page.locator('input[accept=".pdf,.dxf,.dwg,image/*"]').setInputFiles({ name: 'alignment.dxf', mimeType: 'application/dxf', buffer: Buffer.from(classificationDxf()) });
    await page.getByRole('button', { name: 'AX 기기표', exact: true }).click();
    const inventory = page.getByRole('region', { name: 'AX 기기표', exact: true });
    const table = inventory.getByRole('table');
    await expect(table.getByRole('columnheader', { name: '초안 합계' })).toBeVisible();
    expect(await table.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const bounds = (await inventory.boundingBox())!;
    const buttons = await inventory.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    for (const box of buttons) {
      expect(box.left).toBeGreaterThanOrEqual(bounds.x - 1); expect(box.right).toBeLessThanOrEqual(bounds.x + bounds.width + 1); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const downloaded = page.waitForEvent('download');
    await inventory.getByRole('button', { name: '전체 기기표 CSV', exact: true }).click();
    const file = await downloaded;
    const csv = await readFile((await file.path())!, 'utf8');
    expect(csv).toContain(document.documentHash); expect(csv).toContain('물리 대수 아님'); expect(csv).toContain('LONG-LABEL-'.repeat(24));
    await inventory.getByRole('checkbox').check(); await expect(inventory.getByRole('checkbox')).toBeChecked();
    await inventory.getByRole('heading', { name: '재입력 없는 기기표 초안' }).scrollIntoViewIfNeeded();
    await evidence(page, `inventory-aligned-${width}`);
    expect((await layout(page)).scrollWidth).toBeLessThanOrEqual(width);
  });
}

test('theme and mobile navigation keep alignment after viewport changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto('/tools/studio', { waitUntil: 'networkidle' });
  const theme = page.locator('header').first().getByRole('button', { name: /^테마:/ });
  await theme.click(); await theme.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '메뉴', exact: true });
  await expect(dialog.getByRole('link', { name: 'Studio', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: '메뉴 열기', exact: true })).toBeFocused();
  await evidence(page, 'studio-dark-390', true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => Math.abs((await layout(page)).headerHeight - (await layout(page)).headerToken)).toBeLessThanOrEqual(1);
  const composer = (await page.getByRole('textbox', { name: '메시지 입력', exact: true }).boundingBox())!;
  expect(composer.y + composer.height).toBeLessThanOrEqual(900);
  expect((await layout(page)).scrollWidth).toBeLessThanOrEqual(1440);
  await evidence(page, 'studio-dark-1440');
});
