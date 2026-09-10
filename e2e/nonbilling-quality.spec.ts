import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { syntheticAuth, UI_USER } from './helpers/synthetic-auth';

// Isolated synthetic HTTP and identity; no real account, payment, database or email.
const project = (name: string) => ({ id: 'project-a', name, status: 'active', memberCount: 1, calculationCount: 0, userRole: 'owner', updatedAt: '2026-09-10T00:00:00Z' });
const question = (title: string) => ({ id: 'q1', title, tags: ['KEC'], votes: 0, answerCount: 0, status: 'open', createdAt: '2026-09-10T00:00:00Z' });
async function capture(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const directory = process.env.NONBILLING_SCREEN_DIR;
  if (directory) { await mkdir(directory, { recursive: true }); await page.screenshot({ path: `${directory}/${label}.png`, fullPage: false, animations: 'disabled' }); }
}
for (const width of [1440, 390]) {
  test(`project filters cannot be overwritten by an obsolete response (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await syntheticAuth(page);
    let release!: () => void, entered!: () => void, calls = 0;
    const held = new Promise<void>((resolve) => { release = resolve; }); const started = new Promise<void>((resolve) => { entered = resolve; });
    await page.route('**/api/projects?*', async (route) => {
      if (++calls === 1) { entered(); await held; return route.fulfill({ json: { projects: [project('이전 필터 결과')] } }).catch(() => undefined); }
      return route.fulfill({ json: { projects: [project('새 필터 결과')] } });
    });
    try {
      await page.goto('/projects'); await started;
      await page.locator('main button[aria-pressed]').nth(1).click();
      await expect(page.getByText('새 필터 결과', { exact: true })).toBeVisible();
      release();
      await expect(page.getByText('이전 필터 결과', { exact: true })).toHaveCount(0);
      await capture(page, `projects-${width}`);
    } finally { release(); }
  });

  test(`dashboard shows partial-data warnings and retries in place (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await syntheticAuth(page);
    let calls = 0;
    await page.route('**/api/dashboard', (route) => route.fulfill({ json: { success: true,
      warnings: ++calls === 1 ? ['standard_updates_unavailable'] : [],
      data: { totalCalcs: 2048, usageComplete: false, calcUsage: [{ calculatorId: 'voltage-drop', name: '전압강하', count: 10 }], recentCalcs: [], standardUpdates: [] } } }));
    await page.goto('/dashboard');
    await expect(page.getByText('업데이트 알림 조회에 실패했습니다. 업데이트가 없다는 뜻이 아닙니다.', { exact: true })).toBeVisible();
    await expect(page.getByText(/사용량 분포는 일부 기록 기준/)).toBeVisible();
    await page.getByText('계산 통계 표로 보기', { exact: true }).click();
    await expect(page.getByRole('table', { name: '최근 30일 계산기별 사용 횟수' })).toBeVisible();
    await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.getByText('업데이트 알림 조회에 실패했습니다. 업데이트가 없다는 뜻이 아닙니다.', { exact: true })).toHaveCount(0);
    expect(calls).toBe(2); await capture(page, `dashboard-${width}`);
  });

  test(`community search has recoverable failure and reset (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await syntheticAuth(page);
    let failed = true;
    await page.route('**/api/community?*', (route) => {
      if (failed) return route.fulfill({ status: 503, json: { error: { message: '합성 커뮤니티 장애' } } });
      const query = new URL(route.request().url()).searchParams.get('search');
      return route.fulfill({ json: { success: true, data: { data: [question(query ? `질문 ${query}` : '전체 질문')], totalPages: 1 } } });
    });
    await page.goto('/community'); await expect(page.getByRole('alert')).toContainText('합성 커뮤니티 장애');
    failed = false; await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.getByText('전체 질문', { exact: true })).toBeVisible();
    const input = page.locator('main input[type="text"]').first();
    await input.fill('차단기'); await expect(page.getByText('질문 차단기', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '검색·필터 초기화', exact: true }).click();
    await expect(input).toHaveValue(''); await expect(page.getByText('전체 질문', { exact: true })).toBeVisible();
    await capture(page, `community-${width}`);
  });

  test(`notifications preserve unread state on failure and close by keyboard (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await syntheticAuth(page);
    let read = false, attempts = 0;
    await page.route('**/api/notifications*', (route) => {
      if (route.request().method() === 'PATCH') {
        if (++attempts === 1) return route.fulfill({ status: 503, json: { error: '합성 읽음 처리 실패' } });
        read = true; return route.fulfill({ json: { success: true } });
      }
      return route.fulfill({ json: { success: true, unreadCount: read ? 0 : 1, notifications: [{ id: 'n1', type: 'system', title: '검증용 알림', body: '전달 상태 구분', link: 'javascript:alert(1)', read, createdAt: '2026-09-10T00:00:00Z' }] } });
    });
    await page.goto('/projects');
    const trigger = page.getByRole('button', { name: /^알림/ }); await trigger.click();
    const panel = page.getByRole('region', { name: '알림 목록', exact: true });
    await expect(panel.getByText('검증용 알림', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '읽음 처리', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('합성 읽음 처리 실패');
    await expect(panel.getByRole('button', { name: '읽음 처리', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: '읽음 처리', exact: true }).click();
    await expect(panel.getByRole('button', { name: '읽음 처리', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('link')).toHaveCount(0); expect(attempts).toBe(2);
    await capture(page, `notifications-${width}`);
    await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0); await expect(trigger).toBeFocused();
  });

  test(`administrator role uses server response and paginated safe exports (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await syntheticAuth(page, 'free');
    await page.route('**/api/admin', (route) => route.fulfill({ json: { ok: true, source: 'database', data: {
      tenant: null, users: [], usage: [], auditLog: [], counts: { users: 0, receipts: 0, projects: 0 } } } }));
    const requested: string[] = [];
    await page.route('**/api/admin/audit?*', (route) => {
      const p = new URL(route.request().url()).searchParams.get('page') ?? '1'; requested.push(p);
      return route.fulfill({ json: { success: true, data: { totalCount: 41, totalPages: 3, page: Number(p), pageSize: 20,
        entries: [{ id: `audit-${p}`, userId: UI_USER, action: 'read', resource: '=HYPERLINK("untrusted")', ip: '127.0.0.1', createdAt: '2026-09-10T00:00:00Z' }] } } });
    });
    await page.goto('/admin'); await page.getByRole('button', { name: '감사로그', exact: true }).click();
    await expect(page.getByText(/현재 1건 \/ 전체 41건/)).toBeVisible();
    await page.getByRole('button', { name: '다음 감사로그 페이지', exact: true }).click();
    await expect.poll(() => requested.includes('2')).toBe(true);
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: /현재 페이지 CSV 내보내기/ }).click();
    const file = await pending; const text = await readFile((await file.path())!, 'utf8');
    expect(text).toContain("'=HYPERLINK"); expect(text).toContain('""untrusted""');
    await capture(page, `audit-${width}`);
  });

  test(`history keeps good cached records beside corrupt data and sync failures (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await syntheticAuth(page);
    await page.evaluate((uid) => {
      sessionStorage.setItem('esa-receipt-index', JSON.stringify(['good', 'broken', 'other']));
      sessionStorage.setItem('esa-receipt-good', JSON.stringify({ id: 'good', calcId: 'voltage-drop', userId: uid, inputs: { voltage: 380 }, result: { value: 3, unit: '%' }, calculatedAt: '2026-09-10T00:00:00Z' }));
      sessionStorage.setItem('esa-receipt-broken', '{invalid');
      sessionStorage.setItem('esa-receipt-other', JSON.stringify({ id: 'other', calcId: 'private-other-user', userId: 'not-this-user', inputs: {}, calculatedAt: '' }));
    }, UI_USER);
    await page.route('**/api/calculate?page=1&pageSize=100', (route) => route.fulfill({ status: 503, json: { error: { message: '합성 이력 동기화 실패' } } }));
    await page.goto('/history');
    await expect(page.getByText('합성 이력 동기화 실패', { exact: true })).toBeVisible();
    await expect(page.getByText(/손상 또는 누락된 탭 기록 1건/)).toBeVisible();
    await expect(page.getByRole('table')).toContainText('380'); await expect(page.getByText('private-other-user', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('esa-receipt-broken'))).toBe('{invalid');
    await capture(page, `history-${width}`);
  });
}
