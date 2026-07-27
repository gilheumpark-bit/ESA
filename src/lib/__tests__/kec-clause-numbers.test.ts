/**
 * KEC 조항 번호는 실재하는 번호여야 한다.
 *
 * 리포는 전압강하를 `232.51`·`232.52` 로, 허용전류를 `232.41` 로 인용하고
 * 있었다. 전부 틀린 인용인데 **틀린 이유가 셋이 다르다** —
 *
 *   232.51  케이블공사        실재한다. 전압강하 조항이 아닐 뿐이다.
 *   232.41  케이블트레이공사  실재한다. 허용전류 조항이 아닐 뿐이다.
 *   232.52  (없음)            아예 없는 번호다.
 *
 * 이 파일은 처음에 셋 다 "KEC 에 없는 번호"로 잠갔다. 그건 틀렸다 —
 * 둘은 실재하고, 그래서 이 잠금은 232.51 을 케이블공사로 쓰는 정당한 인용까지
 * 막았다. 2026-07-27 에 실재 확인하고 바로잡았다.
 *
 * 맞는 자리:
 *   232.3.9 수용가 설비에서의 전압강하   ← 전압강하
 *   232.5   허용전류                     ← 허용전류(232.5.2 허용전류의 결정)
 *
 * 번호가 실재하는데 내용이 남의 것인 경우는 여기서 못 본다 — 그건
 * `kec/__tests__/clause-titles-match.test.ts` 가 표제로 대조한다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(join(process.cwd(), 'src'));

/**
 * KEC 에 **없는** 것으로 확인된 번호. 되살아나면 FAIL.
 *
 * 232.51·232.41 은 여기 있었으나 실재 확인 후 뺐다 — 실재하는 번호를
 * 금지어로 두면 정당한 인용(케이블공사·케이블트레이공사)까지 막힌다.
 */
const RETIRED = ['232.52'];

describe('KEC 조항 번호', () => {
  it.each(RETIRED)('%s 는 KEC 에 없는 번호다 — 인용하지 않는다', (clause) => {
    const offenders: string[] = [];
    for (const file of FILES) {
      // 테스트는 없는 번호를 **일부러** 넣어 본다("232.52 가 단락보호로 새지
      // 않는가"). 잠글 대상은 제품 코드가 그것을 조항으로 인용하는 것이다.
      if (file.includes('__tests__')) continue;
      const source = readFileSync(file, 'utf-8');
      for (const [i, line] of source.split('\n').entries()) {
        if (!line.includes(clause)) continue;
        // 주석에서 "예전엔 이랬다" 로 설명하는 것은 허용한다.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        offenders.push(`${file.replace(process.cwd(), '')}:${i + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('전압강하는 232.3.9 를 쓴다', () => {
    const comparator = readFileSync(join(process.cwd(), 'src/engine/chain/standard-comparator.ts'), 'utf-8');
    expect(comparator).toContain("clause: 'KEC 232.3.9'");
  });

  it('허용전류 표의 출처는 232.5 다', () => {
    const ampacity = readFileSync(join(process.cwd(), 'src/data/ampacity-tables/kec-ampacity.ts'), 'utf-8');
    expect(ampacity).toContain("createSource('KEC', '232.5'");
  });
});
