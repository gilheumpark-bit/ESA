import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 계산 단계에 붙는 `standardRef` 가 **실재하는 근거**인지 본다.
 *
 * 사용자는 계산 결과 옆의 조항 번호를 근거로 읽는다. 번호가 실재해도
 * 그 조항이 그 계산과 무관하면 없느니만 못하다 — 감리 제출물에 엉뚱한
 * 조항이 붙는다.
 *
 * 실측 2026-07-28, KEC 전문 색인(시행 2026.1.5) 대조:
 *   차단기 Ib≤In≤Iz     KEC 212.3   → 212.3 은 "보호장치의 종류 및 특성".
 *                                     이 부등식은 212.4.1 "도체와 과부하
 *                                     보호장치 사이의 협조" 다.
 *   케이블 온도보정 Kt   KEC 232.3   → 232.3 은 "배선설비 적용 시 고려사항".
 *                                     허용전류 결정은 232.5.2 다.
 *   수용률·부등률·최대수요 KEC 232.2 → 232.2 는 "배선설비 공사의 종류".
 *                                     **KEC 에 수요 산정 조항 자체가 없다**
 *                                     (색인 전문 검색: 수용률·부등률·부하율·
 *                                     최대수요 0 건).
 *   역률 보상 kvar       KEC 232     → 232 는 "배선설비". 역률 관련 조항은
 *                                     234.1.7 "보상 커패시터" 뿐인데 그건
 *                                     **등기구 내부** 콘덴서다(234.1 등기구의
 *                                     시설). 수변전 역률 개선은 KEC 소관이
 *                                     아니라 한전 전기공급약관(역률 요금)이다.
 *
 * 근거가 없는 것을 없다고 두는 것이 이 게이트의 요지다. 틀린 조항을 다는
 * 것보다 조항을 안 다는 편이 정직하다.
 */

const REPO = join(__dirname, '..', '..', '..', '..');

/**
 * KEC 에 근거 조항이 **없는** 주제. 여기 파일은 KEC 를 인용하면 안 된다.
 * 근거가 생기면(고시 개정 등) 목록에서 빼고 실제 조항을 달아라.
 */
const NO_KEC_BASIS: Array<{ file: string; why: string }> = [
  { file: 'power/demand-diversity.ts', why: '수용률·부등률·부하율 — KEC 에 조항 없음(설계 관행)' },
  { file: 'power/max-demand.ts', why: '최대수요 산정 — KEC 에 조항 없음(설계 관행)' },
  { file: 'motor/power-factor-correction.ts', why: '수변전 역률 개선 — 한전 전기공급약관 소관' },
  { file: 'power/reactive-power.ts', why: '무효전력 보상 — 한전 전기공급약관 소관' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '__tests__') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(p)) out.push(p);
  }
  return out;
}

const CALC = join(REPO, 'src', 'engine', 'calculators');
const KEC_REF = /standardRef:\s*'KEC[\s-]*([\d.]*)/g;

describe('계산 단계의 근거 조항', () => {
  const files = walk(CALC);

  it('계산기를 실제로 읽는다', () => {
    expect(files.length).toBeGreaterThan(30);
    // 어딘가에는 KEC 인용이 있어야 한다 — 0 건이면 정규식이 죽은 것이다.
    const anyRef = files.some((f) => KEC_REF.test(readFileSync(f, 'utf8')));
    KEC_REF.lastIndex = 0;
    expect(anyRef).toBe(true);
  });

  it.each(NO_KEC_BASIS)('$file 는 KEC 를 인용하지 않는다 — $why', ({ file }) => {
    const full = join(CALC, ...file.split('/'));
    const refs = [...readFileSync(full, 'utf8').matchAll(KEC_REF)].map((m) => `KEC ${m[1]}`);
    expect(refs).toEqual([]);
  });

  /**
   * 과부하 보호 협조는 212.4.1 이다. 212.3(보호장치의 종류 및 특성)으로
   * 되돌아가면 다시 어긋난다.
   */
  it('차단기 정격 협조는 212.4.1 을 인용한다', () => {
    const src = readFileSync(join(CALC, 'protection', 'breaker-sizing.ts'), 'utf8');
    const refs = new Set([...src.matchAll(KEC_REF)].map((m) => m[1]));
    expect([...refs].sort()).toEqual(['212.4.1']);
  });

  it('케이블 허용전류·온도보정은 232.5 계열을 인용한다', () => {
    const src = readFileSync(join(CALC, 'cable', 'cable-sizing.ts'), 'utf8');
    const refs = [...src.matchAll(KEC_REF)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    // 전압강하(232.3.9)는 같은 파일에 있어도 된다. 232.3 단독은 안 된다.
    expect(refs.filter((r) => r === '232.3')).toEqual([]);
  });
});
