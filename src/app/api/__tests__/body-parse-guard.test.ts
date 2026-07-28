import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 본문 파싱 실패를 500 으로 뭉개지 않는다.
 *
 * `await request.json()` 은 깨진 JSON·빈 본문에 **던진다.** 방어가 없으면
 * 바깥 catch 가 잡아 500 을 낸다. 500 은 "서버 잘못" 이라는 뜻이라 운영
 * 알람을 울리고, 호출자에게 무엇을 고쳐야 하는지 안 알려 준다. 이 리포엔
 * 이미 규범이 있다 — `pdf-drawing` 은 `formData()` 를 try 로 감싸 400 을
 * 내고 `gate:pdf` 가 "비PDF: 500 이 아니라 400 정직 거부" 로 잠근다.
 *
 * 실측 2026-07-28(빈 본문·깨진 JSON 주입, 프로덕션 빌드):
 *   500 을 내던 것 11 개 — calculate · chat · convert · drawing-jobs ·
 *   export · feedback · review · search · settings/byok-test ·
 *   standard-convert · team-review. 전부 400 으로 수리했다.
 *
 * **이 검사는 구문만 본다 — 방어가 없어도 바깥에서 4xx 를 내면 문제가
 * 아니다.** 실제로 아래 목록 15 곳은 실측에서 전부 4xx 였다(인증·메서드·
 * 필드 검증이 먼저 걸린다). 그래서 "위반" 이 아니라 **baseline** 으로 둔다:
 * 목록에 없는 새 파싱이 나타나면 실패하고, 그때 실측해서 4xx 면 목록에
 * 추가하고 5xx 면 수리한다.
 *
 * 측정에 함정이 하나 있었다: 순차 프로브가 스스로 레이트리밋(default
 * 60req/60s 공유)을 걸어 뒤쪽 라우트가 429 로 가려졌고, 그걸 "5xx 없음"
 * 으로 읽어 `/team-review` 의 500 을 놓쳤다. 429 는 통과가 아니라 미측정이다.
 */

const API = join(__dirname, '..');

/**
 * 방어는 없지만 **실측에서 4xx 를 내는 것들.** 괄호 안이 측정값이다.
 * 인증·메서드·필드 검증이 파싱보다 먼저 걸리거나, 바깥 catch 가 4xx 를 낸다.
 */
const MEASURED_4XX = new Set([
  'calculate/batch/route.ts',        // 400
  'checkout/route.ts',              // 400
  'community/route.ts',             // 401
  'community/[id]/route.ts',        // 401
  'community/[id]/vote/route.ts',   // 401
  'field/complete/route.ts',        // 401
  'field/sos/route.ts',             // 401
  'notarize/route.ts',              // 404
  'notifications/route.ts',         // 401
  'projects/route.ts',              // 401
  'projects/[id]/route.ts',         // 405
  'rules/validate/route.ts',        // 400
  'settings/onpremise-test/route.ts', // 401
  // 서명·페이로드 오류를 400 으로, 처리 실패만 500 으로 이미 가른다.
  'stripe/webhook/route.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === '__tests__' || n === 'node_modules') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (n === 'route.ts') out.push(p);
  }
  return out;
}

// 요청 객체에서 본문을 읽는 것만 본다. `await file.text()` 같은 것은
// 요청 본문이 아니라 이미 받아 둔 파일이라 대상이 아니다.
const PARSE = /await\s+(?:req|request)\.(json|formData|text)\(\)/;

describe('요청 본문 파싱 방어', () => {
  const routes = walk(API);

  it('라우트를 실제로 읽는다', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('검사기가 판별한다 — 항상 참이면 게이트가 아니다', () => {
    expect(PARSE.test('const body = await request.json();')).toBe(true);
    expect(PARSE.test('const t = await file.text();')).toBe(false);
  });

  it('방어 없는 본문 파싱이 baseline 밖으로 늘지 않는다', () => {
    const unguarded = new Set<string>();
    for (const f of routes) {
      const src = readFileSync(f, 'utf8');
      const lines = src.split(/\r?\n/);
      // 이 파일이 애초에 500 을 낼 수 있는가. 못 내면 파싱이 어느 try 안에
      // 있든 바깥 catch 는 4xx 만 낸다.
      const canAnswer500 = /status:\s*500/.test(src);
      lines.forEach((line, i) => {
        if (!PARSE.test(line)) return;
        if (line.includes('.catch(')) return;
        // 바로 앞(빈 줄·주석 제외)이 `try {` 이면 try 안이다. 다만 **try
        // 안이라는 것이 4xx 를 뜻하지는 않는다** — 바깥 catch 가 500 을
        // 내면 깨진 본문이 여전히 "서버 잘못" 으로 보고된다.
        //
        // 실측 2026-07-28: `drawing-jobs/[jobId]/resume` 이 정확히 그랬다.
        // 파싱이 함수 전체를 감싸는 try 의 첫 줄이라 면제됐는데 그 catch 는
        // 500 이었다. 검사는 초록인 채로 결함이 살아 있었다(§2.2).
        //
        // 그래서 면제 조건을 좁힌다: **파싱 전용 try**(바로 다음 줄이
        // `} catch`)이거나, 그 파일이 500 을 낼 수 없을 때만.
        for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
          const prev = lines[j].trim();
          if (!prev || prev.startsWith('//') || prev.startsWith('*')) continue;
          if (prev !== 'try {') break;
          const next = (lines[i + 1] ?? '').trim();
          if (next.startsWith('} catch') || !canAnswer500) return;
          break;
        }
        unguarded.add(relative(API, f).replace(/\\/g, '/'));
      });
    }
    const added = [...unguarded].filter((f) => !MEASURED_4XX.has(f)).sort();
    expect(added).toEqual([]);
  });

  // baseline 이 낡으면 아무것도 안 지킨다 — 수리된 라우트가 남아 있으면 지워라.
  it('baseline 에 이미 방어된 라우트가 남아 있지 않다', () => {
    const guardedNow: string[] = [];
    for (const f of routes) {
      const rel = relative(API, f).replace(/\\/g, '/');
      if (!MEASURED_4XX.has(rel)) continue;
      const src = readFileSync(f, 'utf8');
      const lines = src.split(/\r?\n/);
      const stillUnguarded = lines.some((line, i) => {
        if (!PARSE.test(line) || line.includes('.catch(')) return false;
        for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
          const prev = lines[j].trim();
          if (!prev || prev.startsWith('//') || prev.startsWith('*')) continue;
          if (prev === 'try {') return false;
          break;
        }
        return true;
      });
      if (!stillUnguarded) guardedNow.push(rel);
    }
    expect(guardedNow).toEqual([]);
  });
});
