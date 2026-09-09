import { test, expect, type Page } from '@playwright/test';

async function markCurrentDocument(page: Page) {
  await page.evaluate(() => Reflect.set(window, '__esaNavigationFixture', 'same-document'));
}
async function expectSameDocument(page: Page) {
  expect(await page.evaluate(() => Reflect.get(window, '__esaNavigationFixture'))).toBe('same-document');
}

test('home search keeps the browser document while navigating to the encoded query', async ({ page }) => {
  // The test checks navigation, not external search or AI answer correctness.
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ success: false, error: { message: '합성 이동 검사의 비연결 서비스입니다.' } }) }));
  await page.goto('/');
  await markCurrentDocument(page);
  const query = '배전반 점검 순서';
  await page.getByRole('searchbox', { name: '질의 입력', exact: true }).fill(query);
  await page.getByRole('searchbox', { name: '질의 입력', exact: true }).press('Enter');
  await expect(page).toHaveURL((url) => url.pathname === '/search' && url.searchParams.get('q') === query && url.searchParams.get('answer') === '1');
  await expectSameDocument(page);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.getByRole('button', { name: '질의 실행', exact: true })).toBeEnabled();
});

for (const sample of [
  { name: '전압강하 계산 (380V, 100A, 50m, 35sq)', target: '/calc/voltage-drop/voltage-drop' },
  { name: '케이블 선정 (200A, 3상, XLPE)', target: '/calc/cable/cable-sizing' },
  { name: '차단기 선정 (부하 150A)', target: '/calc/protection/breaker-sizing' },
]) {
  test(`empty history example opens its canonical calculator without reload: ${sample.target}`, async ({ page }) => {
    await page.goto('/history');
    await expect(page.getByText('계산 이력이 없습니다', { exact: true })).toBeVisible();
    await markCurrentDocument(page);
    await page.getByRole('button', { name: sample.name, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === sample.target);
    await expect(page.getByRole('button', { name: '계산하기', exact: true })).toBeVisible();
    await expectSameDocument(page);
  });
}
