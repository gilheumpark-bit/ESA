import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **KEC 에 근거가 없는 계산기는 KEC 를 인용하지 않는다.**
 *
 * 조항 번호 게이트(`standards/kec/__tests__/clause-citations-repo-wide`)는
 * 번호가 **실재하는지**만 본다. 232 도 232.2 도 실재하므로 그 게이트를 통과한다.
 * 그런데 232 는 「배선설비」, 232.2 는 「배선설비 공사의 종류」이고 역률·수용률과
 * 아무 상관이 없다 — 번호가 맞아도 내용이 어긋나면 감리 제출물에 엉뚱한 조항이
 * 붙는다(§2.10 도메인 진실).
 *
 * 이 인용은 **두 번 되살아났다.** 2026-07-28 에 `steps[].standardRef` 만 고쳐
 * 「KEC 는 역률을 규정하지 않는다」는 헤더 주석까지 달아 놓고, 바로 아래
 * `source[]` 와 `createJudgment(…, ref)` 는 그대로 뒀다. 근거가 세 필드로
 * 흩어져 있다는 걸 몰랐기 때문이다. 파일이 자기 헤더와 모순된 채로 더 살았다.
 *
 * 그래서 필드를 열거하지 않고 **코드에 KEC 글자가 없는지**로 잠근다. 새 필드가
 * 생겨도 걸린다.
 *
 * 원문 대조(2026-07-31 · 기후에너지환경부 공고 제2025-227호 「2026년 KEC
 * 일부개정 전문」, 시행 2026-01-05):
 *   역률   표제 1 건 — 441.4 전기철도차량의 역률. 일반 수용가와 무관하다.
 *   수용률·부등률·부하율·최대수요   표제 0 건. 조항 자체가 없다.
 */

const REPO = join(__dirname, '..', '..', '..', '..');

/** KEC 에 대응 조항이 없다고 판정된 계산기와 그 실제 근거. */
const NO_KEC_BASIS: Readonly<Record<string, string>> = {
  'power/power-factor.ts': '한전 전기공급약관 역률 요금 (0.9 기준)',
  'power/reactive-power.ts': 'IEC 60831 (콘덴서)',
  'power/max-demand.ts': '내선규정 / NEC Article 220 (부하 산정)',
  'power/demand-diversity.ts': '내선규정 / NEC Article 220 (부하 산정)',
  'power/single-phase-power.ts': 'IEC 80000-6 (정의량)',
  'power/three-phase-power.ts': 'IEC 80000-6 (정의량)',
};

/**
 * 주석을 지운다. **제품이 내보내는 건 코드지 산문이 아니다.**
 *
 * 이 파일들의 주석에는 「KEC 232.2 는 배선설비 공사의 종류다 … 조항 자체가
 * 없다」 같은 정정 기록이 여러 줄에 걸쳐 있다. 줄 단위로 «없다» 를 찾아
 * 면제하면 그 문구가 둘째 줄에 있는 순간 첫 줄이 위반으로 잡힌다 — 설명을
 * 성실히 쓸수록 실패하는 규칙은 오래 못 간다.
 *
 * 줄 주석에 `$` 를 쓰지 않는다. 이 저장소는 CRLF 이고 JS 정규식에서 `\r` 은
 * 줄 종결자라 `//.*$` 는 한 건도 매칭되지 않는다.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => line.replace(/\/\/.*/, ''))
    .join('\n');
}

describe('KEC 근거가 없는 계산기는 KEC 를 인용하지 않는다', () => {
  const sources = Object.keys(NO_KEC_BASIS).map((rel) => {
    const raw = readFileSync(join(REPO, 'src', 'engine', 'calculators', rel), 'utf8');
    return { rel, raw, code: stripComments(raw) };
  });

  it('대상 파일을 실제로 읽는다 — 0 개를 읽고 통과하면 검사가 아니다', () => {
    expect(sources).toHaveLength(Object.keys(NO_KEC_BASIS).length);
    for (const { rel, raw } of sources) {
      expect(raw.length).toBeGreaterThan(500);
      expect(NO_KEC_BASIS[rel].length).toBeGreaterThan(5);
    }
  });

  it('어느 필드로도 KEC 를 근거로 달지 않는다', () => {
    const violations: string[] = [];
    for (const { rel, code } of sources) {
      code.split('\n').forEach((line, i) => {
        if (!line.includes('KEC')) return;
        violations.push(`${rel}:${i + 1}  ${line.trim().slice(0, 70)}`);
      });
    }
    expect(violations).toEqual([]);
  });

  /** 탐지가 발화하는지 — 실제로 되살아났던 세 형태를 그대로 건다. */
  it('탐지 규칙이 발화한다 — 세 필드 전부', () => {
    const revived = [
      "      createSource('KEC', '232', { edition: '2021' }),",
      "      judgment: createJudgment(pass, message, severity, 'KEC 232'),",
      "      standardRef: 'KEC 232.2',",
    ];
    for (const line of revived) {
      expect(stripComments(line).includes('KEC')).toBe(true);
    }
    // 주석 안의 정정 기록은 통과해야 한다
    expect(stripComments('  // KEC 232.2 는 배선설비 공사의 종류다').includes('KEC')).toBe(false);
    expect(stripComments('/** KEC 는 역률을 규정하지 않는다 */').includes('KEC')).toBe(false);
  });
});
