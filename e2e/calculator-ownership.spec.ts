import { test, expect, type Page } from '@playwright/test';

// Only transport/ownership is synthetic; the actual form, hook and receipt UI run.
const url = '/calc/voltage-drop/voltage-drop?current=100&length=50&cableSize=35';
function response(inputs: Record<string, unknown>, id: string) {
  const result = { value: 12.5, unit: 'V' };
  return { success: true, data: { result, receipt: {
    id, calcId: 'voltage-drop', countryCode: 'KR', appliedStandard: 'ownership fixture', unitSystem: 'SI',
    difficultyLevel: 'intermediate', inputs, result, steps: [], formulaUsed: 'synthetic', standardsUsed: [],
    warnings: [], recommendations: [], disclaimerText: '합성 UI 검증이며 기술 판정이 아닙니다.',
    disclaimerVersion: 'UI', calculatedAt: '2026-09-01T00:00:00Z', standardVersion: 'UI', engineVersion: 'UI',
    isStandardCurrent: false, receiptHash: 'a'.repeat(64), isPublic: false,
  } } };
}
async function prepare(page: Page) {
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: { message: 'Synthetic UI test: ancillary services disconnected' } } }));
  await page.goto(url);
  await expect(page.locator('form input[id$="-current"]')).toHaveValue('100');
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

test('editing scalar inputs invalidates the completed receipt without clearing the form', async ({ page }) => {
  await prepare(page);
  await page.route('**/api/calculate', route => route.fulfill({ json: response(route.request().postDataJSON().inputs, 'ownership-completed') }));
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await expect(page.locator('.receipt-container')).toBeVisible();
  await page.locator('form input[id$="-current"]').fill('200');
  await expect(page.locator('.receipt-container')).toHaveCount(0);
  await expect(page.locator('form input[id$="-current"]')).toHaveValue('200');
  await expect(page.getByRole('button', { name: '계산하기', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await expect(page.locator('.receipt-container')).toBeVisible();
  await page.locator('form select[id$="-conductor"]').selectOption('Al');
  await expect(page.locator('.receipt-container')).toHaveCount(0);
});

test('an input edit cancels a pending calculation and its late receipt cannot return', async ({ page }) => {
  await prepare(page);
  const gate = deferred(); const sent = deferred(); const delivered = deferred();
  page.once('close', gate.release);
  await page.route('**/api/calculate', async (route) => {
    const body = response(route.request().postDataJSON().inputs, 'ownership-late');
    sent.release(); await gate.promise;
    await route.fulfill({ json: body }).catch(() => {}); delivered.release();
  });
  await page.getByRole('button', { name: '계산하기', exact: true }).click();
  await sent.promise;
  await page.locator('form input[id$="-length"]').fill('75');
  // Assert cancellation before releasing the provider; a stale-response timeout cannot pass.
  await expect(page.getByRole('button', { name: '계산하기', exact: true })).toBeEnabled();
  gate.release(); await delivered.promise;
  await expect(page.locator('.receipt-container')).toHaveCount(0);
  await expect(page.locator('form input[id$="-length"]')).toHaveValue('75');
});

test('resubmission hides the old receipt immediately and repeated resets retain form ownership', async ({ page }, info) => {
  await prepare(page);
  let requests = 0; const gate = deferred(); const second = deferred();
  page.once('close', gate.release);
  await page.route('**/api/calculate', async (route) => {
    requests++; const id = `ownership-${requests}`;
    if (requests === 2) { second.release(); await gate.promise; }
    await route.fulfill({ json: response(route.request().postDataJSON().inputs, id) }).catch(() => {});
  });
  const submit = page.getByRole('button', { name: '계산하기', exact: true });
  await submit.click(); await expect(page.locator('.receipt-container')).toBeVisible();
  await submit.click(); await second.promise;
  await expect(page.locator('.receipt-container')).toHaveCount(0);
  gate.release(); await expect(page.locator('.receipt-container')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '재계산', exact: true }).click();
    await expect(page.locator('.receipt-container')).toHaveCount(0);
    await expect(submit).toBeEnabled();
    await submit.click(); await expect(page.locator('.receipt-container')).toBeVisible();
  }
  await info.attach('receipt-ownership', { body: await page.screenshot(), contentType: 'image/png' });
});
