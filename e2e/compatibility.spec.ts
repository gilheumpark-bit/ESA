import { test, expect } from '@playwright/test';
// axe-core is already pinned in the existing ESLint accessibility toolchain.
// No runtime dependency or lockfile version is changed by these checks.
import axe from 'axe-core';

const routes = ['/', '/calc', '/tools/sld', '/tools/ocr', '/tools/studio', '/compare', '/settings', '/projects'];
for (const width of [390, 1440]) {
  for (const route of routes) {
    test(`portable layout and accessibility ${route} (${width}px)`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
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
