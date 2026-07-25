/**
 * 계산기 57종 도달 계약.
 *
 * 2026-07-25 실측 이전에는 자연어 질문으로 도달 가능한 계산기가 10종뿐이었다.
 * 의도 파서의 명시 도구 8종과 검색 파서의 제안 6종이 전부였고, 나머지 47종은
 * 폼으로 직접 들어가는 길밖에 없었다 — "조도 계산"이라고 정확히 말해도 닿지
 * 않았다.
 *
 * 어휘를 손으로 쓰지 않고 계산기 정의(`CALCULATOR_NAMES`·`CALCULATOR_PARAMS`)에서
 * 파생하므로, 계산기가 추가되면 이 테스트가 자동으로 그것까지 요구한다. 그게
 * 이 파일의 목적이다: **정의에 있는 계산기는 이름을 말하면 닿아야 한다.**
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeCalcIntent } from '../calc-intent-bridge';
import { CALCULATOR_PARAMS, CALCULATOR_NAMES } from '../calculator-params';
import { matchCalculatorByExactName } from '../calculator-lexicon';
import { resolveChatCalculationEvidence } from '../chat-calculation-evidence';
import type { ExtendedParamDef } from '@/components/CalculatorForm';

/** 정의 안의 범위를 지키는 대표값. */
function sampleValue(p: ExtendedParamDef): number {
  if (typeof p.defaultValue === 'number') return p.defaultValue;
  const min = p.min ?? 1;
  const max = p.max ?? min * 10;
  const mid = (min + max) / 2;
  return Number.isInteger(min) && Number.isInteger(max) ? Math.round(mid) : Number(mid.toFixed(2));
}

/**
 * 그 계산기의 이름과 파라미터 설명만으로 질문 한 문장을 만든다.
 *
 * 이것은 **배선 검사**다. 질문을 정의에서 만들어 정의로 되돌려 받으므로 "사람이
 * 실제로 그렇게 쓰는가"는 증명하지 못한다(§2.3 닫힌 순환). 자연스러움은 아래
 * `사람이 쓴 질문` 절이 따로 본다.
 */
function synthesize(id: string): string {
  const parts = CALCULATOR_PARAMS[id]
    .filter((p) => p.type === 'number')
    .map((p) => `${(p.description ?? '').replace(/\([^)]*\)/g, '').trim()} ${sampleValue(p)}${p.unit ?? ''}`);
  return `${CALCULATOR_NAMES[id]?.name ?? id}: ${parts.join(', ')}`;
}

const ALL_IDS = Object.keys(CALCULATOR_PARAMS);

describe('57종 도달', () => {
  it('정의된 계산기 수가 이름표와 어긋나지 않는다', () => {
    expect(ALL_IDS.length).toBe(57);
    expect(ALL_IDS.filter((id) => !CALCULATOR_NAMES[id])).toEqual([]);
  });

  it.each(ALL_IDS.filter((id) => !CALCULATOR_PARAMS[id].some((p) => p.type === 'array')))(
    '%s — 이름과 입력을 말하면 그 계산기로 간다',
    (id) => {
      expect(analyzeCalcIntent(synthesize(id)).calculatorId).toBe(id);
    },
  );

  /**
   * 목록을 입력으로 받는 7종. 한 문장은 부하 하나를 말하므로 1항목으로 묶는다.
   * 여러 항목이 필요하면 폼으로 가야 하지만, 계산기까지 닿는 것은 여기서 보장한다.
   */
  it.each([
    ['max-demand', '최대수요전력 계산: 정격전력 500kW 수용률 0.7 부등률 1.2'],
    ['demand-diversity', '수용률/부등률 계산: 개별 부하 최대수요 300kW 총 설비용량 500kW'],
    ['substation-capacity', '수변전 용량: 부하 800kW 역률 0.9 수용률 0.7'],
    ['emergency-generator', '비상 발전기: 부하 200kW 역률 0.85'],
    ['parallel-operation', '병렬운전 계산: 변압기 2대 용량 500kVA 임피던스 5%'],
    ['complex-voltage-drop', '임피던스 기반 전압강하: 전압 380V 전류 100A 길이 50m'],
    ['busbar-vd', '부스바 전압강하: 전압 380V 전류 500A 길이 20m'],
  ])('%s — 목록형도 한 문장으로 도달한다', (id, query) => {
    expect(analyzeCalcIntent(query).calculatorId).toBe(id);
  });

  it('배열형 계산기는 읽은 값을 1항목 목록으로 묶는다', () => {
    const intent = analyzeCalcIntent('최대수요전력 계산: 정격전력 500kW 수용률 0.7 부등률 1.2');
    expect(intent.extractedParams.loads).toEqual([
      expect.objectContaining({ ratedPower: 500, demandFactor: 0.7 }),
    ]);
  });
});

