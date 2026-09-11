import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { DrawingDocumentV3 } from '../src/agent/drawing/types-v3';

// UI transport fixtures, not real-drawing accuracy claims. Production geometry
// recovery is covered by drawing-commercial-contract and the PDF/DXF gates.
function report(): DrawingDocumentV3 {
  const evidence = (id: string, x: number) => [{ evidenceId: id, pageIndex: 0,
    bounds: { x, y: 20, w: 30, h: 20 }, confidence: 0.95 }];
  const symbols: DrawingDocumentV3['evidenceGraph']['symbols'] = [
    { id: 'source', displayId: 'P01-S001', typeCandidates: ['breaker'], confirmedType: 'breaker',
      rawLabel: '차단기 QF1', certainty: 'confirmed', ports: [{ x: 40, y: 40 }], evidence: evidence('src-e', 20) },
    { id: 'motor', displayId: 'P01-S002', typeCandidates: ['motor'], confirmedType: 'motor',
      rawLabel: '모터 M1', certainty: 'confirmed', ports: [{ x: 340, y: 40 }], evidence: evidence('motor-e', 320) },
  ];
  const lines: DrawingDocumentV3['evidenceGraph']['lines'] = [0, 1, 2].map((index) => ({
    id: `line-${index}`, displayId: `P01-L00${index + 1}`, certainty: 'confirmed', geometrySource: 'observed',
    lineKind: 'power', path: [{ x: 40 + index * 100, y: 40 }, { x: 140 + index * 100, y: 40 }],
    junctions: [], crossovers: [], evidence: evidence(`line-${index}-e`, 40 + index * 100),
  }));
  return {
    schemaVersion: 3, documentHash: 'e'.repeat(64), title: 'AX 업무 보고서 합성 검사',
    createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z',
    pageCount: 1, requestedPages: 'all', jobStatus: 'COMPLETE',
    pages: [{ pageIndex: 0, status: 'complete', drawingKind: 'sld', vlmCalls: 0 }],
    coverageLedger: { plannedRegionCount: 1, regionsComplete: 1, regionsFailed: 0,
      regionsSkippedEmpty: 0, regions: [], rolesPresent: [], unresolvedRescans: 0, allPlannedFinished: true },
    evidenceGraph: { symbols, lines, texts: [], relations: [{ id: 'r1', displayId: 'P01-R001',
      from: 'source', to: 'motor', lineId: 'line-0', lineIds: lines.map((line) => line.id), certainty: 'confirmed',
      terminalPath: { version: 1, from: { x: 40, y: 40 }, to: { x: 340, y: 40 } },
      evidence: [...symbols.flatMap((symbol) => symbol.evidence), ...lines.flatMap((line) => line.evidence)] }] },
    crossPageRelations: [], equipmentCounts: [], recommendations: [], unresolvedItems: [], userCorrections: [],
    ratedValues: [{ id: 'rated-1', displayId: 'P01-V001', field: '전압', raw: '380V',
      normalized: { value: 380, unit: 'V' }, equipmentId: 'motor', certainty: 'confirmed', evidence: evidence('motor-e', 320) }],
    calculations: [{ id: 'calc-1', calculatorId: 'voltage-drop', label: '전압강하 합성 결과', value: 1.25,
      unit: '%', compliant: null, receiptHash: 'c'.repeat(64), evidenceIds: ['motor-e'], note: '화면 계약 확인용 값' }],
    verification: { claimsComplete: true, documentStatus: 'COMPLETE', holdReasons: [], evidenceTraceRate: 1, verified95: false },
  };
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`drawing work product: full route, CSV, detached print window (${viewport.width}px)`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.addInitScript(() => {
      // Native print dialogs are not part of rendering QA.
      window.print = () => { document.documentElement.dataset.printRequested = 'true'; };
    });
    await page.route('**/api/drawing-jobs', (route) => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { jobId: 'ui-export-fixture', status: 'COMPLETE', document: report() } }),
    }));
    await page.goto('/tools/sld');
    await expect(page.getByRole('heading', { name: '도면 분석', exact: true })).toBeVisible();
    const input = page.locator('input[type="file"][accept=".pdf,.dxf,.dwg,image/*"]');
    await input.setInputFiles({ name: 'public-ui-fixture.dxf', mimeType: 'application/dxf',
      buffer: Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n') });
    await expect(input).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'AX 업무 보고서 합성 검사' })).toBeVisible();
    await page.getByRole('button', { name: '관계', exact: true }).click();
    const relation = page.getByRole('button', { name: /^P01-R001 ·/ });
    await expect(relation).toContainText('P01-L001 → P01-L002 → P01-L003');
    await expect(relation).toContainText('단자 경로 확인');
    await relation.click();
    for (const id of ['P01-L001', 'P01-L002', 'P01-L003']) {
      await expect(page.getByRole('button', { name: `${id} 선로`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    const widths = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
    await page.screenshot({ path: testInfo.outputPath('recovered-result.png'), fullPage: true });

    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV 체크리스트', exact: true }).click();
    const download = await downloadEvent;
    const filename = await download.path();
    expect(filename).not.toBeNull();
    const csv = await readFile(filename!, 'utf8');
    expect(csv).toContain('차단기 QF1');
    expect(csv).toContain('P01-L003');
    expect(csv).toContain('380 V');
    expect(csv).toContain('c'.repeat(64));
    expect(csv).toContain('e'.repeat(64));

    const popupEvent = page.waitForEvent('popup');
    await page.getByRole('button', { name: '인쇄용 보고서', exact: true }).click();
    const popup = await popupEvent;
    popup.on('pageerror', (error) => errors.push(error.message));
    await expect(popup).toHaveTitle('ESA 도면 판독 보고서');
    await expect(popup.getByRole('heading', { name: 'ESA 도면 판독 보고서' })).toBeVisible();
    await expect(popup.locator('body')).toContainText('P01-L003');
    await expect(popup.locator('body')).toContainText('380 V');
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await expect(page.getByRole('alert', { name: '빠른 도면 분석 오류' })).toHaveCount(0);
    await popup.screenshot({ path: testInfo.outputPath('readable-error.png'), fullPage: true });
    expect(errors).toEqual([]);
    await popup.close();
  });
}
