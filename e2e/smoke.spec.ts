/**
 * ESVA E2E Smoke Tests
 * ---------------------
 * 핵심 페이지 접근성 + 주요 기능 동작 확인.
 * `npx playwright test e2e/smoke.spec.ts`
 */

import { test, expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 메인 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('메인 페이지', () => {
  test('로고 + 검색 진입점 표시', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'ESVA', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '전기 엔지니어 검색' })).toBeAttached();
  });

  test('검색바 존재', async ({ page }) => {
    await page.goto('/');
    const searchBar = page.getByRole('searchbox', { name: '질의 입력' });
    await expect(searchBar).toBeVisible();
  });

  test('예시 질의 3개가 실제 버튼으로 렌더링', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /380V 50kW 100m 전압강하 검토/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /KEC 232\.3\.9/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /변압기 명판 촬영/ })).toBeVisible();
  });

  test('헤더 밖 핵심 도구도 홈에서 도달 가능', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'BYOK 키 설정' })).toHaveAttribute('href', '/settings/byok');
    await expect(page.getByRole('link', { name: 'OCR 명판' })).toHaveAttribute('href', '/tools/ocr');
    await expect(page.getByRole('link', { name: '프로젝트' })).toHaveAttribute('href', '/projects');
    await expect(page.getByRole('link', { name: '계산 이력', exact: true })).toHaveAttribute('href', '/history');
  });

  test('메인 → 계산기 네비게이션', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('navigation').getByRole('link', { name: '계산기', exact: true }).click();
    await expect(page).toHaveURL(/\/calc/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 계산기 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('계산기 페이지', () => {
  test('12개 카테고리 카드 표시', async ({ page }) => {
    await page.goto('/calc');
    await expect(page.locator('main h3')).toHaveCount(12);
    await expect(page.getByRole('heading', { level: 3, name: '전력기초' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'AI특화' })).toBeVisible();
  });

  test('계산기 검색 동작', async ({ page }) => {
    await page.goto('/calc');
    await page.getByRole('textbox', { name: '계산기 검색' }).fill('전압강하');
    await expect(page.locator('main h3')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 3, name: '전압강하' })).toBeVisible();
    await expect(page.getByRole('link', { name: '전압 강하 계산' }))
      .toHaveAttribute('href', '/calc/voltage-drop/voltage-drop');
    await expect(page.getByRole('heading', { level: 3, name: '전력기초' })).toHaveCount(0);
  });

  test('Breadcrumb 계층 구조 표시', async ({ page }) => {
    await page.goto('/calc/voltage-drop/voltage-drop');
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb.getByRole('link', { name: 'ESVA' })).toHaveAttribute('href', '/');
    await expect(breadcrumb.getByRole('link', { name: '계산기' })).toHaveAttribute('href', '/calc');
    await expect(page.getByRole('heading', { level: 1, name: '전압 강하 계산' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 기준서 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('기준서 페이지', () => {
  test('KEC 조항 목록 표시', async ({ page }) => {
    await page.goto('/standards');
    await expect(page.getByRole('button', { name: /^KEC \(MOTIE\)/ })).toBeVisible();
  });

  test('국가별 필터 동작', async ({ page }) => {
    await page.goto('/standards');
    await page.getByLabel('국가 및 표준 체계').selectOption('US');
    await expect(page.getByRole('button', { name: /^NEC\b/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^KEC\b/ })).toHaveCount(0);

    await page.getByLabel('표준 조항 검색').fill('Article 210');
    const article = page.getByRole('button', { name: /Article 210.*분기회로/ });
    const group = page.getByRole('button', { name: /^NEC \(NFPA\) 1/ });
    await expect(article).toBeVisible();
    await expect(page.getByRole('button', { name: /Article 220/ })).toHaveCount(0);

    await group.click();
    await expect(article).toBeHidden();
    await group.click();
    await expect(article).toBeVisible();
  });

  test('검색 입력 존재', async ({ page }) => {
    await page.goto('/standards');
    await expect(page.getByRole('textbox', { name: '표준 조항 검색' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 검증보고서 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('검증보고서 페이지', () => {
  test('존재하지 않는 세션은 데모 점수를 만들지 않음', async ({ page }) => {
    await page.goto('/report/demo');
    await expect(page.getByText(
      '이 세션에서 생성한 보고서를 찾을 수 없습니다. 현재 보고서는 브라우저 세션이 끝나면 다시 열 수 없습니다.',
    )).toBeVisible();
    await expect(page.getByText(
      '데모 점수는 더 이상 표시하지 않습니다. 실제 검증 파이프라인을 실행한 뒤에만 보고서를 볼 수 있습니다.',
    )).toBeVisible();
    await expect(page.getByText('ESVA Verified')).toHaveCount(0);
  });

  test('보고서 없음 화면에서 SLD 분석으로 복귀', async ({ page }) => {
    await page.goto('/report/demo');
    const sldLink = page.getByRole('link', { name: 'SLD 분석' });
    await expect(sldLink).toHaveAttribute('href', '/tools/sld');
    await sldLink.click();
    await expect(page).toHaveURL(/\/tools\/sld$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 네비게이션
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('네비게이션', () => {
  test('Header 링크 존재 (데스크톱)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/calc');
    await expect(page.locator('nav >> text=검색')).toBeVisible();
    await expect(page.locator('nav >> text=계산기')).toBeVisible();
    await expect(page.locator('header nav').getByRole('link', { name: 'SLD', exact: true })).toBeVisible();
    await expect(page.locator('nav >> text=기준서')).toBeVisible();
  });

  test('모바일 햄버거 메뉴', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/calc');
    const menuBtn = page.getByRole('button', { name: '메뉴 열기' });
    await expect(menuBtn).toBeVisible();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');
    await menuBtn.click();
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');

    const menu = page.getByRole('dialog', { name: '메뉴' });
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: '메뉴 닫기' }).click();
    await expect(menu).toBeHidden();
  });

  test('404 페이지 표시', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.locator('text=404')).toBeVisible();
  });

  test('페이지 전환 시 서버 오류 없음', async ({ page }) => {
    await page.goto('/');
    const response = await page.goto('/calc');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/calc$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. API 엔드포인트
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API 엔드포인트', () => {
  test('GET /api/health 공개 상태 계약', async ({ request }) => {
    const res = await request.get('/api/health');
    const body = await res.json();

    expect([200, 503]).toContain(res.status());
    expect(Object.keys(body).sort()).toEqual(['data', 'success']);
    expect(Object.keys(body.data).sort()).toEqual(['status', 'timestamp']);
    expect(body.success).toBe(true);
    expect(Number.isNaN(Date.parse(body.data.timestamp))).toBe(false);
    if (res.status() === 503) {
      expect(body.data.status).toBe('unhealthy');
    } else {
      expect(['healthy', 'degraded']).toContain(body.data.status);
    }
  });

  test('GET /api/openapi 200 + JSON', async ({ request }) => {
    const res = await request.get('/api/openapi');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('openapi');
    expect(body.openapi).toMatch(/^3\./);
  });

  test('POST /api/calculate — voltage-drop', async ({ request }) => {
    const res = await request.post('/api/calculate', {
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
    const res = await request.post('/api/calculate', {
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
    expect(res.status()).toBe(422);
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: 'ESVA-4010',
        message: 'voltage must be a positive finite number, got -100',
      },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. 반응형 레이아웃
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('반응형 레이아웃', () => {
  test('태블릿 뷰포트 정상 렌더링', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: '질의 입력' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('모바일 뷰포트 정상 렌더링', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: '질의 입력' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'BYOK 키 설정' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('와이드 뷰포트 정상 렌더링', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const search = page.getByRole('searchbox', { name: '질의 입력' });
    const box = await search.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(808);
    expect(Math.abs((box!.x + box!.width / 2) - 720)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. 설정 페이지
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('설정 페이지', () => {
  test('BYOK 페이지 접근', async ({ page }) => {
    await page.goto('/settings/byok');
    await expect(page.getByRole('heading', { level: 1, name: 'API 키 관리' })).toBeVisible();
  });

  test('도면 분석에 실제 배선된 공급자만 모델 선택을 노출', async ({ page }) => {
    await page.goto('/settings/byok');

    for (const [provider, key] of [
      ['openai', 'sk-test-openai-model-ui'],
      ['groq', 'gsk-test-groq-model-ui'],
    ] as const) {
      const input = page.locator(`#provider-key-${provider}`);
      await input.fill(key);
      await input.locator('..').locator('..').getByRole('button', { name: '저장' }).click();
    }

    await expect(page.locator('#provider-model-openai')).toBeVisible();
    await expect(page.locator('#provider-model-groq')).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. 도면 분석 (SLD)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('도면 분석', () => {
  test('SLD 페이지 접근 + 탭 표시', async ({ page }) => {
    await page.goto('/tools/sld');
    const dxfTab = page.getByRole('button', { name: 'DXF 벡터 파싱 탭 선택' });
    await expect(dxfTab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'DXF 파일 업로드' })).toBeVisible();
    await expect(page.getByRole('button', { name: '단선도 이미지 업로드' })).toHaveCount(0);

    const imageTab = page.getByRole('button', { name: '이미지 AI 분석 탭 선택' });
    await imageTab.click();
    await expect(imageTab).toHaveAttribute('aria-pressed', 'true');
    await expect(dxfTab).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: '단선도 이미지 업로드' })).toBeVisible();
  });

  test('공개 합성 DXF 업로드부터 기기·관계 결과까지 실주행', async ({ page }) => {
    await page.goto('/tools/sld');
    await page.locator('input[accept=".dxf"]').setInputFiles('fixtures/drawings/synthetic/L1-01-basic-radial.dxf');

    await expect(page.getByRole('heading', { name: '분석 결과' })).toBeVisible();
    await expect(page.getByText('인식된 기기 (5개)')).toBeVisible();
    await expect(page.getByText('연결 맵 (4개)')).toBeVisible();
    await expect(page.getByText('MCCB-MAIN', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('LOAD-C', { exact: true }).first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. 접근성 기본
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('접근성', () => {
  test('메인 페이지 title 계약', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle("ESVA - The Engineer's Search Engine");
  });

  test('img 태그 alt 속성 확인 (메인)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('img:not([alt])')).toHaveCount(0);
  });

  test('lang 속성 존재', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', /^(ko|en|ja|zh)$/);
  });
});
