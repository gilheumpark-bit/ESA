import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { feedbackDocument, feedbackDxf } from '../src/agent/drawing/test-support/feedback-fixture';
import { applyDrawingCorrection } from '../src/agent/drawing/apply-drawing-correction';
import { parseDxfToSLD } from '../src/engine/topology/dxf-parser';
import { parseSymbolLibrary, type SymbolLibrary } from '../src/lib/symbol-library-contract';

// Real parser/correction/library functions with synthetic local HTTP transport.
// No live login, AI provider, customer drawing or company approval server.
for (const width of [1440, 390]) {
  test(`human correction approval reaches the next DXF and revocation removes it (${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '합성 피드백 검사의 비연결 서비스입니다.' } }) }));
    let document = feedbackDocument();
    const target = document.evidenceGraph.symbols[0];
    expect(target.sourceSymbol?.fingerprint).toMatch(/^fp2:/);
    document.unresolvedItems = [{ id: 'unknown-block', displayId: target.displayId, code: 'UNREADABLE_SYMBOL',
      pageIndex: 0, bounds: target.evidence[0].bounds, candidates: ['breaker', 'fuse'], note: '합성 미등록 블록' }];
    await page.route('**/api/drawing-jobs', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { jobId: 'feedback-ui', status: 'COMPLETE', document } }) }));
    await page.route('**/api/drawing-jobs/feedback-ui/corrections', (r) => {
      const body = r.request().postDataJSON();
      document = applyDrawingCorrection(document, { ...body, correctedBy: 'synthetic-reviewer' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { document, resumeAvailable: false } }) });
    });
    const parsedTypes: string[] = [];
    await page.route('**/api/dxf', async (route) => {
      const request = route.request();
      const form = await new Request(request.url(), { method: 'POST', headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!) }).formData();
      const file = form.get('file') as File;
      let library: SymbolLibrary | undefined;
      const part = form.get('symbolLibrary');
      if (typeof part === 'string') {
        const validated = parseSymbolLibrary(JSON.parse(part));
        expect(validated.ok).toBe(true);
        library = validated.library;
      }
      const result = parseDxfToSLD(await file.text(), { symbolLibrary: library });
      parsedTypes.push(result.components[0].type);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: result, calcChain: [] }) });
    });
    await page.goto('/tools/sld');
    const initial = { name: 'feedback-source.dxf', mimeType: 'application/dxf', buffer: Buffer.from(feedbackDxf()) };
    await page.locator('input[accept=".pdf,.dxf,.dwg,image/*"]').setInputFiles(initial);
    await page.getByRole('button', { name: '미확정 1', exact: true }).click();
    await page.getByRole('button', { name: 'breaker 선택', exact: true }).click();
    const panel = page.getByRole('region', { name: '사람 수정의 다음 분석 반영', exact: true });
    await panel.getByLabel('피드백 적용 회사', { exact: true }).fill('UI 피드백 회사');
    await panel.getByRole('button', { name: `${target.displayId} 재사용 후보 등록`, exact: true }).click();
    await expect(panel).toContainText('대기 1 · 승인 0 · 취소 0');
    await expect(panel.getByRole('button', { name: 'ZZ-CUSTOM-7 재사용 승인', exact: true })).toBeDisabled();
    const next = (offset: number) => ({ name: `next-${offset}.dxf`, mimeType: 'application/dxf', buffer: Buffer.from(feedbackDxf(offset)) });
    await page.locator('input[accept=".dxf,.dwg"]').setInputFiles(next(20));
    await expect.poll(() => parsedTypes).toEqual(['unknown']);
    await panel.getByLabel('검토·취소 사유', { exact: true }).fill('회사 원본 지문과 기기 종류 확인');
    await panel.getByRole('checkbox', { name: '회사와 원본 지문·기기 종류 및 재사용 범위를 확인했습니다.', exact: true }).check();
    await panel.getByRole('button', { name: 'ZZ-CUSTOM-7 재사용 승인', exact: true }).click();
    await expect(panel).toContainText('대기 0 · 승인 1 · 취소 0');
    await page.locator('input[accept=".dxf,.dwg"]').setInputFiles(next(40));
    await expect.poll(() => parsedTypes).toEqual(['unknown', 'breaker']);
    await page.getByRole('tab', { name: '기기 1', exact: true }).click();
    await expect(page.getByText('종류: breaker · 검토 필요', { exact: true })).toBeVisible();
    // Applying approved knowledge classifies the type; it does not forge an AI
    // confidence/quality certificate for every field of the quick result.
    const catalog = await page.evaluate(() => JSON.parse(localStorage.getItem('esva-symbol-libraries-v1')!));
    expect(catalog.libraries[0].feedback[0].status).toBe('approved');
    expect(catalog.libraries[0].feedback[0].sourceDocumentHash).toBe(document.documentHash);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('feedback-approved.png'), fullPage: true });

    await page.reload();
    await expect(panel).toContainText('대기 0 · 승인 1 · 취소 0');
    await panel.getByLabel('검토·취소 사유', { exact: true }).fill('규칙 재검토를 위해 재사용 중단');
    await panel.getByRole('checkbox', { name: '회사와 원본 지문·기기 종류 및 재사용 범위를 확인했습니다.', exact: true }).check();
    await panel.getByRole('button', { name: 'ZZ-CUSTOM-7 승인 취소', exact: true }).click();
    await expect(panel).toContainText('대기 0 · 승인 0 · 취소 1');
    await page.locator('input[accept=".dxf,.dwg"]').setInputFiles(next(60));
    await expect.poll(() => parsedTypes).toEqual(['unknown', 'breaker', 'unknown']);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '내보내기', exact: true }).click();
    const download = await pending;
    const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(exported.feedback[0].status).toBe('revoked');
    expect(exported.feedback[0].decisions.map((d: { action: string }) => d.action)).toEqual(['approve', 'revoke']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('feedback-revoked.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}
