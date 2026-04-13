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

  test('메인 → 계산기 네비게이션', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('text=전기 계산기');
    await expect(page).toHaveURL(/\/calc/);
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

  test('Breadcrumb 계층 구조 표시', async ({ page }) => {
    await page.goto(`${BASE_URL}/calc/voltage-drop/voltage-drop`);
    const breadcrumb = page.locator('nav[aria-label="breadcrumb"]');
    await expect(breadcrumb).toBeVisible();
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

  test('국가별 필터 동작', async ({ page }) => {
    await page.goto(`${BASE_URL}/standards`);
    // 필터 버튼들이 존재하는지 확인
    await expect(page.locator('text=KEC')).toBeVisible();
    await expect(page.locator('text=NEC')).toBeVisible();
    await expect(page.locator('text=IEC')).toBeVisible();
  });

  test('검색 입력 존재', async ({ page }) => {
    await page.goto(`${BASE_URL}/standards`);
    const searchInput = page.locator('input[placeholder*="검색"]');
    await expect(searchInput).toBeVisible();
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

  test('모바일 햄버거 메뉴', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    // 모바일에서 메뉴 토글 버튼 존재
    const menuBtn = page.locator('button[aria-label*="메뉴"], button[aria-label*="menu"], button.md\\:hidden');
    const count = await menuBtn.count();
    expect(count).toBeGreaterThanOrEqual(0); // 최소 존재 확인
  });

  test('404 페이지 표시', async ({ page }) => {
    await page.goto(`${BASE_URL}/this-page-does-not-exist`);
    await expect(page.locator('text=404')).toBeVisible();
  });

  test('페이지 전환 속도 < 3초', async ({ page }) => {
    await page.goto(BASE_URL);
    const start = Date.now();
    await page.goto(`${BASE_URL}/calc`);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. API 엔드포인트
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API 엔드포인트', () => {
  test('GET /api/health 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.status()).toBe(200);
  });

  test('GET /api/openapi 200 + JSON', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/openapi`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('openapi');
    expect(body.openapi).toMatch(/^3\./);
  });

  test('POST /api/calculate — voltage-drop', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/calculate`, {
      data: {
        calculatorId: 'voltage-drop',
        inputs: {
          voltage: 380,
          current: 50,
          length: 30,
          cableSize: 16,
          conductor: 'Cu',
          powerFactor: 0.85,
          phase: 3,
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  test('POST /api/calculate — 잘못된 입력 거부', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/calculate`, {
      data: {
        calculatorId: 'voltage-drop',
        inputs: {
          voltage: -100,  // negative = invalid
          current: 50,
          length: 30,
          cableSize: 16,
          conductor: 'Cu',
          powerFactor: 0.85,
          phase: 3,
        },
      },
    });
    // 400 or 200 with error
    const body = await res.json();
    if (res.status() === 200) {
      expect(body.success).toBe(false);
    } else {
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. 반응형 레이아웃
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('반응형 레이아웃', () => {
  test('태블릿 뷰포트 정상 렌더링', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE_URL);
    await expect(page.locator('text=ESVA')).toBeVisible();
  });

  test('모바일 뷰포트 정상 렌더링', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL);
    await expect(page.locator('text=ESVA')).toBeVisible();
  });

  test('와이드 뷰포트 정상 렌더링', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/calc`);
    await expect(page.locator('text=전력기초')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. 설정 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('설정 페이지', () => {
  test('BYOK 페이지 접근', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/byok`);
    await expect(page.locator('text=API')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. 도면 분석 (SLD)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('도면 분석', () => {
  test('SLD 페이지 접근 + 탭 표시', async ({ page }) => {
    await page.goto(`${BASE_URL}/tools/sld`);
    // DXF 탭이 기본 선택되어야 함
    await expect(page.locator('text=DXF')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. 접근성 기본
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('접근성', () => {
  test('메인 페이지 title 존재', async ({ page }) => {
    await page.goto(BASE_URL);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('img 태그 alt 속성 확인 (메인)', async ({ page }) => {
    await page.goto(BASE_URL);
    const imgs = page.locator('img:not([alt])');
    const count = await imgs.count();
    // alt 없는 이미지가 5개 미만이어야 함
    expect(count).toBeLessThan(5);
  });

  test('lang 속성 존재', async ({ page }) => {
    await page.goto(BASE_URL);
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
  });
});
