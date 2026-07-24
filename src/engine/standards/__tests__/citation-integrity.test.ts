import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  KNOWN_CLAUSES,
  STANDARD_ORIGINS,
  citationOrigin,
  isKnownCitation,
  unverifiedReason,
} from '../citation-registry';
import { createSource } from '@engine/sjc/types';

// ============================================================
// 인용 무결성 계약
// ============================================================
// 이 저장소는 기준서 원문 문장을 담지 않으므로, 제품이 내보내는 근거는
// 조항 번호 하나다. 대조할 원문이 내부에 없어 번호가 틀려도 잡히지 않는다.
//
// 실제로 전압강하 조항이 계산기 계층에서는 232.51, 기준서 엔진·전문팀·
// 테스트에서는 232.52로 갈라진 채 9곳에 퍼져 있었다. 이 계약은 그 종류의
// 드리프트를 다음부터 커밋 시점에 막는다.
// ============================================================

const SRC_ROOT = join(__dirname, '..', '..', '..');

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      collectSourceFiles(full, found);
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) found.push(full);
  }
  return found;
}

/** `createSource('KEC', '232.52')` 형태의 인용을 파일에서 뽑는다. */
function extractCitations(contents: string): Array<{ standard: string; clause: string }> {
  const pattern = /createSource\(\s*'([^']+)'\s*,\s*'([^']+)'/g;
  const found: Array<{ standard: string; clause: string }> = [];
  let match = pattern.exec(contents);
  while (match !== null) {
    found.push({ standard: match[1], clause: match[2] });
    match = pattern.exec(contents);
  }
  return found;
}

describe('인용 무결성 — 원문을 담지 않으므로 조항 번호가 유일한 근거다', () => {
  const files = collectSourceFiles(SRC_ROOT);

  test('production 코드의 모든 createSource 인용이 허용 목록에 있다', () => {
    const unknown: string[] = [];
    for (const file of files) {
      for (const { standard, clause } of extractCitations(readFileSync(file, 'utf8'))) {
        if (!isKnownCitation(standard, clause)) {
          unknown.push(`${file.slice(SRC_ROOT.length + 1)}: ${standard} ${clause}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  test('허용된 모든 발행기관에 원문 확보 경로가 있다', () => {
    for (const standard of Object.keys(KNOWN_CLAUSES)) {
      const origin = citationOrigin(standard);
      expect(origin).toBeDefined();
      expect(origin!.url).toMatch(/^https:\/\//);
      expect(origin!.publisher.length).toBeGreaterThan(0);
    }
  });

  test('createSource가 원문 경로를 자동으로 붙인다 — 사용자가 원문을 확인할 수 있어야 한다', () => {
    const tag = createSource('KEC', '232.52', { edition: '2021' });
    expect(tag.url).toBe(STANDARD_ORIGINS.KEC.url);
    expect(tag.edition).toBe('2021');
  });

  test('호출자가 더 구체적인 링크를 주면 그것을 덮어쓰지 않는다', () => {
    const explicit = 'https://www.motie.go.kr/kor/article/ATCLc01b2801b/68697/view';
    expect(createSource('KEC', '232.52', { url: explicit }).url).toBe(explicit);
  });

  test('미등록 발행기관은 url 없이 남는다 — 없는 링크를 지어내지 않는다', () => {
    expect(createSource('사내규정', '3.1').url).toBeUndefined();
  });

  test('전압강하 조항은 저장소 내 통일과 원문 대조를 구분해 표시한다', () => {
    // 232.52로 통일했지만 발행기관 원문 대조는 아직이다. 그 사실을 지운 채
    // "확인됨"으로 넘어가지 않는다.
    expect(unverifiedReason('KEC', '232.52')).toContain('대조하지 않았다');
  });

  test('전압강하 인용이 저장소 전체에서 하나로 통일돼 있다', () => {
    // 레지스트리 자신은 예외다 — 어떤 번호에서 어디로 정렬했는지를 기록으로
    // 남겨야 하므로 옛 번호가 사유 문자열에 등장한다.
    const registry = join('engine', 'standards', 'citation-registry.ts');
    const drifted: string[] = [];
    for (const file of files) {
      const relative = file.slice(SRC_ROOT.length + 1);
      if (relative === registry) continue;
      if (readFileSync(file, 'utf8').includes('232.51')) drifted.push(relative);
    }
    expect(drifted).toEqual([]);
  });
});