describe('사람이 쓴 질문 — 합성이 아닌 표본', () => {
  it.each([
    ['illuminance', '사무실 조도 계산: 면적 100m² 광속 3000lm 조명률 0.6 보수율 0.8 목표 조도 500lx'],
    ['ups-capacity', 'UPS 용량: 부하 50kW 역률 0.9'],
    ['lightning-protection', '피뢰 시스템: 건물 높이 30m 폭 20m 길이 40m'],
    ['awg-converter', 'AWG↔mm² 변환: 도체 단면적 50mm²'],
    ['transformer-efficiency', '변압기 효율 계산: 정격 용량 1000kVA 무부하손 1.5kW'],
  ])('%s', (id, query) => {
    expect(analyzeCalcIntent(query).calculatorId).toBe(id);
  });
});

describe('게이트 — 이름이 스쳤다고 계산기를 열지 않는다', () => {
  /**
   * 이름 매칭은 헐겁다. 실측(2026-07-25)상 토큰 점수 매칭만으로는 비계산 질의
   * 10건 중 7건에 반응했다 — "KEC 전압강하 기준 알려줘"를 voltage-drop 으로,
   * "차단기와 개폐기의 차이"를 breaker-sizing 으로 짚는다.
   *
   * 그래서 이름 전체가 나오고 **그 계산기의 입력을 수치로 읽어냈을 때**만 연다.
   * 아래는 전부 수치를 품고 있으면서 계산 요청이 아닌 질문들이다 — 새 게이트가
   * 무너지면 가장 먼저 여기서 샌다.
   */
  it.each([
    'KEC 232.3.9 전압강하 3% 기준 조항 원문과 예외',
    'KEC 전압강하 기준이 3%인 이유가 뭐야',
    '접지저항 10Ω 기준은 어느 조항에 있어?',
    'IEC 60364 절연저항 1MΩ 규정 원문',
    '차단기 100A와 개폐기의 차이가 뭐야',
    '변압기 1000kVA 설치 시 필요한 서류 알려줘',
    '단락전류 25kA 관련 규정이 뭐야',
    '조도 300lx 기준은 어떤 법에 나와?',
    '피뢰 시스템 설계 기준 문서 어디서 봐',
    '전동기 효율 IE3 등급이 뭐야',
    '허용전류표 어디서 확인해?',
  ])('"%s" 는 계산기를 열지 않는다', (query) => {
    expect(analyzeCalcIntent(query).calculatorId).toBeUndefined();
  });

  it('선택지 값만 맞은 것은 입력을 읽은 것으로 세지 않는다', () => {
    // "IE3" 는 전동기 효율의 선택지다. 그것 하나 맞았다고 계산기가 열리면
    // 등급을 묻는 질문이 계산 결과를 받는다.
    expect(analyzeCalcIntent('전동기 효율 IE3 등급이 뭐야').calculatorId).toBeUndefined();
  });

  it('이름은 맞지만 수치가 없으면 기본값 영수증을 만들지 않는다', () => {
    // 수치가 0개면 "못 읽은 수치"도 0개라 그 가드를 그냥 통과한다. 파라미터가
    // 전부 기본값을 가진 계산기에서 전량 기본값 영수증이 나오는 경로였다.
    const intent = analyzeCalcIntent('UPS 용량 산정 방법 설명해줘');
    expect(intent.canAutoExecute).toBe(false);
  });

  it('규격 번호는 사용자가 준 입력이 아니다', () => {
    // "IEEE 1584" 의 1584 를 입력으로 세면 멀쩡한 아크플래시 질문이 되묻기로 떨어진다.
    //
    // 이름 전체 매칭은 어순을 지켜야 한다("아크플래시 위험도 (IEEE 1584)"). 어순이
    // 뒤집힌 "IEEE 1584 아크플래시 위험도 …" 는 질문에 섞인 "단락전류" 때문에
    // short-circuit 으로 간다 — 이 설계의 알려진 한계다.
    const intent = analyzeCalcIntent(
      '아크플래시 위험도 (IEEE 1584): 공칭 전압 480V 볼트 단락전류 20kA 아크 지속시간 0.2s 작업 거리 457mm',
    );
    expect(intent.calculatorId).toBe('arc-flash');
    expect(intent.unreadNumbers).not.toContain(1584);
  });
});

