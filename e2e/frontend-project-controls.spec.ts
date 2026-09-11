import { test, expect, type Page } from '@playwright/test';
import { syntheticAuth, UI_USER, UI_EMAIL } from './helpers/synthetic-auth';

function fixtureProject() {
  return { id: 'ui-project', name: 'UI 검증 프로젝트', description: '회사 데이터가 아닌 합성 프로젝트', status: 'active', ownerId: UI_USER,
    members: [{ userId: UI_USER, email: UI_EMAIL, role: 'owner', joinedAt: '2026-01-01T00:00:00Z' },
      { userId: 'ui-member', email: 'member@example.invalid', role: 'viewer', joinedAt: '2026-01-01T00:00:00Z' }],
    calculations: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
}
async function openProject(page: Page, failAction?: string) {
  await syntheticAuth(page);
  const model = fixtureProject();
  const actions: unknown[] = [];
  await page.route('**/api/projects/ui-project', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(model) });
    const body = request.method() === 'DELETE' ? { action: 'delete' } : request.postDataJSON();
    actions.push(body);
    if (body.action === failAction) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: '합성 저장 서비스 실패' } }) });
    if (body.action === 'inviteMember') model.members.push({ userId: 'ui-invited', email: body.email, role: body.role, joinedAt: '' });
    if (body.action === 'removeMember') model.members = model.members.filter((m) => m.userId !== body.userId);
    if (body.action === 'generateShareLink') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: new URL('/projects/shared/ui-token', page.url()).href }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.goto('/projects/ui-project');
  await expect(page.getByRole('heading', { name: model.name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '초대', exact: true })).toBeVisible();
  return { model, actions };
}

for (const action of ['inviteMember', 'removeMember', 'delete'] as const) {
  test(`project ${action} failure is visible and does not destroy the loaded project`, async ({ page }) => {
    const { actions } = await openProject(page, action);
    page.on('dialog', (d) => d.accept());
    if (action === 'inviteMember') {
      await page.getByRole('button', { name: '초대', exact: true }).click();
      await page.getByPlaceholder('이메일 주소', { exact: true }).fill('invited@example.invalid');
      await page.getByRole('button', { name: '초대하기', exact: true }).click();
    } else {
      await page.getByRole('button', { name: action === 'delete' ? /^삭제$/ : /멤버 제거$/ }).click();
    }
    await expect(page.getByRole('main').getByRole('alert')).toContainText('합성 저장 서비스 실패');
    await expect(page.getByRole('heading', { name: 'UI 검증 프로젝트', exact: true })).toBeVisible();
    await expect.poll(() => actions.length).toBe(1);
  });
}

test('project invite, remove, share, copy fallback and close controls complete their UI transitions', async ({ page }, info) => {
  const { actions } = await openProject(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const prompts: string[] = [];
  page.on('dialog', async (d) => { if (d.type() === 'prompt') prompts.push(d.defaultValue()); await d.accept(); });
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await page.getByRole('button', { name: '초대', exact: true }).click();
  await page.getByPlaceholder('이메일 주소', { exact: true }).fill('invited@example.invalid');
  await page.getByLabel('초대 멤버 권한').selectOption('editor');
  await page.getByRole('button', { name: '초대하기', exact: true }).click();
  await expect(page.getByText('invited@example.invalid', { exact: true })).toBeVisible();
  const member = page.getByRole('listitem').filter({ hasText: 'invited@example.invalid' });
  await member.getByRole('button', { name: /멤버 제거$/ }).click();
  await expect(page.getByText('invited@example.invalid', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '공유', exact: true }).click();
  await page.getByLabel('공유 만료 시간').selectOption('24');
  await page.getByRole('button', { name: '공유 링크 생성', exact: true }).click();
  await expect(page.getByLabel('생성된 공유 링크')).toHaveValue(/\/projects\/shared\/ui-token$/);
  await page.getByRole('button', { name: '공유 링크 복사', exact: true }).click();
  expect(prompts.some((p) => p.endsWith('/projects/shared/ui-token'))).toBe(true);
  await expect(page.getByRole('button', { name: '공유 링크 복사 완료', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('recovered-result.png'), fullPage: false });
  await page.getByRole('button', { name: '프로젝트 공유 닫기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '프로젝트 공유' })).toHaveCount(0);
  expect(actions).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'inviteMember', role: 'editor' }), expect.objectContaining({ action: 'removeMember' }), expect.objectContaining({ action: 'generateShareLink', expireHours: 24 })]));
});

test('authenticated project refresh waits for restored identity and remains interactive', async ({ page }) => {
  await openProject(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'UI 검증 프로젝트', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '초대', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '초대', exact: true }).click();
  await page.getByRole('button', { name: '멤버 초대 닫기', exact: true }).click();
  await expect(page.getByPlaceholder('이메일 주소', { exact: true })).toHaveCount(0);
});

test('new project validates required input, retries a failed save and navigates after success', async ({ page }) => {
  await syntheticAuth(page);
  let calls = 0;
  await page.route('**/api/projects', (r) => {
    if (r.request().method() !== 'POST') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    expect(r.request().postDataJSON()).toEqual({ name: '새 UI 프로젝트', description: '합성 설명' });
    calls++;
    return r.fulfill({ status: calls === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(calls === 1 ? { error: 'fixture failure' } : { id: 'ui-project' }) });
  });
  await page.route('**/api/projects/ui-project', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureProject()) }));
  await page.goto('/projects/new');
  await page.getByRole('button', { name: '프로젝트 생성', exact: true }).click();
  expect(calls).toBe(0);
  await page.getByLabel('프로젝트 이름').fill('새 UI 프로젝트');
  await page.getByLabel('설명 (선택)').fill('합성 설명');
  await page.getByRole('button', { name: '프로젝트 생성', exact: true }).click();
  await expect(page.getByText('프로젝트 생성에 실패했습니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '프로젝트 생성', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/ui-project$/);
  expect(calls).toBe(2);
});
