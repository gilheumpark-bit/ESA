/**
 * ESVA PDF Vector Parser — CAD 출력 PDF에서 벡터 데이터 추출
 * ──────────────────────────────────────────────────────────────
 * CAD에서 Plot한 PDF는 내부에 벡터 좌표가 살아있다.
 * VLM 없이 PDF 내부의 선(Line)/텍스트(Text) 좌표를 직접 스크래핑.
 * 결과는 DXF 파서와 동일한 SLDAnalysis 타입 → TopologyGraph 투입.
 *
 * PART 1: PDF 텍스트 + 좌표 추출 (pdfjs-dist)
 * PART 2: 선분 추출 (Operator Stream 파싱)
 * PART 3: SLD 변환 + 스펙 매핑
 */

import type { SLDComponent, SLDConnection, SLDAnalysis, SLDComponentType } from '@/lib/sld-recognition';
import { generateSuggestions } from '@/lib/sld-recognition';
import { snapConnectionEndpoints, formatEndpointId, type SnapAnchor } from './endpoint-snap';
import { parseSpecText } from './spec-text';
import { bindScheduleRow } from './schedule-row-binding';
import { parseScheduleTables } from './schedule-table-parser';
import { pdfjsNodeDocumentOptions } from './pdfjs-assets';

// =========================================================================
// PART 1 — Types
// =========================================================================

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontHeight: number;
  /** 텍스트 회전각(도·90° 양자화) — 도면 전체 회전 감지용(3차 실증: 90° 회전 영문 SLD) */
  angle?: number;
}

interface PdfLineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  pageWidth: number;
  pageHeight: number;
}

export interface PdfParseOptions {
  /** 페이지 번호 (1-based, 기본: 1) */
  pageNumber?: number;
  /** 텍스트-심볼 매핑 최대 거리 (포인트, 기본: 30) */
  textProximityThreshold?: number;
  /** 최소 선 길이 (포인트, 기본: 10) — 짧은 장식선 무시 */
  minLineLength?: number;
  /** 의미 분석에 투입할 최대 텍스트 항목 수 */
  maxTextItems?: number;
  /** 순회할 최대 PDF 연산자 수 */
  maxOperators?: number;
  /** constructPath 내부 좌표·명령 값의 최대 합계 */
  maxPathValues?: number;
  /** PDF.js 로딩·페이지 추출 전체 시간 상한 */
  deadlineMs?: number;
  /** 호출자가 연결을 끊거나 작업을 취소할 때 중단한다. */
  signal?: AbortSignal;
}

const PDF_WORK_LIMITS = {
  textItems: 5_000,
  operators: 100_000,
  pathValues: 300_000,
} as const;

function workLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value! >= 0 ? value! : fallback;
}

function pdfResourceLimit(reason: string): SLDAnalysis {
  return {
    components: [],
    connections: [],
    suggestedCalculations: [],
    confidence: 0,
    rawDescription: `PDF_RESOURCE_LIMIT: ${reason}`,
  };
}

async function boundedPdfWork<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
  deadline: number,
  cancel: () => unknown | Promise<unknown>,
): Promise<T> {
  const cancelQuietly = () => {
    try {
      void Promise.resolve(cancel()).catch(() => undefined);
    } catch {
      // The bounded error is authoritative even if pdf.js cancellation fails.
    }
  };
  if (signal?.aborted) {
    cancelQuietly();
    throw new Error('PDF_PARSE_CANCELLED');
  }
  if (Date.now() >= deadline) {
    cancelQuietly();
    throw new Error('PDF_PARSE_DEADLINE_EXCEEDED');
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      settle();
    };
    const fail = (code: string) => {
      cancelQuietly();
      finish(() => reject(new Error(code)));
    };
    const onAbort = () => fail('PDF_PARSE_CANCELLED');
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(
      () => fail('PDF_PARSE_DEADLINE_EXCEEDED'),
      Math.max(1, deadline - Date.now()),
    );
    operation.then(
      (value) => finish(() => resolve(value)),
      (cause) => finish(() => reject(cause)),
    );
  });
}

// =========================================================================
// PART 2 — 심볼 키워드 매핑
// =========================================================================

/**
 * 한글 키워드는 `\b` 로 감싸면 **절대 매칭되지 않는다.**
 *
 * JS 의 `\b` 는 `[A-Za-z0-9_]` 경계라 한글 앞뒤에서는 성립하지 않는다. 실측
 * 2026-07-27: `/\b(변압기)\b/.test('변압기')` = false. 이 사전의 한글 키
 * 12 개(변압기·차단기·전동기·발전기·분전반·모선·콘덴서·개폐기·계기·계전기·
 * 누전차단기·피뢰기)가 전부 죽어 있었다 — 한국 전기설비 도구인데 한글 라벨
 * 도면에서 기기를 하나도 못 잡는 상태였다.
 *
 * 영문 약어는 `\b` 가 필요하다(LAMP 의 LA 를 피뢰기로 잡으면 안 된다). 그래서
 * 두 갈래를 나눠 쓴다 — 영문은 `\b`, 한글은 앞뒤가 한글이 아닌지로 본다.
 */
const HANGUL = '가-힣';
/** 한글 토큰 경계 — 앞뒤가 한글이 아니면 독립 토큰으로 본다. */
function ko(...words: string[]): string {
  return `(?<![${HANGUL}])(?:${words.join('|')})(?![${HANGUL}])`;
}

