import { test, expect } from '@playwright/test';
import { syntheticAuth, UI_USER, UI_EMAIL } from './helpers/synthetic-auth';

test('project creation waits for restored identity, then retries a real UI failure', async ({ page }, info) => {
  // The token is an invalid-signature browser fixture; all external/API traffic
  // remains intercepted. No live account, project or server authorization exists.
  await syntheticAuth(page);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requested = new Promise<void>((resolve) => { entered = resolve; });
  await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
    entered();
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{
      localId: UI_USER, email: UI_EMAIL, emailVerified: true, displayName: 'UI 검증 사용자',
      providerUserInfo: [{ providerId: 'google.com', rawId: UI_USER, email: UI_EMAIL }],
      createdAt: String(Date.now() - 10000), lastLoginAt: String(Date.now()),
    }] }) });
  });
  let calls = 0;
  await page.route('**/api/projects', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    expect(route.request().postDataJSON()).toEqual({ name: '인증 대기 검사', description: '합성 입력' });
    calls++;
    return route.fulfill({ status: calls === 1 ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(calls === 1 ? { error: 'synthetic failure' } : { id: 'ui-project' }) });
  });
  await page.route('**/api/projects/ui-project', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: 'ui-project', name: '인증 대기 검사', ownerId: UI_USER, status: 'active', description: '합성 입력',
    members: [{ userId: UI_USER, email: UI_EMAIL, role: 'owner', joinedAt: '2026-01-01T00:00:00Z' }],
    calculations: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }) }));
  try {
    await page.goto('/projects/new');
    await requested;
    await expect(page.getByRole('main').getByRole('status')).toHaveText('로그인 상태를 확인하고 있습니다.');
    await expect(page.getByRole('button', { name: '프로젝트 생성', exact: true })).toHaveCount(0);
    expect(calls).toBe(0);
    release();
    await page.getByLabel('프로젝트 이름').fill('인증 대기 검사');
    await page.getByLabel('설명 (선택)').fill('합성 입력');
    await page.getByRole('button', { name: '프로젝트 생성', exact: true }).click();
    await expect(page.getByText('프로젝트 생성에 실패했습니다', { exact: true })).toBeVisible();
    expect(calls).toBe(1);
    await page.getByRole('button', { name: '프로젝트 생성', exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/ui-project$/);
    await expect(page.getByRole('heading', { name: '인증 대기 검사', exact: true })).toBeVisible();
    expect(calls).toBe(2);
    await page.screenshot({ path: info.outputPath('recovered-result.png'), fullPage: false });
  } finally {
    release();
  }
});
