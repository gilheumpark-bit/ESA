import { test, expect } from '@playwright/test';
// axe-core is already pinned in the existing ESLint accessibility toolchain.
// No runtime dependency or lockfile version is changed by these checks.
import axe from 'axe-core';

const routes = ['/', '/calc', '/tools/sld', '/tools/ocr', '/tools/studio', '/compare', '/settings', '/projects'];
for (const colorScheme of ['light', 'dark'] as const) {
for (const width of [390, 1440]) {
  for (const route of routes) {
    test(`portable layout and accessibility ${route} (${width}px, ${colorScheme})`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
      const errors: string[] = [];
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