const SYMBOL_KEYWORDS: Array<{ pattern: RegExp; type: SLDComponentType }> = [
  { pattern: new RegExp(`\\b(TR|TRANSFORMER|XFMR)\\b|${ko('변압기')}`, 'i'), type: 'transformer' },
  // ELB·ELCB·MCB·누전차단기 추가(2026-07-21): KIMM 실발주 골든 파일럿에서 ELB 20대가
  // 키워드 부재로 통째 미검출(검출 54/74 실측)된 공백 수리. DXF 파서 사전과 동기.
  // GCB(가스차단기)·LF(한류퓨즈) 추가(2026-07-27 어휘 전수 측정). 퓨즈는 차단기와
  // 다른 기기지만 보호 기능이 같고 이 어휘에 fuse 타입이 없다 — 별도 타입을
  // 만들 근거가 아직 없어 breaker 로 둔다.
  //
  // `PF`(전력퓨즈)는 넣지 않았다. 계기반의 `PF`(역률계)와 같은 글자다 —
  // 실도면(세종 p1)의 계기반이 `V A W PF F` 였다. 문맥 없이 어느 쪽으로 넣어도
  // 다른 쪽이 틀린다.
  // ANSI 52 = 교류 차단기. 계전기 번호대에 섞여 있지만 차단기다(출처 확인
  // 2026-07-27 교재 기구번호표). 여기 없으면 `52` 가 계전기로 새거나 load 로 떨어진다.
  // LF(한류퓨즈)를 뺐다 — 퓨즈는 차단기와 다른 기기이고 `fuse` 타입이 생겼다(2026-07-27).
  { pattern: new RegExp(`\\b(CB|OCB|ACB|VCB|MCCB|MCB|ELB|ELCB|GCB|52[A-Z]?|BREAKER)\\b|${ko('누전차단기', '차단기')}`, 'i'), type: 'breaker' },
  { pattern: new RegExp(`\\b(M|MOTOR)\\b|${ko('전동기', '모터')}`, 'i'), type: 'motor' },
  // 단독 'G'는 제외 — 국내 분전반 도면에서 단독 G는 접지 표기가 관례라,
  // 실도면 18페이지 전 장에 발전기 2대가 검출되는 오탐을 만들었다(라이브
  // 실측 발각 · DXF 파서 단일문자 그림자 결함의 동종).
  { pattern: new RegExp(`\\b(GEN|GENERATOR)\\b|${ko('발전기')}`, 'i'), type: 'generator' },
  { pattern: new RegExp(`\\b(MCC|DB|DP|PANEL|SWGR)\\b|${ko('분전반', '수배전반')}`, 'i'), type: 'panel' },
  { pattern: new RegExp(`\\b(BUS|BUSBAR)\\b|${ko('모선')}`, 'i'), type: 'bus' },
  { pattern: new RegExp(`\\b(GRID[ _-]?(?:CONNECTION|TIE)|EXTERNAL[ _-]?GRID|UTILITY[ _-]?(?:GRID|TIE))\\b|${ko('외부계통 연계점', '계통연계점')}`, 'i'), type: 'grid_connection' },
  { pattern: new RegExp(`\\b(CAP|CAPACITOR)\\b|${ko('콘덴서')}`, 'i'), type: 'capacitor' },
  // LBS·ASS·COS 추가(2026-07-27): 22.9kV 수전 실도면에서 `L.B.S 24kV 3P 1250A`
  // 가 사전에 없어 벡터 경로로는 검출되지 않았다. 기존 사전은 KIMM 분전반(저압)
  // 캘리브레이션에서 나와 수전 개폐기 계열이 통째로 비어 있었다.
  // 도면은 약어에 점을 찍는다 — 실물 표기가 `L.B.S`, `A.S.S` 다. 점 없는
  // 패턴만 두면 정작 실도면에서 안 잡힌다(실측: 점 표기 4 건 전부 load 로 떨어짐).
  // AISS·OS·ATS·MC·MS 추가(2026-07-27 어휘 전수 측정 — 48 개 중 25 개를 모르고
  // 있었고 전부 조용히 `load` 로 흡수됐다). MC(전자접촉기)·MS(전자개폐기)는 MCC
  // 결선도의 기본 구성인데 통째로 빠져 있었다.
  //
  // `OS`(유입개폐기)는 영문 os 와 충돌한다. 주석 문장 게이트(isProseText)가
  // 문장을 먼저 걸러 주지만 위험이 0 은 아니라 점 표기까지만 받는다.
  // ALTS 추가(2026-07-27 출처 확인 — 김대호기술사 전기스쿨 개폐장치 7 종).
  // 그 7 종 중 IS(인터럽터스위치)·LS(선로개폐기)는 넣지 않았다. 두 글자라 영문
  // is/ls 와 충돌하고, 도면 주석·파일명에 흔한 글자다. 점 표기(`I.S`·`L.S`)만 받는다.
  { pattern: new RegExp(`\\b(SW|DS|L\\.?B\\.?S|A\\.?I\\.?S\\.?S|A\\.?S\\.?S|ALTS|COS|ATS|M\\.?C|M\\.?S|I\\.S|L\\.S|SWITCH)\\b|${ko('자동고장구분개폐기', '기중부하개폐기', '자동부하전환개폐기', '부하개폐기', '인터럽터스위치', '선로개폐기', '전자접촉기', '전자개폐기', '자동절체', '개폐기')}`, 'i'), type: 'switch' },
  // 피뢰기는 개폐기가 아니라 보호기기다. 타입이 없어 switch 로 뭉개지면
  // 보호기기 검토 대상에서 빠진다. 표기는 `L.A` 가 실물이다.
  //
  // 정정(2026-07-28): 여기 원래 "KEC 153.1.4(서지보호장치) 검토 대상" 이라고
  // 적혀 있었는데 **틀린 조항이다.** 153.1.4 는 내부피뢰시스템의 저압
  // 서지보호장치(SPD) 조항이고, 22.9kV·154kV 수전측 피뢰기(LA)는
  // 341.13(피뢰기의 시설)·341.14(피뢰기의 접지)·451.3/451.4(설치장소·선정)다.
  // LA 와 SPD 는 전압 계통도 정격 선정 방식도 다른 기기다.
  //
  // 이 사전은 둘을 같은 `arrester` 로 묶는다 — SLD 어휘가 그 입도라 지금은
  // 구분할 자리가 없다. 조항을 붙일 때 둘을 섞지 말 것.
  { pattern: new RegExp(`\\b(L\\.?A|S\\.?A|SPD)\\b|${ko('피뢰기', '서지흡수기', '서지보호')}`, 'i'), type: 'arrester' },
  // DWHM/WHM(전력량계) 추가(2026-07-21 3차 실증): EE-038 분전반 4면의 DWHM 계량
  // 4대가 키워드 부재로 전량 미검출된 공백 수리.
  // 계기용 변성기 계열 보강(2026-07-27): 12 개 중 8 개를 모르고 있었다 —
  // 이 분야가 가장 나빴다. ZCT 는 비전 프롬프트에는 넣었는데 여기 벡터 사전에는
  // 빠져 있어 두 경로가 어긋나 있었다. 시험단자(PTT·CTT)도 도면에 늘 있다.
  //
  // `AS`(전류계전환개폐기)·`VS`(전압계전환개폐기)는 영문 as/vs 와 충돌해
  // 넣지 않았다. 점 표기(`A.S`)만 받는다.
  // WH(적산전력량계)·VAR(무효전력계)·DM(최대수요전력계) 추가(출처 확인 2026-07-27).
  { pattern: new RegExp(`\\b(C\\.?T|P\\.?T|V\\.?T|Z\\.?C\\.?T|M\\.?O\\.?F|G\\.?P\\.?T|PTT|CTT|A\\.S|V\\.S|WH|VAR|DM|Hz|T\\.?C|METER|DWHM|WHM)\\b|${ko('계기', '전력량계', '무효전력계', '최대수요전력계', '주파수계', '역률계', '트립코일', '변성기', '영상변류기', '변류기')}`, 'i'), type: 'meter' },
  { pattern: /\b(UPS)\b/i, type: 'ups' },
  // 지락·부족전압 계전기 추가. OCGR·SGR·DGR 은 수전설비 보호의 기본인데 빠져 있었다.
  // GR(지락계전기) 추가. ANSI 기기번호도 함께 받는다 — 국내 도면은 계전기를
  // `OCR/51`, `GR/51G`, `UVR/27`, `OVR/59` 처럼 병기하는 것이 관례다(출처 확인
  // 2026-07-27 기술랩 수변전 약호표).
  //
  // 다만 **맨숫자는 받지 않는다.** 도면의 `51` 은 계전기일 수도 치수일 수도
  // 수량일 수도 있다. 문자 접미가 붙어 모호하지 않은 것(51G·51N·67G·64·87)과
  // `OCR/51` 처럼 약호에 붙은 형태만 받는다.
  // ANSI 기구번호 — 출처 확인 2026-07-27 (전기기사 실기 교재 수변전설비
  // 「자동제어기구 번호」 표). 앞 커밋에서는 내 추측으로 51G/51N/64/87 만 넣었는데
  // 실제 표를 보니 범위가 더 넓고 **52 는 계전기가 아니라 차단기**였다.
  //
  //   27 UVR 부족전압   37 UCR 부족전류(37A·37D)   49 THR 회전기 온도
  //   50 GR 단락/지락선택(50G)   51 OCR 과전류(51G·51N·51V)
  //   52 CB 교류 차단기 ← breaker 로 간다   59 OVR 과전압
  //   64 OVGR 지락과전압   67 DGR 지락방향   87 DCR 전류차동(87-B·87-G·87-T)
  //
  // 맨숫자(27·51·59)는 여전히 받지 않는다 — 도면의 `51` 은 치수일 수도 수량일
  // 수도 있다. 문자 접미가 붙거나 하이픈 첨자가 붙은 것만 받는다.
  { pattern: new RegExp(`\\b(OCR|OVR|UVR|UCR|OCGR|OVGR|SGR|DGR|DCR|GR|THR|RELAY)\\b|\\b(?:37|5[01]|27|59|67)[A-Z]\\b|\\b(?:64|87)(?:-[A-Z])?\\b|${ko('계전기', '지락계전기', '차동계전기')}`, 'i'), type: 'relay' },
  // 리액터는 무효전력을 흡수하고 콘덴서는 공급한다. 보호·용량 검토가 반대라
  // 같은 타입으로 합치면 안 된다. 방전코일 `DC` 는 직류와 충돌해 넣지 않는다.
  { pattern: new RegExp(`\\b(?:SHUNT|SERIES)[ _-]?REACTOR\\b|\\b(?:S\\.?R|Sh\\.?R)\\b|${ko('직렬리액터', '분로리액터', '리액터')}`, 'i'), type: 'reactor' },
  { pattern: new RegExp(`\\bS\\.?C\\b|${ko('진상콘덴서')}`, 'i'), type: 'capacitor' },
  { pattern: new RegExp(`\\b(INV|INVERTER)\\b|${ko('인버터')}`, 'i'), type: 'motor' },
  { pattern: new RegExp(`\\b(C\\.?H)\\b|${ko('케이블헤드', '케이블')}`, 'i'), type: 'cable' },
  // ── 아래 셋은 타입 신설(2026-07-27). IEC 60617 분류에는 있는데 이 어휘에만
  //    없던 자리라, 그동안 load·breaker 에 얹혀 있었다.
  //
  // 접지 — 모든 도면에 있다. 단독 `E`·`G` 는 넣지 않는다: 실도면 18 페이지 전 장에
  // 발전기 2 대를 만들어 낸 단일문자 오탐과 같은 함정이다(사전 위쪽 주석 참조).
  { pattern: new RegExp(`\\b(GND|EARTH|PE|FG)\\b|\\bE\\d+\\b|${ko('접지', '접지선', '등전위')}`, 'i'), type: 'ground' },
  // 표시등 — 분전반 회로마다 붙는다. RL(적)·GL(녹)·YL(황)·WL(백)·PL(파일럿).
  { pattern: new RegExp(`\\b([RGYWO]L|PL|LAMP|PILOT)\\b|${ko('표시등', '파일럿램프', '경보등')}`, 'i'), type: 'lamp' },
  // 퓨즈 — 차단기와 다른 기기다. LF(한류)·PF(전력)는 위 PF 판별을 통과한 것만 온다.
  { pattern: new RegExp(`\\b(LF|FUSE|F\\.?U)\\b|${ko('퓨즈', '한류퓨즈', '전력퓨즈')}`, 'i'), type: 'fuse' },
];

