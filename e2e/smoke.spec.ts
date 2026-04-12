/**
 * ESVA E2E Smoke Tests
 * ---------------------
 * 핵심 페이지 접근성 + 주요 기능 동작 확인.
 * `npx playwright test e2e/smoke.spec.ts`
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 메인 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('메인 페이지', () => {
  test('로고 + 히어로 텍스트 표시', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('text=ESVA')).toBeVisible();
    await expect(page.locator('text=검색·계산·검증')).toBeVisible();
  });

  test('검색바 존재', async ({ page }) => {
    await page.goto(BASE_URL);
    const searchBar = page.locator('input[type="search"], input[placeholder*="검색"]');
    await expect(searchBar).toBeVisible();
  });

  test('Bento 카드 5개 렌더링', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('text=전기 계산기')).toBeVisible();
    await expect(page.locator('text=AI 법규 검색')).toBeVisible();
    await expect(page.locator('text=도면 분석')).toBeVisible();
    await expect(page.locator('text=OCR 명판 인식')).toBeVisible();
    await expect(page.locator('text=기준서')).toBeVisible();
  });

  test('3 원칙 섹션 표시', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('text=AI는 추정하지 않습니다')).toBeVisible();
    await expect(page.locator('text=기준서가 근거입니다')).toBeVisible();
    await expect(page.locator('text=투명하게 검증합니다')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 계산기 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('계산기 페이지', () => {
  test('12개 카테고리 카드 표시', async ({ page }) => {
    await page.goto(`${BASE_URL}/calc`);
    await expect(page.locator('text=전력기초')).toBeVisible();
    await expect(page.locator('text=전압강하')).toBeVisible();
    await expect(page.locator('text=케이블')).toBeVisible();
    await expect(page.locator('text=변압기')).toBeVisible();
    await expect(page.locator('text=보호협조')).toBeVisible();
    await expect(page.locator('text=접지')).toBeVisible();
  });

  test('계산기 검색 동작', async ({ page }) => {
    await page.goto(`${BASE_URL}/calc`);
    const searchInput = page.locator('input[placeholder*="계산기 검색"]');
    await searchInput.fill('전압강하');
    // 필터링 후 전압강하 관련 결과만 표시
    await expect(page.locator('text=전압 강하 계산')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 기준서 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('기준서 페이지', () => {
  test('KEC 조항 목록 표시', async ({ page }) => {
    await page.goto(`${BASE_URL}/standards`);
    await expect(page.locator('text=KEC')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 검증보고서 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('검증보고서 페이지', () => {
  test('데모 보고서 렌더링', async ({ page }) => {
    await page.goto(`${BASE_URL}/report/demo`);
    await expect(page.locator('text=ESVA Verified')).toBeVisible();
    await expect(page.locator('text=검증 마킹')).toBeVisible();
  });

  test('빨강/노랑/초록 마킹 표시', async ({ page }) => {
    await page.goto(`${BASE_URL}/report/demo`);
    await expect(page.locator('text=오류')).toBeVisible();
    await expect(page.locator('text=경고')).toBeVisible();
    await expect(page.locator('text=적합')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 네비게이션
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('네비게이션', () => {
  test('Header 링크 존재 (데스크톱)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/calc`);
    await expect(page.locator('nav >> text=검색')).toBeVisible();
    await expect(page.locator('nav >> text=계산기')).toBeVisible();
    await expect(page.locator('nav >> text=SLD 분석')).toBeVisible();
    await expect(page.locator('nav >> text=기준서')).toBeVisible();
  });

  test('404 페이지 표시', async ({ page }) => {
    await page.goto(`${BASE_URL}/this-page-does-not-exist`);
    await expect(page.locator('text=404')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. API 헬스체크
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API 엔드포인트', () => {
  test('GET /api/health 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.status()).toBe(200);
  });
});
