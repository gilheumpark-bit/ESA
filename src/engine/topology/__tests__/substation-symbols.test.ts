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
    // THR — ANSI 49. 교재 기구번호표는 "회전기 온도계전기" 로 싣는다.
    // 앞 커밋에서 "열동형과전류계전기" 로 적었는데 출처와 다르다(2026-07-27 정정).
    expect(detectComponentType('THR')).toBe('relay');
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

/**
 * 출처로 확인한 약호 (2026-07-27).
 *
 * 앞선 어휘 측정은 내 기억으로 만든 48 개 목록이었다. 그건 목록 자체가 틀릴 수
 * 있어서 수변전 약호표를 직접 확인했다.
 *
 *   개폐장치 7 종 — 김대호기술사 전기스쿨 (DS·LBS·IS·LS·ASS·COS·ALTS)
 *   수변전 약호표 — 기술랩 (OCB·GR·WH·VAR·DM 및 ANSI 병기 관례)
 *
 * 그 결과 14 개를 더 모르고 있었다. `LDS` 는 두 자료 어디에도 없어 표준 약호가
 * 아니라고 본다 — 지어내지 않고 넣지 않았다.
 */
describe('출처 확인 약호', () => {
  it.each([
    ['ALTS', 'switch'],   // 자동부하전환개폐기
    ['OCB', 'breaker'],   // 유입차단기
    ['GR', 'relay'],      // 지락계전기
    ['WH', 'meter'],      // 적산전력량계
    ['VAR', 'meter'],     // 무효전력계
    ['DM', 'meter'],      // 최대수요전력계
  ] as const)('%s → %s', (t, exp) => {
    expect(detectComponentType(t)).toBe(exp);
  });

  /**
   * 국내 도면은 계전기를 `OCR/51`, `GR/51G` 처럼 ANSI 기기번호와 병기한다.
   * 다만 **맨숫자는 받지 않는다** — 도면의 `51` 은 계전기일 수도, 치수일 수도,
   * 수량일 수도 있다. 문자 접미가 붙어 모호하지 않은 것만 받는다.
   */
  it('ANSI 기기번호 — 모호하지 않은 것만', () => {
    for (const t of ['51G', '51N', '64', '87', '27R']) {
      expect(detectComponentType(t)).toBe('relay');
    }
    for (const t of ['51', '27', '59']) {
      expect(detectComponentType(t)).toBe('load');   // 맨숫자는 문맥 없이 못 정한다
    }
  });

  it('두 글자 영문 충돌은 점 표기만 받는다', () => {
    // IS(인터럽터스위치)·LS(선로개폐기)는 영문 is/ls 와 충돌한다.
    expect(detectComponentType('I.S')).toBe('switch');
    expect(detectComponentType('L.S')).toBe('switch');
    expect(detectComponentType('IS')).toBe('load');
    expect(detectComponentType('LS')).toBe('load');
  });
});

/**
 * ANSI 자동제어기구 번호 — 출처 전표 대조 (2026-07-27).
 *
 * 앞 커밋에서는 내 추측으로 51G·51N·64·87 만 넣었다. 전기기사 실기 교재의
 * 「수변전설비 자동제어기구 번호」 표를 확인하니 범위가 더 넓었고, 무엇보다
 * **52 는 계전기가 아니라 차단기**였다. 추측으로 채운 목록은 이렇게 틀린다.
 *
 *   27 UVR 부족전압 · 37 UCR 부족전류(37A·37D) · 49 THR 회전기 온도
 *   50 GR 단락/지락선택(50G) · 51 OCR 과전류(51G·51N·51V)
 *   52 CB 교류 차단기 · 59 OVR 과전압 · 64 OVGR 지락과전압
 *   67 DGR 지락방향 · 87 DCR 전류차동(87-B·87-G·87-T)
 */
