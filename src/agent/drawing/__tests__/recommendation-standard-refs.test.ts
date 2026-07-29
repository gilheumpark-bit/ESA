import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 도면 권고가 인용하는 KEC 조문이 **실재하고 표제까지 맞는지** 검사한다.
 *
 * 실측 2026-07-29: 이 파일만 `'KEC 보호 일반'`·`'KEC 접지'` 처럼 조문 번호가
 * 없는 문구를 달고 있었다. 나머지 코드베이스는 `KEC 142.2 접지극의 시설 및
 * 접지저항` 처럼 번호와 표제를 함께 쓴다. 번호가 없으면 전기 기술자가
 * 원문을 펴서 대조할 수가 없다 — 틀릴 수 없는 대신 쓸모도 없는 인용이다.
 *
 * 상호참조 감사(`scripts/audit-reference-notes.mjs`)는 `src/engine/standards`
 * 만 훑기 때문에 이 표면은 한 번도 안 봤다.
 *
 * 번호 실재만 보면 **실재하는 두 번호를 맞바꿔 달아도 통과한다**
 * (`fixtures/kec/clause-titles.tsv` 머리말이 지적하는 바로 그 구멍).
 * 그래서 표제까지 대조한다.
 */

const TITLES = new Map(
  readFileSync(join(process.cwd(), 'fixtures', 'kec', 'clause-titles.tsv'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [number, ...rest] = line.split('\t');
      return [number, rest.join('\t').trim()] as const;
    }),
);

const SOURCE = readFileSync(
  join(process.cwd(), 'src', 'agent', 'drawing', 'recommendation-engine.ts'),
  'utf8',
);

/** `'KEC 212 과전류에 대한 보호'` 같은 문자열만 뽑는다. */
const KEC_REFS = [...SOURCE.matchAll(/'KEC ([^']*)'/g)].map((m) => m[1]);

describe('도면 권고의 KEC 인용', () => {
  it('KEC 인용이 실제로 있다 — 공회전 반증', () => {
    expect(KEC_REFS.length).toBeGreaterThan(0);
    expect(TITLES.size).toBeGreaterThan(50);
  });

  it.each(KEC_REFS)('«KEC %s» 는 번호로 시작한다', (ref) => {
    expect(ref).toMatch(/^\d{3}(\.\d+)*(\s|$)/);
  });

  it.each(KEC_REFS)('«KEC %s» 의 번호가 색인에 실재한다', (ref) => {
    const number = ref.split(/\s/)[0];
    expect(TITLES.has(number)).toBe(true);
  });

  it.each(KEC_REFS)('«KEC %s» 의 표제가 그 번호의 표제와 같다', (ref) => {
    const [number, ...rest] = ref.split(/\s/);
    const cited = rest.join(' ').trim();
    if (cited.length === 0) return; // 번호만 인용하는 것도 허용
    expect(cited).toBe(TITLES.get(number));
  });

  /** 규칙이 실제로 무언가를 걸러 내는지 — 조용히 0 건이면 영원히 초록이다. */
  it('탐지 규칙이 발화한다', () => {
    expect('보호 일반').not.toMatch(/^\d{3}(\.\d+)*(\s|$)/);
    expect(TITLES.has('999')).toBe(false);
    expect(TITLES.get('212')).not.toBe(TITLES.get('142'));
  });
});
