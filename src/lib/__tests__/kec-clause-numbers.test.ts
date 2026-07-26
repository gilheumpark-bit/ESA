/**
 * KEC 조항 번호는 실재하는 번호여야 한다.
 *
 * 리포는 전압강하를 `232.51`·`232.52` 로, 허용전류를 `232.41` 로 인용하고
 * 있었다. 원문 확인(2026-07-26) 결과 그 번호들은 KEC 에 없다.
 *
 *   232.1   적용범위
 *   232.2   배선설비 공사의 종류
 *   232.3   배선설비 적용 시 고려사항
 *   232.3.9 수용가 설비에서의 전압강하   ← 전압강하
 *   232.4   배선설비 선정·설치 시 외부영향
 *   232.5   허용전류                     ← 허용전류(232.5.2 허용전류의 결정)
 *   232.11  합성수지관공사
 *
 * 사용자에게 조항으로 제시되는 값이라 없는 번호를 인용하면 그대로 오정보다.
 * 여기서는 "폐기된 번호가 되살아나지 않는가" 를 잠근다.
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

/** KEC 에 없는 것으로 확인된 번호. 되살아나면 FAIL. */
const RETIRED = ['232.51', '232.52', '232.41'];

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
