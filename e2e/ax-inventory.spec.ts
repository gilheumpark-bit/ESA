import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { classificationDocument, classificationDxf } from '../src/engine/topology/test-support/symbol-classification-fixture';
import { applyDrawingCorrection } from '../src/agent/drawing/apply-drawing-correction';

for (const width of [1440, 390]) {
  test(`AX inventory exports current interpretations and updates after correction (${width}px)`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    let document = classificationDocument(); let attempts = 0;
    const candidate = document.evidenceGraph.symbols.find((symbol) => symbol.classification?.method === 'family-context')!;
    const id = candidate.displayId;
    // Mixed/legacy results remain visible but must not link to a nonexistent
    // classification card. The genuine classifier/correction path stays intact.
    document.evidenceGraph.symbols.push({ ...candidate, id: 'legacy-unclassified', displayId: 'P01-S999', rawLabel: '',
      classification: undefined, evidence: candidate.evidence.map((entry) => ({ ...entry, evidenceId: 'legacy-evidence',
        bounds: { ...entry.bounds, x: entry.bounds.x + 100 } })) });
    await page.route('**/api/drawing-jobs', (route) => route.fulfill({ json: { success: true, data: { jobId: 'ax-inventory-ui', status: 'COMPLETE', document } } }));
    await page.route('**/api/drawing-jobs/ax-inventory-ui/corrections', (route) => {
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 503, json: { success: false, error: { message: '합성 AX 수정 장애' } } });
      document = applyDrawingCorrection(document, { ...route.request().postDataJSON(), correctedBy: 'synthetic-reviewer' });
      return route.fulfill({ json: { success: true, data: { document, resumeAvailable: false } } });
    });
    await page.goto('/tools/sld');
    await page.locator('input[accept=".pdf,.dxf,.dwg,image/*"]').setInputFiles({ name: 'ax-inventory.dxf', mimeType: 'application/dxf', buffer: Buffer.from(classificationDxf()) });
    await expect(page.getByRole('heading', { name: '반복 심볼 분류 합성 도면', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'AX 기기표', exact: true }).click();
    const inventory = page.getByRole('region', { name: 'AX 기기표', exact: true });
    await expect(inventory.getByRole('status')).toContainText('자동 분류 활용 1건');
    await expect(inventory).toContainText('원본 unknown / unread');
    await expect(inventory).toContainText('물리 장비 대수나 정확도가 아닙니다');
    await expect(inventory.getByText('P01-S999 · 종류 미확정', { exact: true })).toBeVisible();
    await expect(inventory.getByRole('button', { name: 'P01-S999 분류·수정 열기', exact: true })).toHaveCount(0);
    expect(attempts).toBe(0);
    await inventory.getByRole('checkbox', { name: '기기표 사용 가능 항목만', exact: true }).check();
    await expect(inventory.getByText('P01-S999 · 종류 미확정', { exact: true })).toHaveCount(0);
    const pending = page.waitForEvent('download'); await inventory.getByRole('button', { name: '사용 가능 기기표 CSV', exact: true }).click();
    const download = await pending, before = await readFile((await download.path())!, 'utf8');
    expect(before).toContain('자동 분류 활용'); expect(before).toContain('breaker'); expect(before).toContain('unread');
    expect(before).toContain(document.documentHash); expect(before).toContain('물리 대수 아님'); expect(before).not.toContain('P01-S999');
    const directory = process.env.AX_SCREEN_DIR ?? info.outputDir; await mkdir(directory, { recursive: true });
    await inventory.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${directory}/ax-inventory-before-${width}.png`, animations: 'disabled' });
    await inventory.getByRole('button', { name: `${id} 분류·수정 열기`, exact: true }).click();
    const classification = page.getByRole('region', { name: '심볼 분류 결과', exact: true });
    await classification.getByRole('button', { name: `${id} 분류 수정`, exact: true }).click();
    const field = classification.getByRole('combobox', { name: `${id} 분류 수정값`, exact: true }); await field.selectOption('fuse');
    await classification.getByRole('button', { name: '종류 수정 반영', exact: true }).click();
    await expect(classification.getByRole('alert')).toContainText('합성 AX 수정 장애'); await expect(field).toHaveValue('fuse');
    await classification.getByRole('button', { name: '종류 수정 반영', exact: true }).click();
    await expect(classification.getByRole('status')).toContainText('자동 분류 0건');
    await page.getByRole('button', { name: 'AX 기기표', exact: true }).click();
    await expect(inventory).toContainText(`${id} · fuse`); await expect(inventory.getByRole('status')).toContainText('자동 분류 활용 0건');
    const next = page.waitForEvent('download'); await inventory.getByRole('button', { name: '전체 기기표 CSV', exact: true }).click();
    const file = await next; const after = await readFile((await file.path())!, 'utf8');
    expect(after).toContain('fuse'); expect(after).not.toContain('자동 분류 활용'); expect(after).toContain('P01-S999'); expect(attempts).toBe(2);
    const state = await page.evaluate(() => ({ pathname: location.pathname, title: window.document.title, width: innerWidth,
      scrollWidth: window.document.documentElement.scrollWidth, mainTextLength: window.document.querySelector('main')?.textContent?.length ?? 0 }));
    expect(state.pathname).toBe('/tools/sld'); expect(state.title.length).toBeGreaterThan(0); expect(state.mainTextLength).toBeGreaterThan(100);
    expect(state.scrollWidth).toBeLessThanOrEqual(width); expect(errors).toEqual([]);
    await inventory.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${directory}/ax-inventory-after-${width}.png`, animations: 'disabled' });
    await writeFile(`${directory}/ax-inventory-${width}.json`, JSON.stringify({ ...state, errors, correctionRequests: attempts,
      scope: 'Synthetic HTTP with production classifier, adapter, correction and work-product functions.' }, null, 2));
  });
}