describe('이름으로 찾은 계산기도 영수증을 낸다', () => {
  /**
   * 라우팅과 영수증 발행은 다른 조건이다. 영수증에는 확신도 0.8 문턱이 있는데,
   * 그 확신도를 의도 파서가 계산한다 — 그런데 의도 파서는 도구 8종만 안다.
   * 그래서 이름으로 정확히 찾아 입력까지 다 읽고 계산기도 정상 실행되는데
   * 확신도에서 막혀 결과가 안 나가는 구간이 있었다(실측: UPS 용량).
   * 단위 스위트는 라우팅만 봐서 이것을 놓쳤고 라이브 왕복에서 드러났다.
   */
  it.each([
    ['ups-capacity', 'UPS 용량: 부하 50kW 역률 0.9'],
    ['max-demand', '최대수요전력 계산: 정격전력 500kW 수용률 0.7 부등률 1.2'],
    ['substation-capacity', '수변전 용량: 부하 800kW 역률 0.9 수용률 0.7'],
    ['busbar-vd', '부스바 전압강하: 전압 380V 전류 500A 길이 20m'],
  ])('%s — 입력이 갖춰지면 영수증이 나온다', (id, query) => {
    const evidence = resolveChatCalculationEvidence(query);
    expect(evidence?.calculatorId).toBe(id);
    expect(Number.isFinite(Number(evidence?.result.value))).toBe(true);
  });
});

/**
 * 코드 어디서든 계산기를 지목하면 그 계산기는 실재해야 한다.
 *
 * 실측(2026-07-26): 도면 제안·지식그래프 relatedCalc·모바일/OCR 라벨 표에
 * `transformer-sizing`·`motor-starting`·`power-factor-correction`·
 * `demand-factor`·`load-calculation` 다섯 개가 쓰이고 있었는데 전부 레지스트리에
 * 없는 이름이었다. 눌러도 갈 곳이 없다. 기존 테스트는 오히려 그 죽은 이름을
 * 기대값으로 박아 두어 초록 안에서 유지시키고 있었다.
 */
describe('참조된 계산기 ID 는 전부 실재한다', () => {
  const SCAN_DIRS = ['src/lib', 'src/engine', 'src/data', 'src/app', 'src/components'];
  const REFERENCE_KEYS = ['calculatorId', 'relatedCalc', 'calcId'];

  /**
   * 계산기를 가리키지 않는 값. 팀 검토 리포트를 Excel 로 내보낼 때 영수증
   * 형식을 재사용하면서 그 자리에 붙이는 합성 식별자다 — 레지스트리에 있어야
   * 할 이유가 없다.
   */
  const NOT_A_CALCULATOR = new Set(['team-review']);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('레지스트리에 없는 ID 를 가리키는 곳이 없다', () => {
    const pattern = new RegExp(`(?:${REFERENCE_KEYS.join('|')}):\\s*'([a-z0-9-]+)'`, 'g');
    const offenders: string[] = [];

    for (const dir of SCAN_DIRS) {
      for (const file of walk(dir)) {
        const src = readFileSync(file, 'utf8');
        for (const match of src.matchAll(pattern)) {
          const id = match[1];
          if (NOT_A_CALCULATOR.has(id)) continue;
          if (!(id in CALCULATOR_PARAMS)) offenders.push(`${file}: ${id}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('이름 전체 매칭', () => {
  it('이름이 통째로 들어 있을 때만 확정한다', () => {
    expect(matchCalculatorByExactName('케이블 사이징: 전류 100A')).toBe('cable-sizing');
    // "전압강하" 는 품고 있어도 "전압강하계산" 이라는 이름 전체는 아니다.
    expect(matchCalculatorByExactName('KEC 232.3.9 전압강하 조항 원문')).toBeUndefined();
  });
});

describe('구해달라는 값을 입력으로 되묻지 않는다', () => {
  /**
   * 실측(2026-07-26): "3상 380V 55kW 유도전동기의 정격전류는?" 이
   * three-phase-power(선간전압·선전류 → 전력)로 갔다. 그 계산기의 필수 입력이
   * 바로 사용자가 구해달라는 `lineCurrent` 라, 답변이 "계산기 실행을 위해 필요한
   * 입력인 **선전류(A)** 확인이 필요합니다" 가 됐다 — 묻는 값을 되물었다.
   *
   * 필수 입력이 질문의 의문 대상과 겹치면 그 계산기는 이 질문의 역방향이다.
   * 대신 짚을 계산기를 아는 것이 아니므로 라우팅을 포기한다.
   */
  it.each([
    '3상 380V 55kW 유도전동기의 정격전류는? 역률 0.85 효율 0.92',
    '단상 220V 부하의 전류가 얼마인가요?',
  ])('"%s" — 역방향 계산기로 보내지 않는다', (query) => {
    expect(analyzeCalcIntent(query).calculatorId).toBeUndefined();
  });

  it('입력을 다 주고 결과를 묻는 정상 질문은 그대로 계산한다', () => {
    // 이 질문도 "전압강하는?" 로 끝나지만 voltage-drop 의 필수 입력에
    // "전압강하" 는 없다 — 가드가 넓게 잡히면 여기서 먼저 깨진다.
    const intent = analyzeCalcIntent('전압강하 계산: 3상 380V 100A 50m 35mm2 Cu 역률 0.9');
    expect(intent.calculatorId).toBe('voltage-drop');
    expect(intent.canAutoExecute).toBe(true);
  });
});
