/**
 * 지식 그래프의 엣지가 실재하는 노드를 가리키는지 본다.
 *
 * 이 그래프는 개념 → 규격 연결의 정본이라 검색·추천이 여기를 따라간다.
 * 엣지가 없는 노드를 가리키면 그 연결은 조용히 사라진다 — 예외도 없고
 * 타입 에러도 없다. 노드를 재번호하면서 엣지를 안 고치면 그 상태가 된다.
 *
 * 실측 2026-07-27: KEC 노드 7 개가 전부 틀린 번호였다(140·210·220·230·310·520
 * 은 KEC 에 없고, 232 는 "보호장치" 로 달렸지만 실제로는 배선설비다).
 * 정정하며 노드 id 를 바꿨더니 엣지 13 개가 없는 노드를 가리키게 됐는데
 * **2,128 개 테스트가 전부 초록이었다.**
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'src/lib/knowledge-graph.ts'), 'utf8');

/**
 * 노드 선언. 두 꼴이 있다 —
 *   `['c-ampacity', '허용전류', 'Ampacity'],`                     (개념)
 *   `['s-kec-142', 'KEC 142 …', 'KEC 142 …', { parent: … }],`     (규격)
 * 둘째·셋째가 **id 가 아닌 표시 문자열**이라는 게 엣지와의 차이다.
 */
const NODE = /\['([a-z]-[\w.-]+)',\s*'((?!(?:[a-z]-[\w.-]+)')[^']*)',\s*'[^']*'\s*[,\]]/g;

/** `['c-grounding', 's-kec-142', 0.95]` — 둘 다 id 이고 뒤에 가중치가 온다. */
const EDGE = /\['([a-z]-[\w.-]+)',\s*'([a-z]-[\w.-]+)',\s*(?:'[^']*',\s*)?[\d.]+\]/g;

describe('지식 그래프 정합', () => {
  const nodes = new Set([...SRC.matchAll(NODE)].map((m) => m[1]));
  const edges = [...SRC.matchAll(EDGE)].map((m) => [m[1], m[2]] as const);

  it('노드와 엣지를 실제로 읽는다 — 0 개를 읽고 통과하면 검사가 아니다', () => {
    expect(nodes.size).toBeGreaterThan(30);
    expect(edges.length).toBeGreaterThan(30);
  });

  it('엣지가 실재하는 노드만 가리킨다', () => {
    const dangling = edges
      .flatMap(([from, to]) => [from, to])
      .filter((id) => !nodes.has(id))
      .filter((id, i, a) => a.indexOf(id) === i)
      .sort();
    expect(dangling).toEqual([]);
  });
});