interface TypeDetection {
  type: SLDComponentType;
  /**
   * 매칭된 토큰이 1글자면 weak — 단독 "M"(모터 심볼이자 흔한 라벨)처럼
   * 도면 어디에나 있는 글자라 그 자체로는 설비 근거가 못 된다. 이번 커밋이
   * 단독 "G"(=발전기이자 접지 관례)를 패턴에서 뺀 것과 동일 결함군인데,
   * 독립 심사(adversary)가 "M은 그대로 phantom 모터를 만든다"고 라이브
   * 재현했다. G만 빼는 땜질 대신 1글자 토큰 계열을 통째로 weak 처리해
   * 스펙 증거가 있을 때만 승격시킨다(향후 추가되는 1글자 키도 자동 포함).
   */
  weak: boolean;
}

/**
 * `PF` 는 전력퓨즈이자 역률계다 — 글자로도 그림으로도 안 갈린다.
 *
 * 교재가 "COS 와 PF 의 심벌은 같은 것을 사용한다" 고 명시하고, 같은 교재의
 * 계측기 표에 역률계(Power factor meter)가 실려 있다. 그래서 앞 커밋까지는
 * 아예 넣지 않고 `load` 로 두었다.
 *
 * 현장 판별 규칙(2026-07-27 확인): **심볼이 함께 있으면 전력퓨즈, 없으면 역률계.**
 * 텍스트만 보는 이 경로에서는 심볼 유무를 직접 못 보므로 계기반 문맥을 대리
 * 신호로 쓴다 — 실도면(세종 p1)의 계기반이 `V A W PF F` 처럼 계기 글자가
 * 늘어선 형태였다. 다른 계기 글자와 함께 나오면 역률계로 본다.
 *
 * 판별이 안 되면 `undefined` 를 돌려 기존 경로(사전)로 넘긴다 — 애매한 것을
 * 어느 한쪽으로 밀어붙이지 않는다.
 */
const METER_PANEL_NEIGHBORS = /\b(V|A|W|Hz|VAR|WH|DM)\b/;

function disambiguatePowerFactor(text: string): SLDComponentType | undefined {
  if (!/\bP\.?F\b/i.test(text)) return undefined;
  // 계기 글자가 같이 있으면 계기반이다 → 역률계.
  const rest = text.replace(/\bP\.?F\b/gi, ' ');
  if (METER_PANEL_NEIGHBORS.test(rest)) return 'meter';
  // 퓨즈 쪽 근거(정격·차단 표기)가 있으면 전력퓨즈.
  if (/\b\d+\s*(A|kA|AF|AT)\b/i.test(rest) || /퓨즈|FUSE/i.test(text)) return 'fuse';
  return undefined;
}

