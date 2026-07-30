import { CALCULATOR_REGISTRY } from '../index';

/**
 * **어떤 계산기가 외부 오라클로 대조됐는지 선언한다.**
 *
 * 왜 필요한가 — 아크플래시 사고의 형태가 이랬다. 어느 판에도 없는 식이
 * 표준 조항을 달고 PPE 등급을 산출했고, 스위트는 전부 초록이었다. 자기
 * 재계산으로는 절대 안 걸린다. 내가 읽은 식을 내가 다시 계산하면 언제나
 * 맞기 때문이다(§2.3 닫힌 순환).
 *
 * 그래서 두 종류를 **이름으로 갈라 둔다**:
 *
 *   EXTERNAL  규격의 공표된 표·정의식과 대조됐다. 근거를 `evidence` 에 적는다.
 *   INTERNAL  손계산·항등식·관계식으로만 잠겼다. 산술은 맞지만 **식 자체가
 *             그 규격의 것인지는 이 저장소가 알지 못한다.**
 *
 * INTERNAL 이 나쁜 게 아니다. 나쁜 것은 INTERNAL 을 EXTERNAL 처럼 읽는 것이다.
 * 이 파일은 그 구분을 코드로 고정해, 「검증됨」이 무엇을 뜻하는지 한 곳에서
 * 보이게 한다.
 *
 * 새 계산기가 들어오면 이 목록에 없어서 검사가 깨진다 — 그때 어느 쪽인지
 * 정하게 된다. 그게 이 파일의 주된 일이다.
 */

type Level = 'EXTERNAL' | 'INTERNAL';

interface Entry {
  level: Level;
  /** EXTERNAL 이면 무엇과 대조했는지. INTERNAL 이면 무엇으로 잠겼는지. */
  evidence: string;
}

/**
 * 외부 대조가 **실제로 이 저장소 안에서 돌고 있는** 것들.
 * 근거는 검증 가능해야 한다 — 「표준을 봤다」가 아니라 어느 표의 어느 값인지.
 */
const REGISTRY: Record<string, Entry> = {
  'temp-correction': {
    level: 'EXTERNAL',
    evidence: 'IEC 60364-5-52 Table B.52.14(PVC 70 °C · 기준 30 °C) 4 점 대조 — '
      + '주변 35/40/45/50 °C 에서 표값 0.94/0.87/0.79/0.71 과 일치',
  },
  'awg-converter': {
    level: 'EXTERNAL',
    evidence: 'ASTM B258 정의식 d = 0.127 × 92^((36−n)/39) — AWG 10/12/2 의 '
      + '지름·단면적·kcmil 이 공표 규격표와 일치. 리포 WIRE_TABLE 상수도 같은 식과 대조',
  },
  'relay-basic': {
    level: 'EXTERNAL',
    evidence: 'IEC 60255 표준반한시 곡선 상수 A = 0.14 · B = 0.02 로 계산하고 '
      + 'TDS 역산과 동작시간이 목표 0.3 s 로 닫히는지 SI·VI·EI 세 곡선에서 확인',
  },
  'lightning-protection': {
    level: 'EXTERNAL',
    evidence: 'IEC 62305-3 Table 2 — 보호레벨 I/II/III/IV 의 회전구체 반경 '
      + '20/30/45/60 m 와 메시 5/10/15/20 m 가 표값과 일치',
  },
  'ground-conductor': {
    level: 'EXTERNAL',
    evidence: 'IEC 60364-5-54 Table 54.3 단열식 k — Cu 143(PVC)/176(XLPE)/159(나도체), '
      + 'Al 95/116/105 가 표값과 일치하고 S = √(I²t)/k 가 그 k 를 실제로 쓴다',
  },
  'equipotential-bonding': {
    level: 'EXTERNAL',
    evidence: 'IEC 60364-5-54 §544.2 — 보조 본딩은 PE 의 1/2, 하한 6 mm² Cu, '
      + '상한 25 mm² Cu. 네 구간(4/16/35/70 mm² PE)에서 규칙이 순서대로 걸린다',
  },
};

/**
 * 아직 외부 대조가 없는 계산기 — **미검증으로 선언한다.**
 *
 * 여기 있다고 값이 틀렸다는 뜻이 아니다. 손계산 앵커와 항등식으로 산술은
 * 잠겨 있다. 다만 **그 식이 인용한 규격의 것인지**를 이 저장소가 스스로
 * 확인하지 못했다는 뜻이다. 유료 표준은 원문을 살 때까지 여기에 남는다.
 */
const UNVERIFIED_NOTE = '손계산 앵커·항등식으로 산술만 잠김 — 인용 규격 원문과의 대조는 미실시';

describe('외부 검증 등록부', () => {
  const ids = [...CALCULATOR_REGISTRY.keys()];

  it('계산기를 실제로 센다 — 공회전 반증', () => {
    expect(ids.length).toBeGreaterThan(50);
  });

  it('등록부의 계산기가 전부 실재한다 — 이름이 바뀌면 드러난다', () => {
    const ghosts = Object.keys(REGISTRY).filter((id) => !CALCULATOR_REGISTRY.has(id));
    expect(ghosts).toEqual([]);
  });

  it('EXTERNAL 에는 구체적 근거가 적혀 있다', () => {
    const vague = Object.entries(REGISTRY)
      .filter(([, e]) => e.level === 'EXTERNAL')
      .filter(([, e]) => e.evidence.length < 40 || !/\d/.test(e.evidence))
      .map(([id]) => id);
    expect(vague).toEqual([]);
  });

  /**
   * 이 수가 이 저장소의 정직한 상태다. **올라가야 하는 수**이고, 올릴 때마다
   * 여기를 같이 고치게 된다. 내려가면 대조가 사라진 것이므로 그것도 드러난다.
   */
  it('외부 대조된 계산기는 현재 6 개다', () => {
    const external = Object.entries(REGISTRY).filter(([, e]) => e.level === 'EXTERNAL');
    expect(external).toHaveLength(6);
  });

  /**
   * 나머지는 전부 미검증이다 — 그 사실을 수로 고정한다.
   * 대부분이 미검증이라는 게 불편하다면, 그게 이 검사의 목적이다.
   * (수를 주석에 적지 않는다 — 계산기가 늘면 주석만 낡는다.)
   */
  it('나머지는 외부 대조가 없다 — 그 수를 숨기지 않는다', () => {
    const unverified = ids.filter((id) => REGISTRY[id]?.level !== 'EXTERNAL');
    expect(unverified.length).toBe(ids.length - 6);
    expect(UNVERIFIED_NOTE.length).toBeGreaterThan(20);
  });

  /**
   * 규칙이 발화하는지 — 등록부가 비어도 조용히 통과하면 이 파일은 장식이다.
   */
  it('탐지 규칙이 발화한다', () => {
    const fake: Record<string, Entry> = { x: { level: 'EXTERNAL', evidence: '봤음' } };
    const vague = Object.entries(fake)
      .filter(([, e]) => e.level === 'EXTERNAL')
      .filter(([, e]) => e.evidence.length < 40 || !/\d/.test(e.evidence));
    expect(vague).toHaveLength(1);
    expect(CALCULATOR_REGISTRY.has('존재하지-않는-계산기')).toBe(false);
  });
});
