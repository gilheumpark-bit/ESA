/**
 * KEC 가 폐지한 용어를 KEC 근거로 제시하지 않는다.
 *
 * 번호가 실재하고(clause-numbers) 표제도 맞아도(clause-titles) 여전히 틀릴 수
 * 있다 — **그 개념 자체가 현행에 없는 경우**다. 종별 접지가 그랬다:
 *
 *   제1종 10Ω · 제2종 150/Ig · 제3종 100Ω · 특별 제3종 10Ω
 *
 * 세 곳이 이걸 "KEC 기준" 으로 달고 있었다(calc-thresholds · electrical ·
 * kec-full). KEC(2021.1.1 시행)는 종별 접지를 폐지하고 계통접지(TN/TT/IT)와
 * 142.2 접지극·접지저항 / 142.5 변압기 중성점 접지 / 142.6 공통·통합접지로
 * 갔다. 현행 색인 1,834 항 전수에서 "제1~3종 접지공사" 표제는 0 건이다.
 *
 * 폐지된 값을 현행 근거로 제시하면 감리에서 반박당하고, 더 나쁘게는
 * 계산기가 그 값으로 판정을 낸다.
 *
 * 값 자체를 금지하는 게 아니다 — 기존 도면에 그 표기가 남아 있어 읽어야
 * 할 때가 있다. 금지하는 것은 **같은 자리에서 KEC 를 근거로 대는 것**이다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..', '..');

/** KEC 가 폐지했거나 애초에 담은 적 없는 개념 — KEC 와 같은 줄에 오면 안 된다. */
const ABOLISHED: Array<{ term: RegExp; why: string }> = [
  { term: /(특별\s*)?제?\s*[1-3]\s*종\s*접지/, why: 'KEC 2021 이 종별 접지를 폐지했다 (→ 계통접지 TN/TT/IT · 142.2/142.5/142.6)' },
  // `접지` 를 붙이지 않고 "제3종"·"특별3종" 으로 줄여 쓴 것도 같은 주장이다.
  // 실측 2026-07-28: `general: 100, // KEC 142.2 제3종` 이 위 정규식을
  // 빠져나가 있었다 — 게이트가 전 파일을 훑고도 표기 하나에 눈이 멀었다.
  // `제`·`특별` 접두를 요구해 "3종류" 같은 말에는 안 걸리게 한다.
  { term: /제\s*[1-3]\s*종|특별\s*제?\s*[1-3]\s*종/, why: '종별 접지 표기(축약) — KEC 2021 폐지' },
  { term: /접지공사의?\s*종류/, why: '종별 접지 체계 자체가 폐지됐다' },
];

/** 이 줄이 KEC 를 근거로 대고 있는가. */
const CITES_KEC = /KEC/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe('KEC 가 폐지한 용어', () => {
  const files = walk(join(REPO, 'src'));

  it('파일을 실제로 훑는다 — 0 개를 훑고 통과하면 검사가 아니다', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('검사기가 판별한다 — 항상 거짓이면 게이트가 아니다', () => {
    expect(ABOLISHED[0].term.test('KEC 142.5 특별 3종 접지')).toBe(true);
    expect(ABOLISHED[0].term.test('KEC 142.2 접지극의 시설 및 접지저항')).toBe(false);
  });

  it('폐지된 개념을 KEC 근거로 제시하지 않는다', () => {
    const violations: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      for (const [i, line] of lines.entries()) {
        if (!CITES_KEC.test(line)) continue;
        // 폐지 사실을 적거나, **구 체계 → 현행 KEC** 대응을 보여 주는 줄은
        // 허용한다. 현장 도면에는 아직 종별 표기가 남아 있어서 "제3종 →
        // KEC 기기 보호 접지" 같은 대응표가 실무에 필요하다. 금지하는 것은
        // 폐지된 종별을 **현행 근거인 것처럼** 제시하는 것이다.
        if (/폐지|아니다|아님|구 판단기준|이 아니라|→|구 내선규정|대응/.test(line)) continue;
        for (const { term, why } of ABOLISHED) {
          if (term.test(line)) {
            violations.push(`${relative(REPO, f)}:${i + 1}  ${line.trim().slice(0, 70)}  — ${why}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
