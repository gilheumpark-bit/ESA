import { test, expect, type Page, type Route } from '@playwright/test';

// Synthetic HTTP fixtures exercise rendered state transitions, not AI accuracy.
const SAMPLE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=', 'base64');
const ocrSuccess = {
  success: true, data: { manufacturer: 'UI 검증 장비', voltage: '380', current: '100', power: '55', phase: '3', powerFactor: '0.85', rawText: 'SYNTHETIC UI FIXTURE', confidence: 0.9, language: 'ko' },
  suggestedCalculators: ['voltage-drop'],
};
const resultBody = (value: number) => ({ success: true, data: { result: { value, unit: 'V' }, receipt: null } });
async function mockVision(page: Page) {
  await page.addInitScript(() => localStorage.setItem('esa-chatgpt-local', JSON.stringify({ enabled: true, model: 'ui-fixture-vision' })));
  await page.route('**/api/settings/chatgpt-local', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: { available: true, connected: true, models: [{ id: 'ui-fixture-vision', inputModalities: ['text', 'image'] }] } }),
  }));
}
async function uploadOcr(page: Page) {
  await page.goto('/tools/ocr');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '이미지 업로드', exact: true }).click();
  await (await chooser).setFiles({ name: 'synthetic-nameplate.png', mimeType: 'image/png', buffer: SAMPLE_PNG });
  await expect(page.getByAltText('명판 이미지')).toBeVisible();
}
async function fillCompare(page: Page, index = 0) {
  await page.locator(`#compare-${index}-current`).fill('100');
  await page.locator(`#compare-${index}-length`).fill('50');
  await page.locator(`#compare-${index}-cableSize`).fill('35');
}
function holdResponse(page: Page, endpoint: string, body: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const install = page.route(`**${endpoint}`, async (route: Route) => {
    await gate;
    // Aborting the in-flight request is one correct implementation of recovery.
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
  });
  return { install, release: () => release() };
}

test('compare invalidates a finished result when its inputs change', async ({ page }) => {
  await page.route('**/api/calculate', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resultBody(12345)) }));
  await page.goto('/compare');
  await fillCompare(page);
  await page.getByRole('button', { name: '계산', exact: true }).nth(0).click();
  await expect(page.getByRole('cell', { name: '12345 V', exact: true })).toBeVisible();
  await page.locator('#compare-0-current').fill('200');
  await expect(page.getByRole('cell', { name: '12345 V', exact: true })).toHaveCount(0);
});

test('compare ignores a response for inputs edited while calculation is pending', async ({ page }) => {
  const delayed = holdResponse(page, '/api/calculate', resultBody(23456));
  await delayed.install;
  await page.goto('/compare');
  await fillCompare(page);
  const sent = page.waitForRequest('**/api/calculate');
  await page.getByRole('button', { name: '계산', exact: true }).nth(0).click();
  await sent;
  await page.locator('#compare-0-current').fill('200');
  delayed.release();
  await page.waitForTimeout(250);
  await expect(page.getByRole('cell', { name: '23456 V', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '계산', exact: true }).nth(0)).toBeEnabled();
});

test('changing comparison calculator cannot receive the previous calculator result', async ({ page }) => {
  const delayed = holdResponse(page, '/api/calculate', resultBody(34567));
  await delayed.install;
  await page.goto('/compare');
  await fillCompare(page);
  const sent = page.waitForRequest('**/api/calculate');
  await page.getByRole('button', { name: '계산', exact: true }).nth(0).click();
  await sent;
  await page.getByLabel('계산기 선택').selectOption('short-circuit');
  delayed.release();
  await page.waitForTimeout(250);
  await expect(page.getByRole('cell', { name: '34567 V', exact: true })).toHaveCount(0);
  await expect(page.locator('#compare-0-systemVoltage')).toBeVisible();
});

test('removing a scenario does not assign a pending result to its neighbour', async ({ page }) => {
  const delayed = holdResponse(page, '/api/calculate', resultBody(45678));
  await delayed.install;
  await page.goto('/compare');
  await page.getByRole('button', { name: '시나리오 추가', exact: true }).click();
  await fillCompare(page, 1);
  const sent = page.waitForRequest('**/api/calculate');
  await page.getByRole('button', { name: '계산', exact: true }).nth(1).click();
  await sent;
  await page.getByRole('button', { name: 'A안 삭제', exact: true }).click();
  delayed.release();
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: '계산 결과', exact: true }) });
  await expect(row.getByRole('cell').nth(1)).toHaveText('45678 V');
  await expect(row.getByRole('cell').nth(2)).toHaveText('-');
});

