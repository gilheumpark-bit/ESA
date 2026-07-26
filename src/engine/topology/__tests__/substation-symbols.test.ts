/**
 * 수전설비 기기 어휘 — 22.9kV 실도면(삼선결선도)에서 나온 공백.
 *
 * 실측 2026-07-27: 삼성 계열 옥외 변전실 수배전반 도면을 파이프라인에 넣었더니
 * `L.A x 3 18kV 5kA` 가 `switch` 로 분류됐다. 비전 모델 잘못이 아니라 어휘에
 * 피뢰기가 아예 없었고, 프롬프트가 낼 수 있는 타입 목록에도 없었다.
 *
 * 도면 표기는 **점을 찍는다** — `L.A`, `L.B.S`. 점 없는 패턴만 두면 정작
 * 실도면에서 안 잡힌다. 그래서 여기 케이스는 도면에 실제로 인쇄된 형태를 쓴다.
 */
import { detectComponentType } from '@/engine/topology/pdf-vector-parser';
import { resolveBlockType } from '@/engine/topology/dxf-parser';
import { SLD_COMPONENT_TYPES } from '@/lib/sld-recognition';

describe('어휘 정본', () => {
  it('피뢰기 타입이 있다 — 없으면 수전설비를 표현할 수 없다', () => {
    expect(SLD_COMPONENT_TYPES).toContain('arrester');
  });

  it('타입 목록에 중복이 없다', () => {
    expect(new Set(SLD_COMPONENT_TYPES).size).toBe(SLD_COMPONENT_TYPES.length);
  });
});

describe('벡터 경로 심볼 판정 — 도면에 인쇄된 그대로', () => {
  it.each([
    // 피뢰기 — 점 표기가 실물이다
    ['L.A x 3', 'arrester'],
    ['L.A', 'arrester'],
    ['LA', 'arrester'],
    ['SPD', 'arrester'],
    ['피뢰기', 'arrester'],
    // 수전 개폐기 — 역시 점 표기
    ['L.B.S 24kV 3P 1250A', 'switch'],
    ['LBS', 'switch'],
    ['A.S.S', 'switch'],
    ['COS', 'switch'],
    // 기존 어휘가 깨지지 않았는지
    ['VCB', 'breaker'],
    ['MCCB 3P 100/75', 'breaker'],
    ['TR-1', 'transformer'],
  ] as const)('%s → %s', (text, expected) => {
    expect(detectComponentType(text)).toBe(expected);
  });

  it('피뢰기를 개폐기로 분류하지 않는다 — KEC 153.1.4 검토 대상에서 빠진다', () => {
    expect(detectComponentType('L.A x 3 18kV 5kA (W/DISCON)')).not.toBe('switch');
  });
});

describe('DXF 경로 블록명 판정', () => {
  it.each([
    ['LA-1', 'arrester'],
    ['SPD_MAIN', 'arrester'],
    ['LBS-1', 'switch'],
    ['COS_A', 'switch'],
    ['VCB-01', 'breaker'],
  ] as const)('%s → %s', (block, expected) => {
    expect(resolveBlockType(block)).toBe(expected);
  });
});

/**
 * 한글 키워드가 실제로 매칭되는가.
 *
 * `\b` 는 `[A-Za-z0-9_]` 경계라 한글 앞뒤에서 성립하지 않는다. 실측
 * 2026-07-27: `/\b(변압기)\b/.test('변압기')` = false. 사전의 한글 키 12 개가
 * 전부 죽어 있었고, 한국 전기설비 도구인데 한글 라벨 도면에서 기기를 하나도
 * 못 잡는 상태였다. 영문 약어만 있는 도면에서 우연히 안 드러났다.
 */