describe('ANSI 기구번호 전표', () => {
  it.each([
    ['27R', 'relay'], ['37A', 'relay'], ['37D', 'relay'],
    ['50G', 'relay'], ['51G', 'relay'], ['51N', 'relay'], ['51V', 'relay'],
    ['64', 'relay'], ['67G', 'relay'],
    ['87', 'relay'], ['87-B', 'relay'], ['87-T', 'relay'],
    ['UCR', 'relay'], ['OVGR', 'relay'], ['DCR', 'relay'],
  ] as const)('%s → %s', (t, exp) => {
    expect(detectComponentType(t)).toBe(exp);
  });

  it('52 는 계전기가 아니라 차단기다 — 번호대만 보고 relay 로 넣으면 틀린다', () => {
    expect(detectComponentType('52')).toBe('breaker');
    expect(detectComponentType('52A')).toBe('breaker');
  });

  it('맨숫자는 여전히 받지 않는다 — 치수·수량과 구분할 수 없다', () => {
    for (const t of ['51', '27', '59', '37', '50']) {
      expect(detectComponentType(t)).toBe('load');
    }
  });
});

/**
 * 교재 약호표에서 추가로 확인한 기기 (2026-07-27).
 *
 * 교재는 "COS 와 PF 의 심벌은 같은 것을 사용한다" 고 명시한다 — 그림으로도
 * 구분이 안 된다는 뜻이라, PF 를 텍스트로 단정하지 않은 판단의 근거가 된다.
 * 게다가 같은 교재의 계측기 표에 역률계(Power factor meter)가 실려 있어
 * `PF` 는 실제로 두 뜻을 다 갖는다.
 */
describe('교재 약호표 추가분', () => {
  it.each([
    ['Sh.R', 'capacitor'],   // 분로리액터 — 페란티 현상 방지
    ['T.C', 'meter'],        // 트립코일
    ['TC', 'meter'],
    ['Hz', 'meter'],         // 주파수계
  ] as const)('%s → %s', (t, exp) => {
    expect(detectComponentType(t)).toBe(exp);
  });

  it('DC 는 넣지 않았다 — 방전코일이자 직류다', () => {
    expect(detectComponentType('DC')).toBe('load');
  });
});

/**
 * 타입 신설 3 종 — 접지·표시등·퓨즈 (2026-07-27).
 *
 * IEC 60617 분류에는 있는데 이 어휘에만 없던 자리다. 없으면 갈 곳이 없어
 * 엉뚱한 타입에 얹힌다 — 접지·표시등은 `load` 로, 퓨즈는 `breaker` 로 갔다.
 *
 * 퓨즈를 차단기와 같이 두면 안 되는 이유: 퓨즈는 재투입이 안 되고 교체해야 한다.
 * 보호 협조 검토에서 둘은 다른 기기다.
 */
describe('신설 타입 — 접지·표시등·퓨즈', () => {
  it.each([
    ['E1', 'ground'], ['GND', 'ground'], ['PE', 'ground'],
    ['접지', 'ground'], ['등전위', 'ground'],
    ['PL', 'lamp'], ['RL', 'lamp'], ['GL', 'lamp'],
    ['표시등', 'lamp'], ['파일럿램프', 'lamp'],
    ['LF', 'fuse'], ['FUSE', 'fuse'], ['퓨즈', 'fuse'],
  ] as const)('%s → %s', (t, exp) => {
    expect(detectComponentType(t)).toBe(exp);
  });

  it('단독 E·G 는 접지로 보지 않는다 — 단일문자 오탐의 전례가 있다', () => {
    // 실도면 18 페이지 전 장에 발전기 2 대를 만들어 낸 단독 `G` 와 같은 함정이다.
    expect(detectComponentType('E')).toBe('load');
    expect(detectComponentType('G')).toBe('load');
  });

  it('차단기는 여전히 차단기다 — 퓨즈 분리가 차단기를 건드리지 않았다', () => {
    for (const t of ['MCCB 4P', 'VCB', 'ACB', 'ELB', '52A']) {
      expect(detectComponentType(t)).toBe('breaker');
    }
  });
});
