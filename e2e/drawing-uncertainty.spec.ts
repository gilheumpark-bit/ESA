import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { uncertaintyDocument, readSymbol } from '../src/agent/drawing/test-support/uncertainty-document';
import { applyDrawingCorrection } from '../src/agent/drawing/apply-drawing-correction';

// Explicit synthetic UI transport fixtures. Not AI accuracy, account authorization,
// or a live engineering approval. Existing real DXF/PDF tests remain separate.
const quick = { components: [
  { id: 'known', type: 'breaker', label: 'QF-UI', current: '100A', position: { x: 20, y: 20 } },
  { id: 'unread', type: 'unknown', typeCandidates: ['custom-shape'], label: 'X-UI', position: { x: 80, y: 20 } },
], connections: [{ id: 'c1', from: 'known', to: 'unread', flowDirection: 'unknown' }], suggestedCalculations: [], confidence: 1, rawDescription: 'Synthetic fixture' };
const upload = { name: 'synthetic-uncertainty.dxf', mimeType: 'application/dxf', buffer: Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n') };
const explicit = { voltage: 220, current: 10, powerFactor: 0.9 };
async function quickSetup(page: Page, chain: unknown[] = []) {
  await page.route('**/api/drawing-jobs', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '독립 정밀 검사는 별도 fixture에서 수행합니다.' } }) }));
  await page.route('**/api/dxf', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: quick, calcChain: chain }) }));
  await page.goto('/tools/sld');
  await page.locator('input[accept=".dxf,.dwg"]').setInputFiles(upload);
  await expect(page.getByRole('heading', { name: '분석 결과', exact: true })).toBeVisible();
}
for (const width of [1440, 390]) {
  test(`quick candidates keep unknown fields and unknown direction (${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await quickSetup(page);
    const summary = page.getByRole('region', { name: '빠른 추출의 판독 상태', exact: true });
    await expect(summary.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '기기 종류', exact: true }) })).toHaveText('기기 종류0112');
    await expect(summary).toContainText('도면 전체 정답률·자동화율이 아니며');
    await page.getByRole('tab', { name: '기기 2', exact: true }).click();
    await expect(page.getByText('종류: 미판독', { exact: false })).toContainText('custom-shape');
    await page.getByText('정격·입력 판독 상태', { exact: true }).first().click();
    await expect(page.getByText('미기재/미판독 · 미판독', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: info.outputPath('uncertainty-quick.png'), fullPage: true });
    await page.getByRole('tab', { name: '결선 1', exact: true }).click();
    await expect(page.getByLabel('방향 미판독', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('bulk calculation never fills unknown defaults and does not run blocked descendants', async ({ page }) => {
  const calls: Record<string, unknown>[] = [];
  await page.route('**/api/calculate', (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { result: { value: 1980, unit: 'W' } } }) });
  });
  await quickSetup(page, [
    { step: 1, calculatorId: 'single-phase-power', inputs: { current: 10 }, description: '미확인 전압·역률' },
    { step: 2, calculatorId: 'single-phase-power', inputs: explicit, dependsOn: [1], description: '미완료 선행 단계' },
    { step: 3, calculatorId: 'single-phase-power', inputs: explicit, description: '검토 가능한 독립 입력' },
  ]);
  await page.getByRole('tab', { name: '계산 3', exact: true }).click();
  await expect(page.getByRole('button', { name: '전체 실행', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: /표시된 판독 입력을 원본에서 확인/ }).check();
  await page.getByRole('button', { name: '전체 실행', exact: true }).click();
  await expect(page.getByText('HOLD — 미확인 입력: voltage, powerFactor', { exact: true })).toBeVisible();
  await expect(page.getByText('HOLD — 선행 계산 미완료: 1', { exact: true })).toBeVisible();
  await expect(page.getByText(/= 1980W/)).toBeVisible();
  expect(calls).toHaveLength(1); expect(calls[0].inputs).toEqual(explicit);
  await expect(page.getByRole('region', { name: '빠른 추출의 판독 상태' }).getByRole('row').nth(1)).toHaveText('기기 종류0112');
  // Same-file new analysis must not inherit the previous review acknowledgement.
  await page.locator('input[accept=".dxf,.dwg"]').setInputFiles(upload);
  await expect(page.getByRole('tab', { name: '계산 3', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '계산 3', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /표시된 판독 입력을 원본에서 확인/ })).not.toBeChecked();
});

for (const width of [1440, 390]) {
  test(`V3 correction preserves other reasons and export states (${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    let document = uncertaintyDocument(); document.title = '불확실성 검토 합성 도면';
    document.evidenceGraph.symbols = [readSymbol('confirmed', 'S001'), readSymbol('unread', 'S002')];
    document.unresolvedItems = [
      { id: 'unread', displayId: 'P01-S002', code: 'UNREADABLE_SYMBOL', pageIndex: 0, bounds: { x: 20, y: 20, w: 20, h: 10 }, candidates: ['breaker', 'motor'], note: '분류 미확정' },
      { id: 'quality', displayId: 'P01-S002', code: 'LOW_RESOLUTION_HOLD', pageIndex: 0, bounds: { x: 20, y: 20, w: 20, h: 10 }, note: '원본 해상도 확인 필요' },
    ];
    document.verification = { ...document.verification, claimsComplete: false, documentStatus: 'HOLD', holdReasons: ['UNREADABLE_SYMBOL', 'LOW_RESOLUTION_HOLD'] };
    await page.route('**/api/drawing-jobs', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { jobId: 'ui-uncertainty', status: 'COMPLETE', document } }) }));
    await page.route('**/api/drawing-jobs/ui-uncertainty/corrections', (route) => {
      const body = route.request().postDataJSON();
      expect(body.targetDisplayId).toBe('P01-S002'); expect(body.selectedValue).toBe('breaker');
      document = applyDrawingCorrection(document, { ...body, correctedBy: 'synthetic-reviewer' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { document, resumeAvailable: false } }) });
    });
    await page.goto('/tools/sld');
    await page.locator('input[accept=".pdf,.dxf,.dwg,image/*"]').setInputFiles(upload);
    const summary = page.getByRole('region', { name: '정밀 근거의 판독 상태', exact: true });
    await expect(summary.getByRole('row').nth(1)).toHaveText('기기 종류1012');
    await page.getByRole('button', { name: '미확정 2', exact: true }).click();
    await page.getByRole('button', { name: 'breaker 선택', exact: true }).click();
    await expect(summary.getByRole('row').nth(1)).toHaveText('기기 종류2002');
    await expect(summary).toContainText('사람 정정: 1건');
    await expect(page.getByText('원본 해상도 확인 필요', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '미확정 1', exact: true })).toBeVisible();
    expect(document.verification.claimsComplete).toBe(false);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV 체크리스트', exact: true }).click();
    const downloaded = await pending;
    const csv = await readFile((await downloaded.path())!, 'utf8');
    expect(csv).toContain('사람 정정 확정(종류·문자),,1');
    expect(csv).toContain('LOW_RESOLUTION_HOLD'); expect(csv).toContain('2 / 0 / 0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('uncertainty-corrected.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}
