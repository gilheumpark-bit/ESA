import { test, expect } from '@playwright/test';
import { parseDxfToSLD } from '../src/engine/topology/dxf-parser';
import { feedbackDocument, feedbackDxf } from '../src/engine/topology/test-support/feedback-dxf';
import { applyDrawingCorrection } from '../src/agent/drawing/apply-drawing-correction';

// Synthetic HTTP responses exercise actual parser/correction functions and UI.
// This does not authenticate a real account or call an external AI provider.
for (const width of [1440, 390]) {
  test(`human feedback approval changes only matching future DXF and can be withdrawn (${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    const source = feedbackDxf();
    let document = feedbackDocument(source);
    const observed: Array<{ type: string; ids: string[] }> = [];
    await page.route('**/api/drawing-jobs', (route) => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { jobId: 'feedback-ui', status: 'COMPLETE', document } }) }));
    await page.route('**/api/drawing-jobs/feedback-ui/corrections', (route) => {
      const body = route.request().postDataJSON();
      document = applyDrawingCorrection(document, { ...body, correctedBy: 'synthetic-reviewer' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { document, resumeAvailable: false } }) });
    });
    await page.route('**/api/dxf', async (route) => {
      const request = route.request();
      const form = await new Request('http://localhost/ui-fixture', { method: 'POST', headers: request.headers(),
        body: new Uint8Array(request.postDataBuffer()!) }).formData();
      const file = form.get('file') as File;
      const library = form.get('symbolLibrary');
      const analysis = parseDxfToSLD(await file.text(), { symbolLibrary: typeof library === 'string' ? JSON.parse(library) : undefined });
      observed.push({ type: analysis.components[0].type, ids: analysis.components[0].appliedFeedbackIds ?? [] });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: analysis, calcChain: [] }) });
    });
    const upload = { name: 'feedback-source.dxf', mimeType: 'application/dxf', buffer: Buffer.from(source) };
    await page.goto('/tools/sld');
    await page.locator('input[accept=".pdf,.dxf,.dwg,image/*"]').setInputFiles(upload);
    await page.getByRole('button', { name: '미확정 1', exact: true }).click();
    await page.getByRole('button', { name: 'breaker 선택', exact: true }).click();
    const panel = page.getByRole('region', { name: '사람 정정 재사용', exact: true });
    await expect(panel.getByText('CUSTOM-UI → breaker', { exact: true })).toBeVisible();
    await panel.getByLabel('피드백 적용 회사', { exact: true }).fill('UI Company');
    await panel.getByLabel('정정 근거', { exact: true }).fill('합성 원본의 차단기 분류 확인');
    await panel.getByRole('button', { name: /재사용 후보 저장/ }).click();
    await expect(panel.getByText(/승인 대기/)).toBeVisible();
    // Move the same drawing block; parser fingerprints exclude INSERT placement.
    const next = { ...upload, name: 'feedback-next.dxf', buffer: Buffer.from(feedbackDxf('CUSTOM-UI', false, 1, 400, 90)) };
    await page.getByRole('button', { name: 'DXF 벡터 파싱 탭 선택', exact: true }).click();
    await page.locator('input[accept=".dxf,.dwg"]').setInputFiles(next);
    await expect.poll(() => observed.length).toBe(1);
    expect(observed[0].type).toBe('unknown');
    await panel.getByRole('button', { name: 'CUSTOM-UI 다음 DXF 적용 승인', exact: true }).click();
    await page.locator('input[accept=".dxf,.dwg"]').setInputFiles(next);
    await expect.poll(() => observed.length).toBe(2);
    expect(observed[1].type).toBe('breaker'); expect(observed[1].ids).toHaveLength(1);
    await expect(page.getByText(/승인 정정 사례 적용: 1건/)).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('feedback-approved.png'), fullPage: true });
    await page.reload();
    await expect(panel.getByText(/CUSTOM-UI → breaker · 적용 승인/)).toBeVisible();
    await panel.getByRole('button', { name: 'CUSTOM-UI 승인 철회', exact: true }).click();
    await page.getByRole('button', { name: 'DXF 벡터 파싱 탭 선택', exact: true }).click();
    await page.locator('input[accept=".dxf,.dwg"]').setInputFiles(next);
    await expect.poll(() => observed.length).toBe(3);
    expect(observed[2].type).toBe('unknown'); expect(observed[2].ids).toEqual([]);
    await expect(panel.getByText(/철회됨/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(runtimeErrors).toEqual([]);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('feedback-revoked.png'), fullPage: true });
  });
}
