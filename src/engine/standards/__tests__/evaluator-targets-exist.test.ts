/**
 * 전용 평가기가 거는 조항이 실제로 등록돼 있는지 본다.
 *
 * `dedicated-evaluators.ts` 는 조항 ID 로 평가기를 건다. 그 조항이 없어지면
 * `withArticle(null, …)` 이 되어 **조용히 HOLD 만 낸다** — 예외도 없고
 * 타입 에러도 없다. 조항을 재번호하거나 걷어낼 때 여기가 같이 안 바뀌면
 * 그 평가기는 영영 판정을 못 낸다.
 *
 * 2026-07-27 에 KEC 조항 40 여 건을 재번호하고 30 여 건을 걷어냈다. 그때
 * `KEC-250.1`(욕실) 평가기가 실제로 이 상태가 됐고, 옆 테스트가 우연히
 * 잡아 줬다. 우연에 기대지 않으려고 여기 못을 박는다.
 *
 * 소스가 아니라 **등록부를 조회한다** — 소스에 정의가 있어도 중복 가드에
 * 버려지면 평가기는 못 찾는다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const EVALUATORS = join(process.cwd(), 'src/engine/standards/dedicated-evaluators.ts');

/** `['KEC-232.5.2', …]` 형태로 평가기를 거는 자리에서 조항 ID 만 뽑는다. */
const TARGET = /\['((?:KEC|IEC|JIS|NEC)-[\d.]+)'/g;

describe('전용 평가기의 대상 조항', () => {
  it('평가기가 거는 조항이 전부 등록부에 있다', async () => {
    const [{ KEC_ARTICLES }, { getIECArticle }, { getJISArticle }, { getNECArticleFull }] =
      await Promise.all([
        import('@/engine/standards/kec'),
        import('@/engine/standards/iec/iec-articles'),
        import('@/engine/standards/jis/jis-articles'),
        import('@/engine/standards/nec/nec-articles'),
      ]);

    const src = readFileSync(EVALUATORS, 'utf8');
    const targets = [...src.matchAll(TARGET)].map((m) => m[1]);

    // 정규식이 아무것도 못 잡으면 빈 목록으로 통과한다 — 검사가 무의미해진다.
    expect(targets.length).toBeGreaterThan(10);

    const missing = targets.filter((id) => {
      if (id.startsWith('KEC-')) return !KEC_ARTICLES.has(id);
      if (id.startsWith('IEC-')) return !getIECArticle(id);
      if (id.startsWith('JIS-')) return !getJISArticle(id);
      return !getNECArticleFull(id);
    });
    expect(missing).toEqual([]);
  });
});
