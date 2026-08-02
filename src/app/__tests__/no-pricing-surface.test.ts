import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * **요금제 봉인 중에는 화면에 요금·결제 표현이 남지 않는다.**
 *
 * 회사 제출본은 결제 체계를 노출하지 않기로 했다. 그런데 봉인은 «게이트를 여는»
 * 일이라, 게이트와 무관하게 **고정 문자열로 박힌 문구**에는 닿지 않는다.
 *
 * 실측 2026-08-01 — OPEN_BETA 를 켜고도 두 곳이 그대로 보였다:
 *   `receipt/[id]` 「… 블록체인 … 아닙니다. **Pro 플랜 이상 필요.**」  조건 없는 <p>
 *   `admin`        「**플랜**·SSO 등 테넌트 설정은 **엔터프라이즈 온보딩** 시 …」
 *                  — 봉인이 admin 을 열면서 오히려 **새로 노출된** 자리다
 *
 * 그래서 게이트가 아니라 **문자열**을 센다. 새 화면이 요금 문구를 넣으면 걸린다.
 *
 * 조건부로 갈라 둔 것은 통과시킨다 — 같은 줄에 `OPEN_BETA` 가 있으면 봉인이
 * 닿는 자리다. 주석은 보지 않는다(제품이 내보내는 건 코드지 산문이다).
 */

const REPO = join(__dirname, '..', '..', '..');
const UI_ROOT = join(REPO, 'src');

/** 화면에 뜨면 «결제 체계가 있다» 로 읽히는 표현. */
const PRICING_WORDS = [
  '플랜',
  '요금',
  '구독',
  '업그레이드',
  '결제',
  'Pro 플랜',
  '엔터프라이즈 온보딩',
];

/**
 * 문구가 아니라 **배선**인 것들. 이름·식별자·엔드포인트는 화면에 안 뜬다.
 * 지우는 게 위험하므로 사유를 각각 적는다 — 조용한 제외 금지.
 */
const NOT_USER_TEXT = [
  /billingEnabled/, // 상태 변수명
  /\/api\/billing/, // 엔드포인트 경로
  /\/api\/checkout/, // 엔드포인트 경로
  /STRIPE_|stripe/i, // 환경변수·SDK 식별자
  /tenant\.plan/, // 데이터 필드 접근
  /import\s/, // import 문
];

/**
 * 이 문구에 봉인이 닿는가 — 줄 하나가 아니라 **주변 블록**을 본다.
 *
 * 줄 단위로 `OPEN_BETA` 를 찾으면 여러 줄 삼항의 else 가지가 오탐으로 잡힌다.
 * 조건은 위쪽 줄에 있고 문구는 아래 줄에 있기 때문이다(실측: 내가 방금 고친
 * 두 자리가 그대로 위반으로 나왔다). 조건과 문구가 붙어 있는 게 정상이므로
 * 좁은 창이면 충분하다.
 */
const SEAL_WINDOW = 4;

function sealedNear(lines: string[], index: number): boolean {
  const from = Math.max(0, index - SEAL_WINDOW);
  const to = Math.min(lines.length - 1, index + SEAL_WINDOW);
  for (let i = from; i <= to; i += 1) {
    if (lines[i].includes('OPEN_BETA')) return true;
  }
  return false;
}

/**
 * 결제 UI 는 `billingEnabled === true` 일 때만 그린다. 그 값의 출처인
 * `/api/billing/status` 는 `STRIPE_BILLING_ENABLED=false` 에서 `enabled:false`
 * 를 돌려준다(실측 2026-08-01). OPEN_BETA 와 **별개의 두 번째 잠금**이라
 * 여기서 다시 요구하지 않는다 — 대신 그 잠금이 실재하는지는 아래에서 센다.
 */
const BILLING_UI_FILE = 'src/app/(with-nav)/settings/page.tsx';

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    // `$` 를 쓰지 않는다 — CRLF 에서 `\r` 이 줄 종결자라 매칭되지 않는다.
    .map((line) => line.replace(/\/\/.*/, ''))
    .join('\n');
}

function uiFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => !f.includes('__tests__'));
}

describe('제출본 화면에 요금·결제 표현이 없다', () => {
  const files = uiFiles();

  it('화면 파일을 실제로 훑는다 — 0 개를 훑고 통과하면 검사가 아니다', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('요금 문구는 전부 OPEN_BETA 로 갈라져 있다', () => {
    const naked: string[] = [];
    for (const rel of files) {
      if (rel === BILLING_UI_FILE) continue; // 두 번째 잠금(billingEnabled) 소관 — 아래에서 따로 센다
      const lines = stripComments(readFileSync(join(REPO, ...rel.split('/')), 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (!PRICING_WORDS.some((w) => line.includes(w))) return;
        if (NOT_USER_TEXT.some((re) => re.test(line))) return;
        if (sealedNear(lines, i)) return;
        naked.push(`${rel.split('/').join(sep)}:${i + 1}  ${line.trim().slice(0, 72)}`);
      });
    }
    expect(naked).toEqual([]);
  });

  /**
   * 결제 UI 파일을 위에서 면제했으니 **그 면제의 근거가 실재하는지** 센다.
   * 면제만 하고 근거를 안 보면 그 파일은 영영 사각이 된다.
   */
  it('결제 UI 는 billingEnabled 로 이중 잠금돼 있다', () => {
    const code = stripComments(readFileSync(join(REPO, ...BILLING_UI_FILE.split('/')), 'utf8'));
    expect(code).toContain("fetch('/api/billing/status'");
    expect(code).toContain('billingEnabled === true');
    expect(code).toContain('disabled={upgrading || billingEnabled !== true}');
  });

  /** 탐지가 발화하는지 — 실제로 남아 있던 두 문구를 그대로 건다. */
  it('탐지 규칙이 발화한다', () => {
    const revived = [
      '        블록체인 거래·제3자 공증·법적 서명을 의미하지 않습니다. Pro 플랜 이상 필요.',
      '        플랜·SSO 등 테넌트 설정은 엔터프라이즈 온보딩 시 ESVA 관리팀이 구성합니다.',
    ];
    for (const line of revived) {
      expect(PRICING_WORDS.some((w) => line.includes(w))).toBe(true);
      expect(NOT_USER_TEXT.some((re) => re.test(line))).toBe(false);
      expect(line.includes('OPEN_BETA')).toBe(false);
    }
    // 배선은 통과해야 한다
    expect(NOT_USER_TEXT.some((re) => re.test("  void fetch('/api/billing/status')"))).toBe(true);
  });
});