function detectComponentTypeEx(text: string): TypeDetection {
  const pf = disambiguatePowerFactor(text);
  if (pf) return { type: pf, weak: false };

  for (const { pattern, type } of SYMBOL_KEYWORDS) {
    const match = text.match(pattern);
    if (match) {
      const token = (match[1] ?? match[0]).trim();
      return { type, weak: token.length <= 1 };
    }
  }
  return { type: 'load', weak: false };
}

/** 텍스트 한 조각의 기기 종류 판정 — 사전 공백이 곧 미검출이라 단독 검사 대상이다. */
export function detectComponentType(text: string): SLDComponentType {
  return detectComponentTypeEx(text).type;
}

// 주석 문장 게이트(2026-07-21 3차 실증): 영문 노트 "If you do not have VCB but
// you have LBS…"가 breaker/panel로 승격됐다(RSC 실도면 라이브 실측). 설비 라벨은
// 짧은 코드(MCCB ABSc 3P 250/100A)지 문장이 아니다.
// 임계 ≥2(버그 사냥 F3 수리): 단일 기능어는 설비 라벨에도 흔하다("PANEL A"의 A,
// "SPARE MCCB FOR FUTURE"의 FOR) — 1개만으로 주석 판정하면 실설비를 억제한다.
// 진짜 주석은 기능어가 여럿(if/you/do/not/have… 7개)이므로 2개 이상을 요구한다.
const PROSE_FUNCTION_WORDS = /\b(if|you|do|does|not|but|have|has|the|an?|shall|should|will|must|for|with|are|is|to|of|in)\b/gi;
const KOREAN_PROSE_MARKERS = /(하여|하십시오|할 것|해야|합니다|바랍니다|참조)/;
function isProseText(text: string): boolean {
  if (text.trim().split(/\s+/).length < 5) return false;
  if (KOREAN_PROSE_MARKERS.test(text)) return true;
  const hits = text.match(PROSE_FUNCTION_WORDS);
  return hits !== null && hits.length >= 2;
}

// 표 문서 표제(2026-07-21 3차 실증): 실물 케이블 스케줄(EE-007)은 표 블록마다
// 표제를 반복한다(실측 7회). 셀마다 장치 라벨이 있어 snapped>junctioned 방어
// (R7)를 실물 대형 표가 뚫으므로, 표제 토큰의 반복을 문서 유형 증거로 쓴다.
const SCHEDULE_TITLE = /(CABLE|PANEL|LOAD)\s*(SCHEDULE|TABLE)|일람표|부하집계표/i;

// =========================================================================
// PART 3 — 유클리디안 거리
// =========================================================================

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * 글자 폭 합(em 배수). 한글·한자·가나는 전각이라 라틴 문자의 약 두 배다.
 *
 * 폭을 라틴 기준(0.6em)으로만 잡으면 한글 텍스트의 오른쪽 끝이 실제보다 짧게
 * 계산되고, 그러면 다음 글자와의 간격이 실제보다 넓어 보여 같은 낱말인데도
 * 안 붙는다(실측 2026-07-26: "일련번호" 네 글자가 각각 따로).
 */
function advanceWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    // 한글 음절·자모, CJK 통합한자, 가나, 전각 기호.
    em += /[가-힯ᄀ-ᇿ㄰-㆏一-鿿぀-ヿ＀-｠]/.test(ch)
      ? 1
      : 0.6;
  }
  return em;
}

/**
 * 같은 줄에서 붙어 나온 글자 조각을 한 낱말로 합친다.
 *
 * pdfjs 는 CAD PDF 의 한글을 글자 단위로 내보내는 경우가 있다. 실측(2026-07-26,
 * KIMM 분전반결선도): 한글 텍스트 55개 중 33개가 1글자였고 "사"/"업"/"명" 이
 * 같은 y(92.57)에 x 간격 0.94 로 나란히 놓여 있었다. 이대로면 "사업명"·"도면명"
 * 같은 한글 라벨이 어떤 키워드 매칭에도 걸리지 않는다 — 국내 도면에서 라벨
 * 판독이 통째로 죽는다.
 *
 * 임계는 매직넘버가 아니라 그 글자 자신의 높이에서 뽑는다. 같은 회전각, 같은
 * 기준선(높이의 30% 이내), 그리고 앞 글자의 오른쪽 끝과 다음 글자 왼쪽 사이가
 * 한 글자 폭의 절반 이내일 때만 잇는다. 표의 옆 칸처럼 떨어져 있으면 안 붙는다.
 */
export function mergeGlyphRuns(items: PdfTextItem[]): PdfTextItem[] {
  if (items.length < 2) return items;

  // 먼저 줄로 묶는다. y 로만 정렬해 이어 붙이면 다른 열의 글자가 사이에 끼어
  // 사슬이 끊긴다 — 같은 시각적 줄이라도 y 가 소수점에서 갈리기 때문이다
  // (실측 2026-07-26: 이 정렬 때문에 kimm 도면의 33개가 하나도 안 붙었다).
  const lines: PdfTextItem[][] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    const line = lines[lines.length - 1];
    const head = line?.[0];
    const sameLine = head !== undefined
      && (head.angle ?? 0) === (item.angle ?? 0)
      && Math.abs(head.y - item.y) <= Math.max(head.fontHeight, item.fontHeight) * 0.3;
    if (sameLine) line.push(item);
    else lines.push([item]);
  }

  const merged: PdfTextItem[] = [];
  for (const line of lines) {
    let run: PdfTextItem | undefined;
    for (const item of line.sort((a, b) => a.x - b.x)) {
      // 한 글자 폭도 전각/반각을 따라간다. 전각을 반각 기준으로 재면 임계가
      // 절반이 되어 같은 낱말이 안 붙는다(실측: "일련번호" 네 글자).
      const glyphWidth = Math.max(run?.fontHeight ?? 0, item.fontHeight)
        * advanceWidth(item.text.slice(0, 1) || 'a');
      const gap = run ? item.x - (run.x + run.width) : Infinity;
      const limit = glyphWidth * mergeLimitEm(run, item);

      if (run && gap >= -glyphWidth && gap <= limit) {
        // 원래 떨어져 있던 자리는 공백으로 남긴다 — "MCCB 3P" 가 "MCCB3P" 가 되면
        // 스펙 파서의 토큰 경계가 무너진다. 다만 한글·한자·가나끼리는 낱말 안에
        // 공백을 쓰지 않는다 — 자간을 벌린 "일 련 번 호" 로 만들면 어떤 키워드
        // 매칭에도 걸리지 않아 병합한 의미가 없다.
        const bothCjk = isCjk(lastChar(run.text)) && isCjk(item.text.slice(0, 1));
        run.text += (!bothCjk && gap > glyphWidth * 0.2 ? ' ' : '') + item.text;
        run.width = item.x + item.width - run.x;
        run.height = Math.max(run.height, item.height);
        continue;
      }
      run = { ...item };
      merged.push(run);
    }
  }

  return merged;
}

function lastChar(text: string): string {
  return text.slice(-1);
}

