import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 사용자에게 **내보내는** 조항 표제가 그 조항의 실제 표제와 맞는지 본다.
 *
 * 이미 있는 `clause-titles-match` 는 조항이 **정의된 곳**(레지스트리·카탈로그·
 * 자동완성)을 검사한다. 그런데 심사 팀들은 판정 행을 만들 때 `clause` 와
 * `title` 을 **그 자리에서 손으로 써서** 내보낸다 — 정의를 안 거치므로
 * 기존 게이트 밖이다. 초록인 채로 틀린 표제가 화면에 나갔다.
 *
 * 실측 2026-07-28:
 *   `clause: '311.1', title: '변압기 용량'`  → 311.1 은 "절연수준의 선정"
 *                                             변압기 용량은 341.1.2 다
 *   `clause: '232.3', title: '허용전류 산정'` → 232.3 은 "배선설비 적용 시
 *                                             고려사항", 허용전류는 232.5 다
 *
 * 판정 규칙: 내보내는 표제가 공식 표제에 담기면(축약) 통과. 아니면
 * `DECLARED_PARAPHRASE` 에 **공식 표제와 함께** 적어야 한다. 공식 표제를
 * 눈앞에 두고도 `311.1 → 변압기 용량` 을 적어 넣기는 어렵다 — 그게 이
 * 게이트의 작동 원리다. 재번호로 공식 표제가 바뀌면 선언이 깨져 눈에 띈다.
 */

const REPO = join(__dirname, '..', '..', '..', '..', '..');

/** 공식 표제와 다르게 내보내는 것을 의식적으로 등록한 목록. */
const DECLARED_PARAPHRASE: Record<string, { official: string; shown: string[] }> = {
  // 차단기 정격 적합성은 보호장치 특성의 일부다. 조항은 맞고 표제만 좁혔다.
  '212.3': { official: '보호장치의 종류 및 특성', shown: ['차단기 정격'] },
  // 전선관 수용률 검토를 금속관공사 조항에 건다. 조항은 맞고 표제만 좁혔다.
  '232.12': { official: '금속관공사', shown: ['전선관 산정 보류', '배선 경로·전선관 검토'] },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next' || n === '.git') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

function officialTitles(): Map<string, string> {
  const map = new Map<string, string>();
  // 인용된 조항의 표제 픽스처(커밋됨). 전문 색인은 gitignore 라 CI 에 없다.
  for (const line of readFileSync(join(REPO, 'fixtures', 'kec', 'clause-titles.tsv'), 'utf8').split(/\r?\n/)) {
    const [num, title] = line.split('\t');
    if (num && title) map.set(num.trim(), title.trim());
  }
  return map;
}

// `standard: 'KEC'` 로 묶인 것만 본다 — NEC·IEC 조항 번호가 KEC 번호와
// 우연히 겹치면 엉뚱한 표제와 대조하게 된다.
const EMITTED = /standard:\s*'KEC',\s*clause:\s*'([\d.]+)',\s*title:\s*'([^']+)'/g;

describe('내보내는 조항 표제', () => {
  const official = officialTitles();
  const pairs: Array<{ file: string; clause: string; title: string }> = [];
  for (const file of walk(join(REPO, 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(EMITTED)) {
      pairs.push({ file: file.replace(REPO, '').replace(/\\/g, '/'), clause: m[1], title: m[2] });
    }
  }

  // 정규식이 죽으면 0 쌍을 검사하고 통과한다.
  it('내보내는 쌍을 실제로 찾는다', () => {
    expect(official.size).toBeGreaterThan(50);
    expect(pairs.length).toBeGreaterThanOrEqual(10);
  });

  /**
   * 픽스처에 없는 번호를 **건너뛰면 안 된다.**
   *
   * 처음엔 `if (!off) continue` 였다. 그런데 픽스처는 코드에서 인용된 번호만
   * 담고 그 코드가 곧 검사 대상이다 — 새로 틀린 번호를 쓰면 픽스처에 없으니
   * 조용히 통과한다. 실제로 `311.1` 결함을 다시 심었더니 게이트가 초록이었다.
   * 검사 대상에서 파생된 기준으로 검사하는 닫힌 순환이다.
   *
   * 그래서 모르는 번호는 실패로 낸다. 해소는 `scripts/build-kec-title-fixture.mjs`
   * 를 돌려 표제를 픽스처에 넣는 것이고, 그 과정에서 공식 표제를 보게 된다.
   */
  it('내보내는 번호의 공식 표제를 전부 알고 있다', () => {
    const unknown = [...new Set(pairs.map((p) => p.clause))]
      .filter((c) => !official.has(c))
      .sort();
    expect(unknown).toEqual([]);
  });

  it('내보내는 표제가 공식 표제와 어긋나지 않는다', () => {
    const wrong: string[] = [];
    for (const p of pairs) {
      const off = official.get(p.clause);
      // 위 검사가 모르는 번호를 이미 실패로 낸다. 여기서는 넘어간다.
      if (!off) continue;
      // 한글이 없는 표제(테스트 픽스처의 'VD' 등)는 대조할 것이 없다.
      if (!/[가-힣]/.test(p.title)) continue;
      if (off.includes(p.title) || p.title.includes(off)) continue;
      const declared = DECLARED_PARAPHRASE[p.clause];
      if (declared && declared.shown.includes(p.title)) continue;
      wrong.push(`${p.file} — KEC ${p.clause} 를 "${p.title}" 로 내보냄 (공식: "${off}")`);
    }
    expect(wrong).toEqual([]);
  });

  // 선언이 낡으면 그 선언은 더 이상 아무것도 안 지킨다.
  it('선언된 의역의 공식 표제가 현행과 같다', () => {
    for (const [clause, d] of Object.entries(DECLARED_PARAPHRASE)) {
      expect([clause, official.get(clause)]).toEqual([clause, d.official]);
    }
  });
});
