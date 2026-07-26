/**
 * 모든 라우트가 실제로 렌더되는가.
 *
 * smoke.spec.ts 는 이름 그대로 스모크라 27쪽 중 8쪽만 방문한다. 2026-07-26
 * 세션에서 찾은 결함은 전부 방문하지 않는 쪽에 있었다 — 단위 변환 카드가
 * 한 번도 화면에 나온 적 없음(/search), 인라인 계산기가 EmptyState 에 덮임,
 * 18쪽이 같은 제목, 조항 변환이 다른 조항을 82% 일치로 답함(/standards).
 * 유닛 1810개가 전부 green 인 채였다.
 *
 * 여기서 잠그는 것은 "이 페이지가 사람 눈앞에서 실제로 그려지는가" 다 —
 * 하이드레이션 크래시·빈 화면·콘솔 오류는 유닛 테스트가 구조적으로 못 본다.
 * 화면별 세부 계약은 각 페이지의 유닛/소스 잠금이 맡는다.
 */
import { test, expect, type ConsoleMessage } from '@playwright/test';

/** 로그인 없이 열리는 전 라우트. 동적 라우트는 대표 하나씩. */
const ROUTES = [
  '/',
  '/admin',
  '/calc',
  '/calc/voltage-drop/voltage-drop',
  '/calc/lighting/illuminance',
  '/calc/protection/short-circuit',
  '/community',
  '/community/ask',
  '/compare',
  '/contact',
  '/dashboard',
  '/disclaimer',
  '/field',
  '/glossary',
  '/history',
  '/login',
  '/mobile',
  '/privacy',
  '/projects',
  '/projects/new',
  '/receipt',
  '/search',
  '/search?q=%EC%A0%84%EC%95%95%EA%B0%95%ED%95%98',
  '/settings',
  '/settings/byok',
  '/settings/onpremise',
  '/standards',
  '/terms',
  '/tools/ocr',
  '/tools/sld',
  '/tools/studio',
];

/**
 * 브라우저·확장·개발 서버가 내는 잡음. 제품 코드의 오류만 남긴다.
 * 넓게 지우면 진짜 오류까지 묻히므로 최소로 유지한다.
 */
const IGNORED = [
  /favicon/i,
  /Download the React DevTools/i,
  /net::ERR_(ABORTED|BLOCKED_BY_CLIENT)/i,
];

const isNoise = (text: string) => IGNORED.some((p) => p.test(text));

/**
 * 외부 저장소(Supabase)가 있어야 목록이 나오는 화면. 그 설정이 없는 환경에서는
 * API 가 500 을 내는 게 정상이다 — 페이지 결함이 아니다.
 *
 * 그렇다고 오류를 그냥 무시하면 안 된다. 이 화면들에는 더 강한 계약을 건다:
 * **실패했으면 실패했다고 화면에 적어야 한다.** 삼키고 "아직 질문이
 * 없습니다" 를 띄우면 서버가 죽었는데 데이터가 없다고 말하는 셈이다
 * (실측 2026-07-26: /api/community 500 인데 화면은 빈 목록 안내).
 */
const BACKEND_DEPENDENT = new Set(['/community']);

for (const route of ROUTES) {
  test(`${route} — 오류 없이 그려진다`, async ({ page }) => {
    const errors: string[] = [];
    const onConsole = (msg: ConsoleMessage) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!isNoise(text)) errors.push(text);
    };
    page.on('console', onConsole);
    page.on('pageerror', (err) => {
      if (!isNoise(err.message)) errors.push(`pageerror: ${err.message}`);
    });

    const response = await page.goto(route, { waitUntil: 'networkidle' });
    expect(response?.status(), `${route} 응답 상태`).toBeLessThan(400);

    // main 랜드마크는 문서에 하나여야 한다. 레이아웃이 <main id="main-content">
    // 를 이미 두는데 페이지가 또 <main> 을 열면 랜드마크가 둘이 되어,
    // 스크린리더 landmark 이동과 "본문 바로가기" 대상이 갈린다
    // (실측 2026-07-26: 21쪽이 중첩 <main> 이었다).
    const main = page.locator('main');
    await expect(main, `${route} main 랜드마크가 1개가 아니다`).toHaveCount(1);

    // 껍데기(헤더+푸터)만 남고 본문이 비는 경우를 잡는다. 대부분 클라이언트
    // 렌더라 값이 들어올 때까지 기다린다 — 게이트된 화면("로그인이 필요합니다")
    // 처럼 짧은 것도 정상이므로 문턱은 낮게 둔다.
    await expect
      .poll(async () => (await main.innerText()).trim().length, {
        timeout: 10_000,
        message: `${route} 본문이 비었다`,
      })
      .toBeGreaterThan(5);

    // Next.js 오류 화면이 뜨면 본문은 채워지므로 따로 본다.
    await expect(page.locator('text=Application error')).toHaveCount(0);
    await expect(page.locator('text=Unhandled Runtime Error')).toHaveCount(0);

    if (BACKEND_DEPENDENT.has(route)) {
      const serverFailed = errors.some((e) => /50\d|Failed to load resource/i.test(e));
      if (serverFailed) {
        // 실패를 삼키지 않았는지만 본다 — 알리고, 다시 해볼 길을 준다.
        await expect(
          main.getByText(/불러오지 못했습니다/),
          `${route} 서버 실패를 화면에 알리지 않는다`,
        ).toBeVisible();
        await expect(
          main.getByRole('button', { name: '다시 시도' }),
          `${route} 실패 후 재시도할 길이 없다`,
        ).toBeVisible();
        return;
      }
    }

    expect(errors, `${route} 콘솔 오류`).toEqual([]);
  });
}

test('페이지마다 다른 제목을 단다', async ({ page }) => {
  const titles = new Map<string, string[]>();
  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    titles.set(title, [...(titles.get(title) ?? []), route]);
  }
  const duplicated = [...titles.entries()]
    .filter(([, routes]) => routes.length > 1)
    // /search 와 /search?q=… 는 같은 화면이라 같은 제목이 맞다.
    .filter(([, routes]) => new Set(routes.map((r) => r.split('?')[0])).size > 1)
    .map(([title, routes]) => `${title}: ${routes.join(', ')}`);

  expect(duplicated).toEqual([]);
});