/** 한글·한자·가나 — 낱말 안에 공백을 쓰지 않는 문자. */
function isCjk(ch: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿가-힯]/.test(ch);
}

/**
 * 이 자리에서 몇 em 까지 한 낱말로 볼 것인가.
 *
 * CAD 표제란은 칸을 채우려고 자간을 벌린다. 실측(2026-07-26, KIMM 분전반결선도
 * 1페이지)에서 **같은 라벨 안**의 간격은 0.62~4.18em 이었다.
 *
 *   일련번호·도면번호 0.62em · 임중훈·박란신 1.06em · 사업명 1.86em
 *   축척 2.00em · 도면명 2.26em · 주기 3.74em · 설계·승인 4.07em · 수정 4.18em
 *
 * **다른 라벨과의** 최소 간격은 5.82em("토토"→"승") 이었고 나머지는 7em 이상,
 * 대개 20~190em 이다. 그래서 4.5em 을 경계로 둔다 — 위로 7%, 아래로 23% 여유.
 *
 * 다만 이 넓은 임계는 **글자 조각**에만 쓴다. 양쪽이 이미 여러 글자면 낱말이
 * 끝난 것이라 좁게 본다 — 그러지 않으면 "한국기계연구원"과 "건축사사무소"가
 * 7.97em 떨어져 있는데도 한 덩어리가 된다.
 *
 * 한계: 간격만으로는 못 가르는 자리가 남는다. 같은 도면의 "대"→"표 :" 는 7.00em
 * 인데 "대표"가 맞다. 붙이려면 5.82em 인 "토토"→"승" 도 함께 붙어 버리므로
 * 여기서는 붙이지 않는다 — 없는 낱말을 만드는 쪽이 더 나쁘다.
 */
const FRAGMENT_MERGE_EM = 4.5;
const WORD_MERGE_EM = 0.6;

function mergeLimitEm(run: PdfTextItem | undefined, item: PdfTextItem): number {
  if (!run) return WORD_MERGE_EM;
  const fragment = [...run.text.trim()].length === 1 || [...item.text.trim()].length === 1;
  return fragment ? FRAGMENT_MERGE_EM : WORD_MERGE_EM;
}

function lineLength(seg: PdfLineSegment): number {
  return Math.sqrt((seg.x2 - seg.x1) ** 2 + (seg.y2 - seg.y1) ** 2);
}

// =========================================================================
// PART 5 — Public API
// =========================================================================

/**
 * PDF 바이트 → SLDAnalysis 변환.
 * pdfjs-dist로 텍스트 좌표 추출 + 연산자 스트림에서 선분 추출.
 */