describe('한글 키워드', () => {
  it.each([
    ['변압기', 'transformer'],
    ['차단기', 'breaker'],
    ['누전차단기', 'breaker'],
    ['전동기', 'motor'],
    ['발전기', 'generator'],
    ['분전반', 'panel'],
    ['수배전반', 'panel'],
    ['모선', 'bus'],
    ['콘덴서', 'capacitor'],
    ['개폐기', 'switch'],
    ['부하개폐기', 'switch'],
    ['피뢰기', 'arrester'],
    ['서지흡수기', 'arrester'],
    ['계기', 'meter'],
    ['계전기', 'relay'],
  ] as const)('%s → %s', (text, expected) => {
    expect(detectComponentType(text)).toBe(expected);
  });

  it('라벨 안에 섞여 있어도 잡는다 — 실도면은 순수 한 단어가 아니다', () => {
    expect(detectComponentType('주변압기 TR-1 1000kVA')).toBe('transformer');
    expect(detectComponentType('22.9kV 피뢰기 18kV 5kA')).toBe('arrester');
  });

  it('더 긴 한글 낱말의 일부를 잘라 오인하지 않는다', () => {
    // '계기'가 '온도계기록'같은 낱말 안에서 튀면 안 된다.
    expect(detectComponentType('온도계기록장치')).not.toBe('meter');
  });
});

/**
 * 어휘를 늘린 뒤 오탐이 생기지 않았는가.
 *
 * 2026-07-27 어휘 전수 측정에서 48 개 중 25 개를 모르고 있었다(전부 조용히
 * `load` 로 흡수). 21 개를 보강해 44/48 로 올렸는데, 짧은 약호를 늘리면
 * 엉뚱한 곳에서 튀는 것이 진짜 위험이다. 늘린 만큼 반증도 늘린다.
 */
describe('어휘 확장 — 오탐 반증', () => {
  it.each([
    // 긴 약호가 짧은 약호에 먹히지 않는다
    ['MCC-1', 'panel'],        // MC(전자접촉기) 에 먹히면 안 된다
    ['MCCB 4P', 'breaker'],    // MC 에 먹히면 안 된다
    ['MCB', 'breaker'],
    ['MOF', 'meter'],
  ] as const)('%s → %s', (text, expected) => {
    expect(detectComponentType(text)).toBe(expected);
  });

  it('표제가 설비로 승격되지 않는다 — SC(진상콘덴서)가 SCHEDULE 에서 튀면 안 된다', () => {
    // 기대는 "capacitor 가 아니다" 이지 특정 타입이 아니다. 영문 CABLE 은 사전에
    // 없어 기본값 load 로 떨어지는데, 표제가 부품이 안 되는 것 자체는 옳다.
    for (const title of ['CABLE SCHEDULE', 'LOAD SCHEDULE', 'PANEL SCHEDULE']) {
      expect(detectComponentType(title)).not.toBe('capacitor');
    }
  });

  it('의도적으로 넣지 않은 충돌 약호는 여전히 모른다 — 지어내지 않는다', () => {
    // PF 는 전력퓨즈이자 역률계다. 실도면(세종 p1) 계기반이 `V A W PF F` 였다.
    // 문맥 없이 어느 쪽으로 넣어도 다른 쪽이 틀린다.
    expect(detectComponentType('PF')).toBe('load');
    // AS/VS/OS 는 영문 as/vs/os 와 충돌한다. 점 표기만 받는다.
    expect(detectComponentType('AS')).toBe('load');
    expect(detectComponentType('A.S')).toBe('meter');
  });

  it('MCC 결선도의 기본 구성을 안다 — 이걸 모르면 그 도면은 못 읽는다', () => {
    expect(detectComponentType('MC')).toBe('switch');    // 전자접촉기
    expect(detectComponentType('THR')).toBe('relay');    // 열동형과전류계전기
    expect(detectComponentType('INV')).toBe('motor');    // 인버터
  });

  it('계기용 변성기 계열을 안다 — 벡터 경로와 비전 경로가 같은 규칙을 쓴다', () => {
    for (const t of ['ZCT', 'MOF', 'GPT', 'VT', 'PTT', 'CTT']) {
      expect(detectComponentType(t)).toBe('meter');
    }
  });

  it('수전설비 보호 계전기를 안다', () => {
    for (const t of ['UVR', 'OCGR', 'SGR', 'DGR']) {
      expect(detectComponentType(t)).toBe('relay');
    }
  });
});
