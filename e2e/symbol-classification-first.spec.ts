import { test, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { classificationDxf, classificationDocument, parsedClassification } from '../src/engine/topology/test-support/symbol-classification-fixture';
import { applyDrawingCorrection } from '../src/agent/drawing/apply-drawing-correction';
import type { SLDAnalysis } from '../src/lib/sld-recognition';

// Actual classifier, adapter and correction functions; synthetic transport only.
// No customer drawing, account permission assertion or paid model request.
for (const width of [1440, 390]) {
  test(`classify first, explain and correct only exceptions (${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    let document = classificationDocument();
    const candidateId = document.evidenceGraph.symbols.find((s) => s.classification?.method === 'family-context')!.displayId;
    let correctionCalls = 0;
    await page.route('**/api/drawing-jobs', (route) => route.fulfill({ json: { success: true,
      data: { jobId: 'symbol-classification-ui', status: 'COMPLETE', document } } }));
    await page.route('**/api/drawing-jobs/symbol-classification-ui/corrections', (route) => {
      correctionCalls++;
      const input = route.request().postDataJSON();
      if (correctionCalls === 1) return route.fulfill({ status: 503, json: { success: false, error: { message: '합성 저장 오류: 수정값 유지' } } });
      document = applyDrawingCorrection(document, { ...input, correctedBy: 'synthetic-reviewer' });
      return route.fulfill({ json: { success: true, data: { document, resumeAvailable: false } } });
    });
    await page.goto('/tools/sld');
    await page.locator('input[accept=".pdf,.dxf,.dwg,image/*"]').setInputFiles({ name: 'synthetic-classification.dxf',
      mimeType: 'application/dxf', buffer: Buffer.from(classificationDxf()) });
    await expect(page.getByRole('heading', { name: '반복 심볼 분류 합성 도면', exact: true })).toBeVisible();
    const results = page.getByRole('region', { name: '심볼 분류 결과', exact: true });
    await expect(results).toBeVisible();
    await expect(results.getByRole('status')).toContainText('유사 형상·문맥 자동 분류 1건');
    await expect(results).toContainText('항목마다 승인할 필요는 없습니다');
    expect(correctionCalls).toBe(0);
    await results.getByText(`${candidateId} 분류 근거`, { exact: true }).click();
    await expect(results).toContainText('같은 연결점·배치·연결 수');
    await expect(results).toContainText('형상 유사도');
    await results.getByRole('button', { name: `${candidateId} 원본 보기`, exact: true }).click();
    await results.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`classified-${width}.png`), fullPage: false, animations: 'disabled' });
    await results.getByRole('checkbox', { name: '분류 예외만 보기', exact: true }).check();
    await expect(results.getByText(/표시 조건에 해당하는 항목이 없습니다/)).toBeVisible();
    // Engineering unknowns are not silently removed just because a classification is shown.
    await expect(page.getByRole('button', { name: '미확정 1', exact: true })).toBeVisible();
    await results.getByRole('checkbox', { name: '분류 예외만 보기', exact: true }).uncheck();
    await results.getByRole('button', { name: `${candidateId} 분류 수정`, exact: true }).click();
    const select = results.getByRole('combobox', { name: `${candidateId} 분류 수정값`, exact: true });
    await select.selectOption('fuse');
    await results.getByRole('button', { name: '종류 수정 반영', exact: true }).click();
    await expect(results.getByRole('alert')).toContainText('합성 저장 오류'); await expect(select).toHaveValue('fuse');
    await results.getByRole('button', { name: '종류 수정 반영', exact: true }).click();
    await expect(results).toContainText('퓨즈'); await expect(results.getByRole('status')).toContainText('자동 분류 0건');
    expect(correctionCalls).toBe(2);
    expect(document.evidenceGraph.symbols.find((symbol) => symbol.displayId === candidateId)?.classification?.method).toBe('human-correction');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV 체크리스트', exact: true }).click();
    const downloaded = await pending, csv = await readFile((await downloaded.path())!, 'utf8');
    expect(csv).toContain('심볼 분류'); expect(csv).toContain('human-correction'); expect(csv).toContain('정격·결선 확정과 별개');
    const identity = await page.evaluate(() => ({ url: location.pathname, title: document.title,
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth, textLength: document.querySelector('main')?.textContent?.length ?? 0 }));
    expect(identity.url).toBe('/tools/sld'); expect(identity.title.length).toBeGreaterThan(0);
    expect(identity.textLength).toBeGreaterThan(100); expect(identity.scrollWidth).toBeLessThanOrEqual(width); expect(errors).toEqual([]);
    const evidence = process.env.SYMBOL_SCREEN_DIR ?? info.outputDir;
    await mkdir(evidence, { recursive: true });
    await results.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/classification-corrected-${width}.png`, fullPage: false, animations: 'disabled' });
    await writeFile(`${evidence}/classification-${width}.json`, JSON.stringify({ ...identity, errors, correctionCalls, newModelCalls: 0, source: 'synthetic-http-with-production-classifier' }, null, 2));
  });
}

test('quick results expose resolved and conflicting symbols without an approval questionnaire', async ({ page }) => {
  const analysis: SLDAnalysis = parsedClassification();
  const candidate = analysis.components.find((c) => c.classification?.method === 'family-context')!;
  analysis.components.push({ ...candidate, id: 'exception', label: 'SPECIAL-EXCEPTION', classification: {
    ...candidate.classification!, status: 'review', selectedType: undefined, method: 'unresolved', reasons: ['SPECIAL_MARKING'],
  } });
  await page.route('**/api/drawing-jobs', (route) => route.fulfill({ status: 503, json: { success: false, error: { message: '독립 정밀 검사는 별도 사례입니다.' } } }));
  await page.route('**/api/dxf', (route) => route.fulfill({ json: { success: true, data: analysis, calcChain: [] } }));
  await page.goto('/tools/sld');
  await page.locator('input[accept=".dxf,.dwg"]').setInputFiles({ name: 'quick-classification.dxf', mimeType: 'application/dxf', buffer: Buffer.from(classificationDxf()) });
  const results = page.getByRole('region', { name: '빠른 심볼 분류 결과', exact: true });
  await expect(results).toBeVisible();
  await results.getByRole('checkbox', { name: '분류 예외만 보기', exact: true }).check();
  await expect(results).toContainText('SPECIAL-EXCEPTION');
  await expect(results.getByText(`${candidate.id} 분류 근거`, { exact: true })).toHaveCount(0);
  await results.getByText('exception 분류 근거', { exact: true }).click();
  await expect(results).toContainText('특수·예비·누전·절체');
});
