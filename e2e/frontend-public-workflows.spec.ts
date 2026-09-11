import { test, expect, type Page } from '@playwright/test';

async function completeVisibleForm(page: Page) {
  for (const input of await page.locator('form input').all()) {
    if (!(await input.isVisible()) || !(await input.isEnabled())) continue;
    const type = await input.getAttribute('type');
    if (type === 'number') {
      const minimum = await input.getAttribute('min');
      const maximum = await input.getAttribute('max');
      const current = await input.inputValue();
      const min = minimum === null ? -Infinity : Number(minimum);
      const max = maximum === null ? Infinity : Number(maximum);
      if (!current || Number(current) < min || Number(current) > max) {
        await input.fill(String(Math.min(max, Math.max(min, 1))));
      }
    } else if ((!type || type === 'text') && !(await input.inputValue())) await input.fill('UI');
  }
  for (const select of await page.locator('form select').all()) {
    if (!(await select.isVisible()) || !(await select.isEnabled()) || await select.inputValue()) continue;
    const value = await select.locator('option:not([disabled])').evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value).find(Boolean));
    if (value) await select.selectOption(value);
  }
}

test('every calculator in the visible catalog submits, renders a receipt and resets', async ({ page }, info) => {
  test.setTimeout(240_000);
  const runtimeErrors: string[] = [];
  const completed: string[] = [];
  page.on('pageerror', (e) => runtimeErrors.push(e.message));
  let currentCalc = '';
  let requests = 0;
  // This is a form transport test, not a live standards/API benchmark. Ancillary
  // API reads must not exhaust the shared production rate bucket used by the
  // independent real DXF smoke test (run 34173387462). Real API tests stay intact.
  await page.route('**/api/**', (route) => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ success: false, error: { message: '합성 폼 검사에서 연결하지 않은 보조 서비스입니다.' } }),
  }));
  await page.route('**/api/calculate', (route) => {
    const body = route.request().postDataJSON();
    expect(body.calculatorId).toBe(currentCalc);
    expect(body.inputs).toBeTruthy();
    requests++;
    // Deterministic transport fixture: this test does not replace calculator accuracy tests.
    const result = { value: 12.5, unit: 'UI' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
      result,
      receipt: { id: `ui-${currentCalc}`, calcId: currentCalc, countryCode: 'KR', appliedStandard: 'UI fixture', unitSystem: 'SI',
        difficultyLevel: 'intermediate', inputs: body.inputs, result, steps: [], formulaUsed: 'x=12.5', standardsUsed: [], warnings: [], recommendations: [],
        disclaimerText: '합성 화면 검증 결과이며 기술 판정이 아닙니다.', disclaimerVersion: 'UI', calculatedAt: '2026-01-01T00:00:00Z',
        standardVersion: 'UI', engineVersion: 'UI', isStandardCurrent: false, receiptHash: 'a'.repeat(64), isPublic: false },
    } }) });
  });
  await page.goto('/calc');
  const routes = [...new Set(await page.locator('main a[href^="/calc/"]').evaluateAll((links) => links.map((a) => a.getAttribute('href')!)))];
  expect(routes.length).toBeGreaterThan(20);
  for (const href of routes) {
    await test.step(href, async () => {
      currentCalc = href.split('?')[0].split('/').at(-1)!;
      await page.goto(href);
      await expect(page.locator('form')).toBeVisible();
      await completeVisibleForm(page);
      const before = requests;
      await page.getByRole('button', { name: '계산하기', exact: true }).click();
      await expect(page.locator('.receipt-container')).toBeVisible();
      expect(requests).toBe(before + 1);
      await page.getByRole('button', { name: '재계산', exact: true }).click();
      await expect(page.locator('.receipt-container')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '계산하기', exact: true })).toBeEnabled();
      completed.push(href);
    });
  }
  expect(runtimeErrors).toEqual([]);
  await info.attach('calculator-control-coverage', { body: JSON.stringify({ routes, completed, requests }), contentType: 'application/json' });
  console.log('CALCULATOR_CONTROLS', JSON.stringify({ catalog: routes.length, completed: completed.length, requests }));
});

for (const width of [1440, 390]) {
  test(`every standards group and detail opens and closes (${width}px)`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/standards');
    const groupButtons = page.locator('main button[aria-expanded]');
    await expect.poll(() => groupButtons.count()).toBeGreaterThan(20);
    const groups = await groupButtons.count();
    expect(groups).toBeGreaterThan(20);
    let entries = 0;
    for (let i = 0; i < groups; i++) {
      const group = groupButtons.nth(i);
      const wrapper = group.locator('..');
      await group.click();
      await expect(group).toHaveAttribute('aria-expanded', 'true');
      const children = wrapper.locator('button');
      const count = await children.count();
      expect(count).toBeGreaterThan(1);
      for (let j = 1; j < count; j++) {
        await children.nth(j).click();
        const close = page.getByRole('button', { name: '표준 상세 닫기', exact: true });
        await expect(close).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await close.click();
        await expect(close).toHaveCount(0);
        entries++;
      }
      await group.click();
      await expect(group).toHaveAttribute('aria-expanded', 'false');
    }
    await info.attach('standards-control-coverage', { body: JSON.stringify({ width, groups, entries }), contentType: 'application/json' });
    console.log('STANDARDS_CONTROLS', JSON.stringify({ width, groups, entries }));
    await page.screenshot({ path: info.outputPath('recovered-result.png'), fullPage: false });
  });
}

test('contact validates fields, shows structured failure, retries and starts another message', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/contact', (route) => {
    requests++;
    return route.fulfill({ status: requests === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(requests === 1
      ? { success: false, error: { message: '합성 문의 서버 실패' } } : { success: true }) });
  });
  await page.goto('/contact');
  await page.getByRole('button', { name: '문의 보내기', exact: true }).click();
  expect(requests).toBe(0);
  await page.locator('input[name="name"]').fill('UI 검증');
  await page.locator('input[name="email"]').fill('audit@example.invalid');
  const subject = page.locator('select[name="subject"]');
  const choice = await subject.locator('option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value).find(Boolean));
  await subject.selectOption(choice!);
  await page.locator('textarea[name="message"]').fill('외부 발송 없는 합성 UI 검증입니다.');
  await page.getByRole('button', { name: '문의 보내기', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('합성 문의 서버 실패');
  await page.getByRole('button', { name: '문의 보내기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '문의가 접수되었습니다', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '추가 문의하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '문의 보내기', exact: true })).toBeEnabled();
  expect(requests).toBe(2);
});

test('on-premise controls change values, save, restore, reset and explain missing login', async ({ page }) => {
  await page.goto('/settings/onpremise');
  const mode = page.getByRole('switch', { name: 'On-Premise 모드', exact: true });
  await mode.click();
  await expect(mode).toHaveAttribute('aria-checked', 'true');
  for (const name of ['Ollama', 'vLLM', 'LocalAI', 'OpenAI-compat']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  for (const name of ['qwen3:30b', 'llama4:scout', 'mistral-small3.1:latest', 'gemma3:27b']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('#onprem-model-name')).toHaveValue(name);
  }
  await page.locator('#onprem-server-url').fill('http://127.0.0.1:11434');
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장 완료', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#onprem-server-url')).toHaveValue('http://127.0.0.1:11434');
  await expect(mode).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#onprem-model-name')).toHaveValue('gemma3:27b');
  await page.getByRole('button', { name: '연결 테스트', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('로그인 후');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(mode).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#onprem-model-name')).toHaveValue('qwen3:30b');
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장 완료', exact: true })).toBeVisible();
});
