import { test, expect } from '@playwright/test';

// Transport/UI regressions only. The real DXF parser, company symbol storage,
// and PDF fixtures remain covered by smoke.spec.ts and gate:pdf.
const formats = [
  { name: 'DXF', extension: 'dxf', mime: 'application/dxf', endpoint: '/api/dxf', accept: '.dxf,.dwg' },
  { name: 'PDF', extension: 'pdf', mime: 'application/pdf', endpoint: '/api/pdf-drawing', accept: '.pdf' },
] as const;
const failures = [
  {
    name: 'structured-429', status: 429, contentType: 'application/json',
    body: JSON.stringify({ success: false, error: { code: 'ESVA-9429', message: 'Too many requests', retryAfter: 17 } }),
    expected: '요청이 너무 많습니다. 17초 후 다시 시도해주세요.',
  },
  {
    name: 'legacy-string', status: 400, contentType: 'application/json',
    body: JSON.stringify({ success: false, error: '도면 형식을 확인해주세요.' }),
    expected: '도면 형식을 확인해주세요.',
  },
  {
    name: 'invalid-json', status: 503, contentType: 'text/html',
    body: '<html>Temporary upstream failure</html>', expected: null,
  },
] as const;

for (const format of formats) {
  for (const failure of failures) {
    test(`${format.name} ${failure.name}: readable error and same-file recovery`, async ({ page }, testInfo) => {
      const runtimeErrors: string[] = [];
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      if (format.name === 'DXF' && failure.name === 'structured-429') {
        await page.setViewportSize({ width: 390, height: 844 });
      }
      // The independent V3 service is not part of this transport test; retain a
      // truthful unavailable status rather than inventing a completed document.
      await page.route('**/api/drawing-jobs', (route) => route.fulfill({
        status: 503, contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { message: 'V3 검사는 별도 시나리오에서 수행합니다.' } }),
      }));
      let requests = 0;
      await page.route(`**${format.endpoint}`, (route) => {
        requests += 1;
        if (requests === 1) return route.fulfill({
          status: failure.status, contentType: failure.contentType, body: failure.body,
        });
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              components: [{ id: 'UI-FIXTURE-1', type: 'breaker', label: 'UI 회귀 검사 기기', position: { x: 50, y: 50 } }],
              connections: [], suggestedCalculations: [], confidence: 0.9,
              rawDescription: '합성 화면 응답이며 도면 정확도 평가가 아닙니다.',
            },
            calcChain: [], review: null,
          }),
        });
      });
      await page.goto('/tools/sld');
      if (format.name === 'PDF') {
        await page.getByRole('button', { name: 'PDF 벡터 파싱 탭 선택', exact: true }).click();
      } else {
        await expect(page.getByText('AutoCAD·ZWCAD·CADian 호환 DXF (최대 16MB)', { exact: false })).toBeVisible();
      }
      const input = page.locator(`input[type="file"][accept="${format.accept}"]`);
      const file = {
        name: `ui-transport-fixture.${format.extension}`, mimeType: format.mime,
        buffer: Buffer.from('Non-sensitive transport fixture; requests are intercepted by this test.'),
      };
      await input.setInputFiles(file);
      const alert = page.getByRole('alert', { name: '빠른 도면 분석 오류', exact: true });
      await expect(alert).toHaveText(failure.expected ?? `${format.name} 파싱 실패`);
      await expect(page.getByRole('heading', { name: '분석 결과', exact: true })).toHaveCount(0);
      await expect(input).toHaveValue('');
      expect(requests).toBe(1);
      if (failure.name === 'structured-429') {
        await alert.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('readable-error.png'), fullPage: true });
      }

      // Reselect exactly the same file without resetting the input in the test.
      // The application must clear the native value so a real chooser fires change.
      await input.setInputFiles(file);
      await expect(page.getByRole('heading', { name: '분석 결과', exact: true })).toBeVisible();
      await expect(alert).toHaveCount(0);
      await page.getByRole('tab', { name: '기기 1', exact: true }).click();
      await expect(page.getByText('UI 회귀 검사 기기', { exact: true })).toBeVisible();
      expect(requests).toBe(2);
      expect(runtimeErrors).toEqual([]);
      if (failure.name === 'structured-429') {
        await page.screenshot({ path: testInfo.outputPath('recovered-result.png'), fullPage: true });
      }
    });
  }
}