for (const mode of ['missing', 'denied'] as const) {
  test(`comparison share has a manual fallback when clipboard is ${mode}`, async ({ page }) => {
    const errors: string[] = [];
    const prompts: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', async (d) => { prompts.push(`${d.type()}:${d.message()}:${d.defaultValue()}`); await d.dismiss(); });
    await page.addInitScript((setting) => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: setting === 'missing' ? undefined : { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } }), mode);
    await page.goto('/compare');
    await page.getByRole('button', { name: '공유', exact: true }).click();
    await expect.poll(() => prompts.some((p) => p.startsWith('prompt:') && p.includes('/compare?calc='))).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('comparison share reloads all four input scenarios', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } }));
  page.on('dialog', (d) => d.dismiss());
  await page.goto('/compare');
  await page.getByRole('button', { name: '시나리오 추가', exact: true }).click();
  await page.getByRole('button', { name: '시나리오 추가', exact: true }).click();
  await page.locator('#compare-3-current').fill('150');
  await page.getByRole('button', { name: '공유', exact: true }).click();
  const shared = page.url();
  await page.goto(shared);
  await expect(page.getByRole('button', { name: '계산', exact: true })).toHaveCount(4);
  await expect(page.locator('#compare-3-current')).toHaveValue('150');
  await expect(page.getByRole('button', { name: '시나리오 추가', exact: true })).toHaveCount(0);
});

for (const sample of [
  { name: 'structured429', status: 429, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'ESVA-9429', message: 'Too many requests', retryAfter: 17 } }), expected: '요청이 너무 많습니다. 17초 후 다시 시도해주세요.' },
  { name: 'invalidJSON', status: 503, contentType: 'text/html', body: '<html>upstream unavailable</html>', expected: 'OCR 처리에 실패했습니다' },
]) {
  test(`OCR ${sample.name} is readable and can retry`, async ({ page }, info) => {
    await mockVision(page);
    let calls = 0;
    await page.route('**/api/ocr', (r) => ++calls === 1 ? r.fulfill(sample) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ocrSuccess) }));
    await uploadOcr(page);
    await page.getByRole('button', { name: '명판 분석하기', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(sample.expected);
    await page.screenshot({ path: info.outputPath('readable-error.png'), fullPage: false });
    await page.getByRole('button', { name: '명판 분석하기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '분석 결과', exact: true })).toBeVisible();
    await expect(page.getByText('UI 검증 장비', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    expect(calls).toBe(2);
  });
}

test('resetting OCR discards its in-flight result', async ({ page }) => {
  await mockVision(page);
  const delayed = holdResponse(page, '/api/ocr', ocrSuccess);
  await delayed.install;
  await uploadOcr(page);
  const sent = page.waitForRequest('**/api/ocr');
  await page.getByRole('button', { name: '명판 분석하기', exact: true }).click();
  await sent;
  await page.getByAltText('명판 이미지').locator('..').getByRole('button').click();
  delayed.release();
  await page.waitForTimeout(250);
  await expect(page.getByRole('button', { name: '이미지 업로드', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '분석 결과', exact: true })).toHaveCount(0);
  await expect(page.getByText('UI 검증 장비', { exact: true })).toHaveCount(0);
});

test('a disconnected local AI reports a V3 error without an unhandled rejection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('esa-chatgpt-local', JSON.stringify({ enabled: true, model: 'ui-fixture-vision' })));
  await page.route('**/api/settings/chatgpt-local', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ data: { available: false, connected: false, models: [] } }) }));
  await page.goto('/tools/sld');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'PDF/DXF/이미지 전체 분석', exact: true }).click();
  await (await chooser).setFiles({ name: 'synthetic-page.png', mimeType: 'image/png', buffer: SAMPLE_PNG });
  await expect(page.getByRole('main').getByRole('alert')).toContainText('로컬 Codex를 사용할 수 없습니다');
  await expect(page.getByRole('button', { name: 'PDF/DXF/이미지 전체 분석', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
