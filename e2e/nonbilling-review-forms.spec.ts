import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticAuth, UI_USER, UI_EMAIL } from './helpers/synthetic-auth';

for (const width of [1440, 390]) {
  test(`missing OCR fields can be completed without losing original evidence (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await syntheticAuth(page);
    // Declared synthetic vision connection; no real key or account is created.
    await page.addInitScript(() => localStorage.setItem('esa-chatgpt-local', JSON.stringify({ enabled: true, model: 'ui-nonbilling-vision' })));
    await page.route('**/api/settings/chatgpt-local', (route) => route.fulfill({ json: { data: {
      available: true, connected: true, models: [{ id: 'ui-nonbilling-vision', inputModalities: ['text', 'image'] }],
    } } }));
    await page.route('**/api/ocr', (route) => route.fulfill({ json: { success: true,
      data: { rawText: 'Synthetic plate: 220/380V, 50kA', confidence: 0.9, language: 'ko', voltage: '220/380V', current: '50kA' }, suggestedCalculators: ['voltage-drop'] } }));
    await page.goto('/tools/ocr');
    // Small synthetic image; no actual OCR provider or customer data.
    await page.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles({ name: 'synthetic-plate.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMqoAAAAASUVORK5CYII=', 'base64') });
    await page.getByRole('button', { name: '명판 분석하기', exact: true }).click();
    await expect(page.getByText(/복수 값·범위·미확정 표기/).first()).toBeVisible();
    await expect(page.getByText(/kA 값은 차단용량일 수 있습니다/)).toBeVisible();
    await page.getByText('미기재·미판독 항목 보완', { exact: true }).click();
    const missing = page.locator('details').filter({ hasText: '미기재·미판독 항목 보완' });
    // Existing ParameterRow exposes edit/save controls for the missing values too.
    const button = missing.getByRole('button').first(); await button.click();
    const input = missing.getByRole('textbox'); await input.fill('원본 확인 제조사');
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    await expect(input).toBeVisible(); await expect(input).toHaveValue('원본 확인 제조사');
    await input.press('Enter');
    await expect(page.getByText('원본 확인 제조사', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '제조사 수정', exact: true }).click();
    const editing = page.getByRole('textbox', { name: '제조사 수정값', exact: true });
    await editing.fill('취소할 수정'); await editing.press('Escape');
    await expect(page.getByText('원본 확인 제조사', { exact: true })).toBeVisible();
    await expect(page.getByText('취소할 수정', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/사람 수정 · 최초 판독: 미판독/)).toBeVisible();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '원본·수정값 JSON 내보내기', exact: true }).click();
    const file = await pending; const data = JSON.parse(await readFile((await file.path())!, 'utf8'));
    expect(data.original.manufacturer).toBeUndefined(); expect(data.reviewed.manufacturer).toBe('원본 확인 제조사');
    expect(data.original.voltage).toBe('220/380V'); expect(data.editedFields).toContain('manufacturer');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`project sharing dialog traps keyboard focus and returns it on escape (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await syntheticAuth(page);
    await page.route('**/api/projects/p1', (route) => route.fulfill({ json: {
      id: 'p1', name: '키보드 검토 프로젝트', ownerId: UI_USER, status: 'active',
      members: [{ userId: UI_USER, email: UI_EMAIL, role: 'owner', joinedAt: '' }], calculations: [], createdAt: '', updatedAt: '' } }));
    await page.goto('/projects/p1');
    const trigger = page.getByRole('button', { name: '공유', exact: true }); await trigger.click();
    const dialog = page.getByRole('dialog', { name: '프로젝트 공유', exact: true }); await expect(dialog).toBeVisible();
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('standards conversion cannot display an old response for changed inputs', async ({ page }) => {
  await syntheticAuth(page);
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; }); const started = new Promise<void>((resolve) => { entered = resolve; });
  await page.route('**/api/standard-convert', async (route) => {
    const input = route.request().postDataJSON(); entered(); await held;
    await route.fulfill({ json: { success: true, data: { toStandard: input.toStandard, toClause: 'OLD-CLAUSE', confidence: 0.9 } } }).catch(() => undefined);
  });
  try {
    await page.goto('/standards');
    const input = page.getByRole('textbox', { name: '원본 조항 번호', exact: true }); await input.fill('232.1');
    await page.getByRole('button', { name: '변환', exact: true }).click(); await started;
    await input.fill('142'); release();
    await expect(page.getByRole('button', { name: '변환', exact: true })).toBeEnabled();
    await expect(page.getByText('OLD-CLAUSE', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '저장된 참조 판본', exact: true })).toBeVisible();
  } finally { release(); }
});
