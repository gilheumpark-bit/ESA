import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * **계산기가 다는 KEC 근거를 조항 표제와 함께 등록한다.**
 *
 * 번호 게이트는 «실재하는가» 만 본다. 표제 게이트는 «내보내는 표제가 맞는가» 를
 * 보는데, `createSource('KEC', '502')` 는 **번호만 내보내므로 대조할 표제가
 * 없다.** 그 틈으로 태양광·ESS 5 건이 502「용어의 정의」를, 단락전류 계산이
 * 213「과전압에 대한 보호」를 근거로 달고 있었다(2026-07-31 실측·전부 수리).
 *
 * 그래서 표제를 **여기서 강제로 옆에 놓는다.** 이 게이트는 표제를 공식
 * 픽스처와 대조하므로, 새 인용을 넣으면 그 조항의 진짜 표제를 눈앞에 두고
 * 「이게 이 계산의 근거인가」를 판단하게 된다 — `emitted-clause-titles` 와
 * 같은 작동 원리다. 「태양광 DC 케이블 굵기 ← 용어의 정의」를 적어 넣기는
 * 어렵다. 그게 이 파일이 하는 일의 전부이자, 기계가 할 수 있는 전부다.
 *
 * **한계를 분명히 한다.** 표제와 계산 내용이 맞는지는 사람이 본다. 이 게이트는
 * 그 판단을 *강제로 발생시킬* 뿐 대신해 주지 않는다(§2.10 도메인 진실).
 */

const REPO = join(__dirname, '..', '..', '..', '..');
const ROOT = join(REPO, 'src', 'engine', 'calculators');

/** [계산기 경로, 조항 번호, **공식 표제**] — 표제는 픽스처와 대조된다. */
const REGISTRY: readonly (readonly [string, string, string])[] = [
  ['cable/ampacity-compare.ts', '232.5.2', '허용전류의 결정'],
  ['cable/cable-sizing.ts', '232.3.9', '수용가 설비에서의 전압강하'],
  ['cable/cable-sizing.ts', '232.5.2', '허용전류의 결정'],
  ['global/ampacity-global-compare.ts', '232.5', '허용전류'],
  ['grounding/equipotential-bonding.ts', '142.6', '공통접지 및 통합접지'],
  ['grounding/ground-conductor.ts', '142.3.1', '접지도체'],
  ['grounding/ground-resistance.ts', '142.2', '접지극의 시설 및 접지저항'],
  ['grounding/lightning-protection.ts', '152', '외부피뢰시스템'],
  // 244 하위(244.1.2 조건 및 분류 · 244.2.1 시설)로 좁히지 않았다 — 본문을
  // 읽지 않아서다. 용량 산정식 자체는 NFPA 110·IEC 60034 가 준다.
  ['lighting/emergency-generator.ts', '244', '비상용 예비전원설비'],
  ['motor/starting-current.ts', '212.6.3', '저압전로 중의 전동기 보호용 과전류보호장치의 시설'],
  ['power/power-loss.ts', '232.3.9', '수용가 설비에서의 전압강하'],
  ['protection/breaker-sizing.ts', '212.4.1', '도체와 과부하 보호장치 사이의 협조'],
  ['protection/earth-fault.ts', '142.2', '접지극의 시설 및 접지저항'],
  ['protection/rcd-sizing.ts', '211.2.4', '누전차단기의 시설'],
  ['protection/short-circuit.ts', '212.5.1', '예상 단락전류의 결정'],
  ['renewable/battery-capacity.ts', '511.2.4', '이차전지의 시설'],
  ['renewable/grid-connect.ts', '503.2', '시설기준'],
  ['renewable/pcs-capacity.ts', '511.2.6', '전력변환장치의 시설'],
  ['renewable/solar-cable.ts', '522.1.1', '전기배선'],
  ['transformer/transformer-capacity.ts', '341.1.2', '특고압용 변압기의 용량'],
  ['voltage-drop/busbar-vd.ts', '232.3.9', '수용가 설비에서의 전압강하'],
  ['voltage-drop/complex-voltage-drop.ts', '232.3.9', '수용가 설비에서의 전압강하'],
  ['voltage-drop/country-compare-vd.ts', '232.3.9', '수용가 설비에서의 전압강하'],
  ['voltage-drop/three-phase-vd.ts', '232.3.9', '수용가 설비에서의 전압강하'],
  ['voltage-drop/voltage-drop.ts', '232.3.9', '수용가 설비에서의 전압강하'],
];

/** 근거로 쓰는 자리 전부 — 영수증 출처와 단계·판정의 표기를 함께 본다. */
const CITATION = /(?:createSource\('KEC',\s*'|standardRef:\s*'KEC[ -])([\d.]+)'/g;

const OFFICIAL = new Map(
  readFileSync(join(REPO, 'fixtures', 'kec', 'clause-titles.tsv'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t') as [string, string]),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** 코드가 실제로 다는 인용 — `계산기 경로|조항` 집합. */
function citationsInCode(): Set<string> {
  const found = new Set<string>();
  for (const f of walk(ROOT)) {
    const rel = f.slice(ROOT.length + 1).split(sep).join('/');
    for (const m of readFileSync(f, 'utf8').matchAll(CITATION)) found.add(`${rel}|${m[1]}`);
  }
  return found;
}

describe('계산기 KEC 근거 등록부', () => {
  const inCode = citationsInCode();
  const declared = new Set(REGISTRY.map(([rel, clause]) => `${rel}|${clause}`));

  it('인용을 실제로 찾아낸다 — 0 건을 훑고 통과하면 검사가 아니다', () => {
    expect(inCode.size).toBeGreaterThan(15);
    expect(OFFICIAL.size).toBeGreaterThan(50);
  });

  /**
   * 등록부에 적은 표제가 **공식 표제와 글자 그대로 같아야** 한다.
   * 이게 이 게이트의 심장이다 — 틀린 조항을 등록하려면 그 조항의 진짜 표제를
   * 적어야 하고, 그 순간 계산 내용과 안 맞는 게 눈에 보인다.
   */
  it('등록한 표제가 공식 표제와 일치한다', () => {
    const wrong = REGISTRY
      .filter(([, clause, title]) => OFFICIAL.get(clause) !== title)
      .map(([rel, clause, title]) => `${rel}  KEC ${clause}  적음「${title}」 실제「${OFFICIAL.get(clause) ?? '없음'}」`);
    expect(wrong).toEqual([]);
  });

  it('코드의 인용이 전부 등록돼 있다 — 새 인용은 표제를 적어야 들어온다', () => {
    expect([...inCode].filter((k) => !declared.has(k)).sort()).toEqual([]);
  });

  it('등록부에 죽은 항목이 없다 — 인용을 지우면 등록도 지운다', () => {
    expect([...declared].filter((k) => !inCode.has(k)).sort()).toEqual([]);
  });

  /** 탐지가 발화하는지 — 실제로 저질러졌던 짝을 그대로 건다. */
  it('탐지 규칙이 발화한다', () => {
    expect(OFFICIAL.get('232.5.2')).not.toBe('용어의 정의');
    expect([...CITATION.source].length).toBeGreaterThan(10);
    const line = "      createSource('KEC', '502', { edition: '2021' }),";
    expect([...line.matchAll(CITATION)].map((m) => m[1])).toEqual(['502']);
    expect([...`standardRef: 'KEC 502',`.matchAll(CITATION)].map((m) => m[1])).toEqual(['502']);
  });
});