export async function parsePdfToSLD(
  pdfBytes: ArrayBuffer,
  options: PdfParseOptions = {},
): Promise<SLDAnalysis> {
  const { pageNumber = 1, textProximityThreshold = 30, minLineLength = 10 } = options;
  const maxTextItems = workLimit(options.maxTextItems, PDF_WORK_LIMITS.textItems);
  const maxOperators = workLimit(options.maxOperators, PDF_WORK_LIMITS.operators);
  const maxPathValues = workLimit(options.maxPathValues, PDF_WORK_LIMITS.pathValues);
  const deadline = Date.now() + workLimit(options.deadlineMs, 30_000);

  // pdfjs-dist 동적 임포트 (서버 번들 최소화).
  // 반드시 legacy 빌드 — 기본 빌드는 모듈 최상위에서 new DOMMatrix()를 실행해
  // Node 런타임에서는 임포트 자체가 터진다(라이브 실측으로 발각: 모든 PDF
  // 업로드가 500 "DOMMatrix is not defined"). 이 임포트는 사용자 입력과 무관한
  // 서버 구성 문제라 아래 try(입력 흡수) 밖에 둔다.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // 손상·비PDF·페이지 범위 초과는 사용자 입력 문제지 서버 장애가 아니다.
  // 여기서 흡수하지 않으면 라우트가 500을 내며 내부 오류 문자열까지 노출한다
  // (DXF 파서와 동일 계약으로 맞춤 — 파싱 실패는 예외가 아니라 결과다).
  let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
  let doc: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
  let page: Awaited<ReturnType<typeof doc.getPage>>;
  try {
    loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBytes),
      ...pdfjsNodeDocumentOptions(),
    });
    doc = await boundedPdfWork(
      loadingTask.promise,
      options.signal,
      deadline,
      () => loadingTask!.destroy(),
    );
    page = await boundedPdfWork(
      doc.getPage(pageNumber),
      options.signal,
      deadline,
      () => loadingTask!.destroy(),
    );
  } catch (err) {
    await loadingTask?.destroy().catch(() => undefined);
    return {
      components: [],
      connections: [],
      suggestedCalculations: [],
      confidence: 0,
      rawDescription: `PDF parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  try {
    const viewport = page.getViewport({ scale: 1.0 });

    // 텍스트 추출
    const textContent = await boundedPdfWork(
      page.getTextContent(),
      options.signal,
      deadline,
      () => loadingTask!.destroy(),
    );
    if (textContent.items.length > maxTextItems) {
      return pdfResourceLimit(`text items ${textContent.items.length} > ${maxTextItems}`);
    }
    const rawTexts: PdfTextItem[] = textContent.items
    .filter((item): item is typeof item & { str: string; transform: number[] } =>
      'str' in item && typeof (item as { str?: unknown }).str === 'string')
    .map((item) => {
      const tx = item.transform;
      // 회전각(90° 양자화): CAD가 가로 도면을 세로 페이지에 회전 배치하면 모든
      // 텍스트 transform에 회전이 실린다(3차 실증: RSC SLD 결속률 70%→20% 급락).
      const rawAngle = Math.atan2(tx[1], tx[0]) * (180 / Math.PI);
      const angle = ((Math.round(rawAngle / 90) * 90) % 360 + 360) % 360;
      return {
        text: item.str,
        x: tx[4],
        y: viewport.height - tx[5], // PDF Y축 반전
        width: Math.abs(tx[0]) * advanceWidth(item.str),
        height: Math.abs(tx[3]),
        fontHeight: Math.abs(tx[3]),
        angle,
      };
    })
    .filter(t => t.text.trim().length > 0);

  const texts = mergeGlyphRuns(rawTexts);

  // 연산자 스트림에서 선분 추출.
  //
  // 실도면 실측(한국기계연구원 분전반결선도·대산 교재)에서 단독 moveTo/lineTo
  // op는 0건 — pdfjs v4+는 모든 경로를 constructPath(OPS=91) 하나로 묶어
  // [paintOp, Float32Array[](DrawOPS 인터리브), minMax] 형태로 내보낸다.
  // 기존 fn===13/14 직독은 실제 CAD PDF에서 선분 0개를 반환하며 사문이었다.
  // DrawOPS 코드/좌표 소비폭은 pdfjs 소스(makePathFromDrawOPS) 원문 기준:
  // moveTo:0(2) lineTo:1(2) curveTo:2(6) quadraticCurveTo:3(4) closePath:4(0).
  //
  // 좌표는 현재 CTM 기준 로컬 좌표라(실측: 음수 좌표 페이지 존재) save/restore/
  // transform 스택을 추적해 절대 좌표로 환원해야 텍스트 좌표와 같은 공간에서
  // 스냅·근접 매핑이 성립한다. 칠하기 전용(fill)·클립 전용(endPath) 경로는
  // 면/마스크지 결선이 아니므로 stroke 계열 paint일 때만 선분으로 채택한다.
    const opList = await boundedPdfWork(
      page.getOperatorList(),
      options.signal,
      deadline,
      () => loadingTask!.destroy(),
    );
    if (opList.fnArray.length > maxOperators) {
      return pdfResourceLimit(`operators ${opList.fnArray.length} > ${maxOperators}`);
    }
    const OPS = pdfjsLib.OPS;
    let pathValueCount = 0;
    for (let i = 0; i < opList.fnArray.length; i++) {
      if (opList.fnArray[i] !== OPS.constructPath) continue;
      const args = opList.argsArray[i] as unknown[] | undefined;
      const subpaths = args?.[1];
      if (!Array.isArray(subpaths)) continue;
      for (const raw of subpaths) {
        if (!raw || typeof raw !== 'object' || !('length' in raw)) continue;
        const length = Number((raw as ArrayLike<number>).length);
        if (!Number.isSafeInteger(length) || length < 0) {
          return pdfResourceLimit('invalid constructPath length');
        }
        pathValueCount += length;
        if (pathValueCount > maxPathValues) {
          return pdfResourceLimit(`path values ${pathValueCount} > ${maxPathValues}`);
        }
      }
    }
  const STROKE_PAINTS = new Set<number>([
    OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke,
    OPS.closeFillStroke, OPS.closeEOFillStroke,
  ]);
  const lines: PdfLineSegment[] = [];
  const pushSeg = (x1: number, y1: number, x2: number, y2: number) => {
    const seg: PdfLineSegment = {
      x1, y1: viewport.height - y1,
      x2, y2: viewport.height - y2,
      pageWidth: viewport.width, pageHeight: viewport.height,
    };
    if (lineLength(seg) >= minLineLength) lines.push(seg);
  };

  type Mtx = [number, number, number, number, number, number];
  let ctm: Mtx = [1, 0, 0, 1, 0, 0];
  const ctmStack: Mtx[] = [];
  const mul = (m1: Mtx, m2: Mtx): Mtx => [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  const apply = (x: number, y: number) => ({
    x: ctm[0] * x + ctm[2] * y + ctm[4],
    y: ctm[1] * x + ctm[3] * y + ctm[5],
  });

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as unknown[];

    if (fn === OPS.save) { ctmStack.push(ctm); continue; }
    if (fn === OPS.restore) { ctm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0]; continue; }
    if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
      ctm = mul(ctm, args.slice(0, 6) as Mtx);
      continue;
    }
    if (fn !== OPS.constructPath || !args) continue;

    const paintOp = args[0] as number;
    if (!STROKE_PAINTS.has(paintOp)) continue;
    const subpaths = args[1];
    if (!Array.isArray(subpaths)) continue;

    for (const raw of subpaths) {
      const path = raw as ArrayLike<number>;
      let cur = { x: 0, y: 0 };
      let start = { x: 0, y: 0 };
      let k = 0;
      while (k < path.length) {
        const code = path[k++];
        if (code === 0) { // moveTo
          cur = apply(path[k], path[k + 1]); k += 2; start = cur;
        } else if (code === 1) { // lineTo
          const next = apply(path[k], path[k + 1]); k += 2;
          pushSeg(cur.x, cur.y, next.x, next.y);
          cur = next;
        } else if (code === 2) { // curveTo — 심볼 원호는 결선이 아님, 현재점만 이동
          cur = apply(path[k + 4], path[k + 5]); k += 6;
        } else if (code === 3) { // quadraticCurveTo
          cur = apply(path[k + 2], path[k + 3]); k += 4;
        } else if (code === 4) { // closePath — 시작점으로의 실제 변
          pushSeg(cur.x, cur.y, start.x, start.y);
          cur = start;
        } else {
          break; // 미지 코드 — 좌표 폭을 모르므로 이 서브패스 중단(오독 방지)
        }
      }
    }
  }

  // 도면 회전 정규화(2026-07-21 3차 실증): CAD가 가로 도면을 세로 페이지에 90°
  // 회전 플롯하면 결속 기하(부하명=앵커 아래 dy 3~9·근접 30pt)가 전부 어긋나
  // 스펙 결속률이 70%→20%로 무너졌다(RSC SLD 라이브 실측). 텍스트 과반이 같은
  // 90° 배수 각이면 도면 전체가 회전된 것 — 좌표계를 되돌려 하류(근접 매핑·
  // 행 결속·스냅)가 수평 전제 그대로 성립하게 한다. 상수 임계 없이 과반 비교만.
  let pageW = viewport.width;
  let pageH = viewport.height;
  {
    const angleCounts = new Map<number, number>();
    for (const t of texts) angleCounts.set(t.angle ?? 0, (angleCounts.get(t.angle ?? 0) ?? 0) + 1);
    let domAngle = 0;
    let domCount = 0;
    for (const [a, n] of angleCounts) if (n > domCount) { domAngle = a; domCount = n; }
    if (domAngle !== 0 && domCount * 2 > texts.length) {
      const W = viewport.width;
      const H = viewport.height;
      // 매핑은 flipped(screen) 공간 기준 — 실좌표 A/B로 검증한 대응(RSC p4:
      // raw 270° 우세 129/165에서 (y, W−x)만이 "스펙이 라벨 아래 dy+12"의
      // 실기하를 복원 — 반대 배정은 dy−12로 상하 반전):
      //   raw 270°(RSC 실측 케이스) → (x,y)→(y, W−x), 페이지 (H,W)
      //   raw 90°                  → (x,y)→(H−y, x), 페이지 (H,W)
      //   raw 180°                 → (x,y)→(W−x, H−y), 페이지 동일
      const map =
        domAngle === 270 ? (x: number, y: number) => ({ x: y, y: W - x })
        : domAngle === 90 ? (x: number, y: number) => ({ x: H - y, y: x })
        : (x: number, y: number) => ({ x: W - x, y: H - y });
      if (domAngle !== 180) { pageW = H; pageH = W; }
      for (const t of texts) {
        const p = map(t.x, t.y);
        t.x = p.x;
        t.y = p.y;
      }
      for (const seg of lines) {
        const p1 = map(seg.x1, seg.y1);
        const p2 = map(seg.x2, seg.y2);
        seg.x1 = p1.x; seg.y1 = p1.y;
        seg.x2 = p2.x; seg.y2 = p2.y;
        seg.pageWidth = pageW;
        seg.pageHeight = pageH;
      }
    }
  }

  // SLD 변환
  const components: SLDComponent[] = [];
  const connections: SLDConnection[] = [];
  // 컴포넌트 position은 0-100 정규화 좌표지만 선분 끝점은 raw pt 좌표라
  // 스냅은 raw 공간에서 해야 한다 — raw 앵커를 병행 수집한다.
  const rawAnchors: SnapAnchor[] = [];
  let compIdx = 0;
  let connIdx = 0;

  // 텍스트 → 컴포넌트 승격 규칙 (설비 근거 = 심볼 키워드).
  //
  // 컴포넌트는 반드시 설비 종류를 가리키는 **키워드**가 있어야 생성된다:
  //   - 확신 키워드(2글자+ TR/MCCB/GEN/PANEL...) → 승격
  //   - weak 키워드(1글자 M) → 스펙 증거가 있을 때만 승격("M 5.5kW"=모터,
  //     단독 "M"=제외)
  //   - 키워드 없음 → **어떤 스펙이 있어도 컴포넌트 아님** (주석/라벨로 간주)
  //
  // 이전 규칙("스펙 증거만 있으면 부하로 승격")은 표제란·모선 전압 라벨을
  // phantom 부하로 환각했다: 도면의 "수전전압 22.9kV"·"380/220V"·"3P 3W 220V"
  // 같은 라벨은 항상 전압/전류 스펙을 담으므로 스펙-게이트를 통과해 가짜
  // 부하 + 가짜 부하계산을 만들었다(독립 심사 IND-1 adversary가 conf 0.85
  // 실도면 경로에서 라이브 재현 — R8/R8b 단일문자 그림자와 같은 결함군의
  // 최상위층). 설비는 심볼로 존재하지 스펙 텍스트로 존재하지 않는다.
  // 트레이드오프: 키워드 없이 스펙만 붙은 실부하(예: "HEATER 45kW")는 이제
  // 라벨 없는 텍스트로 남는다 — false-positive(가짜 계산)가 false-negative
  // (보이는 미표기 노드)보다 위험하다는 제품 방향(엄밀·정확·신뢰). 스펙
  // 텍스트는 아래 케이블-스펙 근접 매핑에서 연결에 붙는 용도로는 계속 쓰인다.
  const usedTexts = new Set<number>();
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const detection = detectComponentTypeEx(t.text);
    const type = detection.type;
    const specProbe = parseSpecText(t.text);
    const hasSpecEvidence = Boolean(specProbe.voltage || specProbe.current || specProbe.power);
    // 주석 문장은 키워드를 품어도 장치가 아니다(isProseText — RSC 노트 환각 수리).
    const promote = type !== 'load' && (!detection.weak || hasSpecEvidence) && !isProseText(t.text);
    if (promote) {
      const spec = specProbe;
      rawAnchors.push({ id: `comp_${compIdx + 1}`, x: t.x, y: t.y });
      components.push({
        id: `comp_${++compIdx}`,
        type,
        label: t.text.slice(0, 50),
        position: { x: Math.round(t.x / pageW * 100), y: Math.round(t.y / pageH * 100) },
        voltage: spec.voltage ? `${spec.voltage}V` : undefined,
        current: spec.current ? `${spec.current}A` : undefined,
        rating: spec.power
          ? `${spec.power}${spec.powerUnit}`
          : spec.frameA !== undefined ? `${spec.frameA}AF/${spec.tripA}AT` : undefined,
        properties: spec.poles ? { poles: spec.poles } : undefined,
      });
      usedTexts.add(i);
    }
  }

  // 일람표 행 결속(2026-07-21 2차 — 실좌표 재설계): 구판 y±3·우측 휴리스틱은 실측
  // 기하(부하명=앵커 아래 dy 3~9)와 불일치해 헤더 텍스트만 오결속(8/8 라이브 실측)
  // → 제거 후, 골든 좌표 기반 순수 모듈(schedule-row-binding)로 교체. 채점 정본은
  // fixtures/drawings/golden/kimm-panelboard-sld.p14.adjudicated.json의 branchRows.
  for (let a = 0; a < rawAnchors.length; a++) {
    const comp = components[a];
    const binding = bindScheduleRow({ x: rawAnchors[a].x, y: rawAnchors[a].y, text: comp.label ?? '' }, texts);
    if (binding.load || binding.tag) {
      comp.properties = {
        ...(comp.properties ?? {}),
        ...(binding.load ? { load: binding.load } : {}),
        ...(binding.tag ? { tag: binding.tag } : {}),
      };
    }
  }

  // 선분 → 연결 (일정 길이 이상 — 임계는 종이 pt 공간의 기하 노이즈 필터일 뿐)
  //
  // length는 넣지 않는다(2026-07-21 3차 실증 수리): 도면 종이 좌표에는 축척이
  // 없어(실측 표제란 SCALE=NONE) pt→m 환산(구판 ptToMeter)은 실거리가 아니라
  // 발명이다 — calcChain cable-sizing/voltage-drop이 가공 길이 0.09~0.37m로
  // 오염되던 실측. VLM 경로 계약("Never infer a physical length from pixel
  // spacing")과 같은 도메인 규칙: 길이는 도면에 인쇄된 값이 있을 때만 존재한다.
  const MIN_CONN_SEGMENT_PT = 28.35; // 구판 1cm 필터와 동일 기하량(0.01m×2834.65pt/m)
  for (const seg of lines) {
    if (lineLength(seg) < MIN_CONN_SEGMENT_PT) continue;

    connections.push({
      id: `conn_${++connIdx}`,
      from: formatEndpointId({ x: seg.x1, y: seg.y1 }),
      to: formatEndpointId({ x: seg.x2, y: seg.y2 }),
      length: undefined,
      conductorSize: undefined,
      cableType: undefined,
    });
  }

  // 미사용 텍스트 중 케이블 스펙 → 가장 가까운 연결에 매핑
  for (let i = 0; i < texts.length; i++) {
    if (usedTexts.has(i)) continue;
    const t = texts[i];
    const spec = parseSpecText(t.text);
    if (!spec.conductorSize && !spec.cableType) continue;

    let closestConn: SLDConnection | null = null;
    let closestDist = textProximityThreshold;

    for (const conn of connections) {
      const fromCoords = parseNodeCoords(conn.from);
      const toCoords = parseNodeCoords(conn.to);
      if (!fromCoords || !toCoords) continue;
      const mid = { x: (fromCoords.x + toCoords.x) / 2, y: (fromCoords.y + toCoords.y) / 2 };
      const d = dist({ x: t.x, y: t.y }, mid);
      if (d < closestDist) { closestDist = d; closestConn = conn; }
    }

    if (closestConn) {
      if (spec.conductorSize) closestConn.conductorSize = `${spec.conductorSize}sq`;
      if (spec.cableType) closestConn.cableType = spec.cableType;
      if (spec.parallelCount) closestConn.parallelCount = spec.parallelCount;
      if (spec.installationMethod) closestConn.installationMethod = spec.installationMethod;
      if (spec.ambientTemperature !== undefined) closestConn.ambientTemperature = spec.ambientTemperature;
      if (spec.groupedCircuitCount !== undefined) closestConn.groupedCircuitCount = spec.groupedCircuitCount;
      if (spec.prospectiveFaultCurrentKA !== undefined) closestConn.prospectiveFaultCurrentKA = spec.prospectiveFaultCurrentKA;
      if (spec.breakingCapacityKA !== undefined) closestConn.breakingCapacityKA = spec.breakingCapacityKA;
      if (spec.protectionCurve) closestConn.protectionCurve = spec.protectionCurve;
      const hasSourceBackedCondition = spec.installationMethod !== undefined
        || spec.ambientTemperature !== undefined
        || spec.groupedCircuitCount !== undefined
        || spec.prospectiveFaultCurrentKA !== undefined
        || spec.breakingCapacityKA !== undefined
        || spec.protectionCurve !== undefined;
      if (hasSourceBackedCondition) {
        closestConn.sourceIds = [...new Set([...(closestConn.sourceIds ?? []), `pdf-text:${i + 1}`])].sort();
      }
    }
  }

  // 끝점 결속(raw 공간) — comp_N ↔ node_at 불일치로 전 엣지가 허공이던 결함 수리.
  const snap = snapConnectionEndpoints(rawAnchors, connections);
  for (const j of snap.junctions) {
    components.push({
      id: j.id,
      type: 'bus',
      label: '접점 (junction)',
      position: {
        x: Math.round((j.x / pageW) * 100),
        y: Math.round((j.y / pageH) * 100),
      },
      properties: { synthetic: 'junction' },
    });
  }

  // confidence는 상수가 아니라 추출 증거에서 파생한다 — 상수 0.85는 선분 0개
  // 스캔본(결선 해석 불가)까지 "성공 0.85"로 보고하는 정직성 결함이었다
  // (라이브 실측 발각). 등급 근거:
  //   0    — 아무것도 못 읽음(라우트가 400으로 번역)
  //   0.3  — 텍스트만 있고 기하 0 → 스캔/이미지 도면 추정, 결선 구조 없음
  //   0.55 — 선분은 있으나 결속(스냅) 0 → 위치 신뢰 낮음
  //   0.85 — 구조 성립(DXF 0.95보다 낮게, VLM 0.5~0.7보다 높게 유지)
  // 결속 우세 판정: 끝점이 실제 설비 앵커에 붙은 수(snapped)가 합성 접점
  // 수(junctioned) 이하면, 추출된 선형은 설비에 닿지 않는 표 격자·표제란
  // 테두리일 가능성이 크다(실측: 실기시험 도면 표제란 격자가 snapped 7 vs
  // junctioned 68로 결선 행세 — 실제 분전반 도면은 525 vs 47로 역전).
  // 상수 임계 발명 없이 두 증거량의 비교만 쓴다.
  const anchored = snap.stats.snapped > snap.stats.junctioned;
  // 표 문서 강등(2026-07-21 3차 실증): 실물 케이블 스케줄(EE-007)은 셀마다 장치
  // 라벨이 있어 끝점이 앵커에 붙으므로 anchored 방어를 뚫고 conf 0.85 회로
  // 165장치를 발명했다. 도면 관례상 표 문서는 블록마다 표제를 반복하므로
  // (실측 EE-007 "CABLE SCHEDULE" 7회), 표제 토큰 반복(≥2)을 문서 유형 증거로
  // 강등한다. 표제 1회짜리 혼합 시트(결선도+부분 표)는 유지 — 선언된 잔여.
  const scheduleTitleCount = texts.filter((t) => SCHEDULE_TITLE.test(t.text)).length;
  const tableDocument = scheduleTitleCount >= 2;
  const structureNote =
    lines.length === 0 ? ' — 기하(선분) 0: 스캔/이미지 도면 추정, 결선 해석 불가'
    : snap.connections.length === 0 ? ' — 선분은 있으나 결속 0: 배치만 참고'
    : !anchored ? ' — 결선 끝점이 설비보다 합성 접점에 주로 붙음: 표 격자/장식선 의심, 배치만 참고'
    : tableDocument ? ` — 표 문서 판정(표제 ${scheduleTitleCount}회): 행렬 괘선이 결선 행세, topology 신뢰 불가·텍스트/배치만 참고`
    : '';
  const confidence =
    components.length === 0 && texts.length === 0 && lines.length === 0 ? 0
    : lines.length === 0 ? 0.3
    : snap.connections.length === 0 ? 0.55
    : !anchored ? 0.55
    : tableDocument ? 0.55
    : 0.85;

  // 표 문서면 행 단위 데이터를 추출한다(중급): SLD 결선도에서 UNKNOWN이던 분기
  // 케이블-차단기 쌍이 이 표에 있다. 표를 버리지 않고 데이터로 읽어 검토 입력원으로.
  const scheduleTables = tableDocument
    ? parseScheduleTables(texts.map((t) => ({ s: t.text, x: t.x, y: t.y })), pageH)
    : [];

    return {
      components,
      connections: snap.connections,
      sourceTexts: texts.map((item) => ({
        text: item.text,
        position: {
          x: Math.max(0, Math.min(100, (item.x / Math.max(1, pageW)) * 100)),
          y: Math.max(0, Math.min(100, (item.y / Math.max(1, pageH)) * 100)),
        },
        confidence: 0.99,
      })),
      suggestedCalculations: generateSuggestions({ components, connections: snap.connections }),
      confidence,
      ...(scheduleTables.length > 0 ? { scheduleTables } : {}),
      rawDescription: `PDF vector parsed (page ${pageNumber}): ${components.length} components, ${snap.connections.length} connections (snapped ${snap.stats.snapped}, junctions ${snap.stats.junctioned}, dropped ${snap.stats.droppedSelfLoops}), ${texts.length} text items, ${lines.length} line segments${structureNote}`,
    };
  } catch (err) {
    return {
      components: [],
      connections: [],
      suggestedCalculations: [],
      confidence: 0,
      rawDescription: `PDF parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    try {
      page.cleanup();
    } finally {
      await loadingTask.destroy().catch(() => undefined);
    }
  }
}

function parseNodeCoords(nodeId: string): { x: number; y: number } | null {
  // 소수 좌표 허용(버그 사냥 F2 수리): formatEndpointId/endpoint-snap의 NODE_AT는
  // 소수 6자리를 보존하는데 이 정수-전용 정규식이 `node_at_123.36_707.85`를 null로
  // 떨궈, 케이블 스펙→연결 근접 매핑이 소수 좌표(PDF Y반전·A계열 841.89pt 등으로
  // 거의 전 끝점)에서 전면 사문이었다 — CABLE-AMPACITY가 못 발화하고 DATA-GAP으로만
  // 침묵. 정본과 같은 [\d.] 문자군으로 정렬한다.
  const match = nodeId.match(/node_at_(-?[\d.]+)_(-?[\d.]+)/);
  if (!match) return null;
  const x = parseFloat(match[1]);
  const y = parseFloat(match[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
