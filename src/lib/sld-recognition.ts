/**
 * ESVA Single Line Diagram (SLD) AI Recognition
 * -----------------------------------------------
 * Vision LLM-based SLD analysis: component extraction,
 * connection mapping, and automatic calculation chain generation.
 *
 * PART 1: Types
 * PART 2: Vision LLM SLD analysis
 * PART 3: Calculation chain generation
 */

import { CALCULATOR_PARAMS } from '@/lib/calculator-params';
import { parseMeasuredValue } from '@/lib/calculator-lexicon';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 도면에서 뽑을 수 있는 기기 종류 — **정본은 이 배열 하나다.**
 *
 * 전에는 이 어휘가 네 곳에 손으로 복제돼 있었다(여기 유니온 · custom-rules 의
 * 문자열 Set · pdf-vector-parser 의 정규식 사전 · dxf-parser 의 블록맵).
 * 한 곳만 늘리면 나머지가 조용히 어긋난다. 타입은 이 배열에서 파생시키고,
 * 런타임 검증이 필요한 쪽은 배열을 그대로 가져다 쓴다.
 *
 * `arrester` 추가(2026-07-27): 22.9kV 수전 실도면(삼선결선도)을 파이프라인에
 * 넣었더니 `L.A x3 18kV 5kA` 를 `switch` 로 분류했다. 모델 잘못이 아니라
 * **넣을 자리가 없었다** — 피뢰기가 어휘에 아예 없었다. 기존 어휘는 KIMM
 * 분전반(저압) 캘리브레이션에서 나와 수전설비 기기가 비어 있다.
 *
 * 조항 정정(2026-07-28): 위 문단에 "수전설비 피뢰기는 KEC 153.1.4(서지보호장치)
 * 대상" 이라고 적혀 있었는데 **틀렸다.** 153.1.4 는 내부피뢰시스템의 저압
 * 서지보호장치 조항이다. 수전측 피뢰기는 341.13(피뢰기의 시설)·341.14(피뢰기의
 * 접지)·451.3/451.4(설치장소·선정)다. 이 어휘의 `arrester` 는 LA 와 SPD 를
 * 한 칸에 담고 있으니 조항을 붙일 때 둘을 섞지 말 것.
 */
export const SLD_COMPONENT_TYPES = [
  'transformer',
  'breaker',
  'cable',
  'bus',
  'generator',
  'motor',
  'capacitor',
  'load',
  'switch',
  'relay',
  'meter',
  'panel',
  'ups',
  'mcc',
  /** 피뢰기·서지흡수기·SPD (LA / SA / SPD) */
  'arrester',
  /**
   * 아래 셋은 IEC 60617 분류에는 있는데 이 어휘에만 없던 자리다(2026-07-27).
   * 실도면 근거가 있고, 없으면 갈 곳이 없어 엉뚱한 타입에 얹힌다.
   */
  /** 접지 (E / GND / 접지) — 삼성 22.9kV 도면 `E1`, 세종 배전반 SPD 접지. 모든 도면에 있다 */
  'ground',
  /** 표시등·신호 (PL / RL / GL / 파일럿램프) — 세종 p6 분전반 각 회로마다 */
  'lamp',
  /** 퓨즈 (PF / LF / FUSE) — 차단기와 다른 기기다. 그동안 breaker 에 얹혀 있었다 */
  'fuse',
  /**
   * 수전점·인입 (INCOMING / 수전 / 한전 인입 / UTILITY) — 도면의 전원이다.
   * 자리가 없어 `load` 에 얹히고 있었다(2026-07-28 실측: 22.9kV LBS 패널의
   * `154S/S INCOMING LINE`). 부하와 전원이 뒤바뀌면 상류/하류가 통째로
   * 반대가 되고, 인입선이 최대수요 목록에 들어간다.
   */
  'source',
  /**
   * 타 도면·타 반 참조 주석 (`FROM SV-VCS#1 PT LINE`, `TO SV-TIE LBS PANEL`).
   * 도면에 적힌 정보라 버리지 않되 기기 대수에는 넣지 않는다.
   * 2026-07-28 실측: 인출선 주석 둘이 `meter` 로 승격돼 계기가 2 → 4 가 됐다.
   */
  'annotation',
] as const;

export type SLDComponentType = (typeof SLD_COMPONENT_TYPES)[number];

export interface SLDComponent {
  id: string;
  type: SLDComponentType;
  label?: string;
  rating?: string;
  voltage?: string;
  current?: string;
  position: { x: number; y: number };
  properties?: Record<string, string>;
  /**
   * 라벨에 대수가 묶여 적힌 경우의 물리 대수 (`LA x 3` → 3).
   * 표기가 없으면 붙이지 않는다 — 1 로 채우면 추정이 사실처럼 보인다.
   */
  quantity?: number;
}

export interface SLDConnection {
  id: string;
  from: string;
  to: string;
  cableType?: string;
  length?: string;
  conductorSize?: string;
  /** 병렬 다조 수(예: 2 = "150sq x 2") — 허용전류 판정 시 조수배(버그 사냥 F5) */
  parallelCount?: number;
}

export interface CalcSuggestion {
  calculatorId: string;
  inputs: Partial<Record<string, unknown>>;
  reason: string;
  priority: number;
}

export interface SLDAnalysis {
  components: SLDComponent[];
  connections: SLDConnection[];
  /** Parser-originated text anchors in the same coordinate space as components. */
  sourceTexts?: Array<{ text: string; position: { x: number; y: number }; confidence: number }>;
  suggestedCalculations: CalcSuggestion[];
  systemVoltage?: string;
  systemType?: string;
  confidence: number;
  /** True when a syntactically truncated model response was only partially recovered. */
  partial?: boolean;
  /** Machine-readable analysis warnings that must remain visible to downstream review. */
  warnings?: string[];
  /** 케이블 스케줄 표(중급) — 표 문서에서 행 단위 피더 데이터. 검토 입력원. */
  scheduleTables?: Array<{
    title: string;
    columns: Array<{ name: string; xStart: number; xEnd: number }>;
    rows: Array<{ cells: Record<string, string> }>;
  }>;
  rawDescription: string;
}

export interface CalcChainStep {
  step: number;
  calculatorId: string;
  inputs: Partial<Record<string, unknown>>;
  dependsOn?: number[];
  description: string;
}

export interface SLDAnalysisOptions {
  provider: string;
  model: string;
  apiKey: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Vision LLM SLD Analysis
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 프롬프트가 모델에게 허용하는 타입 목록. **정본 배열에서 만든다.**
 *
 * 전에는 여기 문자열로 박혀 있었고 `arrester` 가 없었다. 그래서 22.9kV 실도면의
 * `L.A x3 18kV 5kA` 를 모델이 `switch` 로 냈다 — 모델이 틀린 게 아니라 **낼 수
 * 있는 목록에 없다고 우리가 알려준 것**이다. 유니온에만 타입을 더하고 이 줄을
 * 두면 그 타입은 영원히 나오지 않는다.
 */
const PROMPT_TYPE_ENUM = SLD_COMPONENT_TYPES.join('|');

/**
 * 계기용 변성기(PT/CT/MOF/ZCT)를 전력 변압기로 낸 것을 되돌린다.
 *
 * 실측 2026-07-27: 저압 배전반 실도면의 `P.T x 3 (MOLD) 380V/190V` 가
 * `transformer` 로 나왔다. 물리적으로 변압기가 맞으니 모델이 틀렸다고만 할 수
 * 없다 — 다만 이 앱에서 `transformer` 는 **전력 변압기**를 뜻하고, 변압기 용량·
 * 단락전류 계산의 입력이 된다. 그 도면에 전력 변압기는 0 인데 1 로 세어지면
 * 하류 계산이 통째로 어긋난다.
 *
 * 사전(pdf-vector-parser)은 이미 `PT|CT → meter` 로 본다. 비전 경로만 달랐다.
 * 프롬프트로도 지시하되 모델 변덕에 맡기지 않고 여기서 결정적으로 되돌린다.
 *
 * 조용히 고치지는 않는다 — 보정했다는 사실을 warnings 로 남긴다. 그래야 모델이
 * 계속 틀리고 있다는 것이 보인다.
 */
const INSTRUMENT_TRANSFORMER = /\b(P\.?T|C\.?T|Z\.?C\.?T|M\.?O\.?F|VT)\b|계기용|변성기|영상변류기/i;

function normalizeInstrumentTransformer(
  type: SLDComponentType,
  label: string,
  hits: string[],
): SLDComponentType {
  if (type !== 'transformer' || !label) return type;
  if (!INSTRUMENT_TRANSFORMER.test(label)) return type;
  hits.push(label.slice(0, 60));
  return 'meter';
}

/**
 * 수전점을 부하로 낸 것을 되돌린다.
 *
 * 방향이 뒤집히는 오류라 라벨 오기 이상이다 — `hasLoads` 가 최대수요·수용률
 * 계산으로 라우팅하는데 거기 인입선이 들어간다.
 *
 * `FROM :` 은 단선도에서 "여기서 온다" 를 뜻하는 관용 표기라 강한 신호다.
 * 다만 계기 인출선(`FROM SV-VCS#1 PT LINE`)에도 붙으므로 `load` 로 낸
 * 것에만 적용한다 — 과잉 보정하면 진짜 부하가 사라진다.
 */
const INCOMING_SOURCE = /INCOM(?:ING|ER)|UTILITY|KEPCO|수전|인입|한전|FROM\s*:/i;

function normalizeIncomingSource(
  type: SLDComponentType,
  label: string,
  description: string,
  hits: string[],
): SLDComponentType {
  if (type !== 'load') return type;
  const haystack = `${label} ${description}`;
  if (!INCOMING_SOURCE.test(haystack)) return type;
  hits.push((label || description).slice(0, 60));
  return 'source';
}

/**
 * 라벨에 묶여 적힌 대수를 읽는다 (`LA x 3` → 3).
 *
 * 삼상 회로의 LA·CT·PT 는 상별 3 개를 두고 도면엔 `x 3` 로 한 번만 적는다.
 * 이걸 못 읽으면 대수가 1/3 로 집계된다(2026-07-28 실측: 피뢰기 라벨 3 vs 결과 1).
 *
 * 극수(`3P`)·상수(`3φ`)·정격(`1250A`)·단면적(`325sq`)은 대수가 아니다.
 * 그래서 곱셈 기호나 명시적 수량 단위(EA·개)가 붙은 것만 인정한다.
 */
const MULTIPLIER = /(?:^|[\s(\[])[x×]\s*(\d{1,3})(?![\d.])/i;
const COUNT_UNIT = /(\d{1,3})\s*(?:EA\b|개)/i;

function parseMultiplicity(label: string): number | undefined {
  if (!label) return undefined;
  const n = Number(MULTIPLIER.exec(label)?.[1] ?? COUNT_UNIT.exec(label)?.[1]);
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : undefined;
}

/**
 * 타 도면 참조 주석을 기기에서 뺀다.
 *
 * `FROM …` / `TO …` 로 시작하고 정격·전압·전류가 하나도 안 적힌 것은
 * 인출선이 어디서 오고 어디로 가는지 적은 주석이다. 같은 도면에서도
 * 실행에 따라 `properties.source` 로 잡히기도 하고 부품으로 승격되기도
 * 해서 프롬프트로만은 못 막는다.
 *
 * 자기 심볼로 그려지는 기기(차단기·개폐기·변압기·피뢰기 …)는 행선지
 * 주석이 라벨에 붙어도 기기다. 그래서 라벨만 있고 심볼 실체가 모호한
 * 셋(meter·load·panel)에만 적용한다.
 */
const CROSS_REFERENCE = /^\s*(?:FROM|TO)\b/i;
const CROSS_REFERENCE_TYPES = new Set<SLDComponentType>(['meter', 'load', 'panel']);

function normalizeCrossReference(
  type: SLDComponentType,
  label: string,
  hasSpec: boolean,
  hits: string[],
): SLDComponentType {
  if (hasSpec || !CROSS_REFERENCE_TYPES.has(type)) return type;
  if (!CROSS_REFERENCE.test(label)) return type;
  hits.push(label.slice(0, 60));
  return 'annotation';
}

/**
 * 피뢰기를 라벨로 확정한다.
 *
 * 같은 이미지를 5 회 돌렸더니 `LA x 3` 의 타입이 `arrester` 4 회·`load`
 * 1 회로 갈렸다(2026-07-28). 어휘를 넓히고 프롬프트에 규칙을 넣어도 실행
 * 간 변동은 남는다. 피뢰기는 KEC 341.13(시설)·341.14(접지) 대상이라
 * 0 으로 세어지면 그 판정이 통째로 빠진다.
 *
 * `\bL\.?A\b` 는 `L.B.S`·`LBS#1` 에는 안 걸리지만 `LA-3 분전반` 같은
 * 반 번호에는 걸린다. 그래서 뒤에 하이픈+숫자가 붙은 것은 제외한다.
 */
const ARRESTER_LABEL = /\bL\.?A\b(?!\s*[-–]\s*\d)|피뢰기|Lightning\s+Arrester|Surge\s+Arrester/i;
const ARRESTER_FROM_TYPES = new Set<SLDComponentType>(['load', 'switch', 'panel']);

function normalizeArrester(
  type: SLDComponentType,
  label: string,
  hits: string[],
): SLDComponentType {
  if (!ARRESTER_FROM_TYPES.has(type) || !label) return type;
  if (!ARRESTER_LABEL.test(label)) return type;
  hits.push(label.slice(0, 60));
  return 'arrester';
}

const SLD_SYSTEM_PROMPT =`You are an expert electrical engineer analyzing Single Line Diagrams (SLD).
Analyze the SLD image and extract:
1. All components (transformers, breakers, cables, buses, generators, motors, capacitors, loads, etc.)
2. All connections between components
3. System voltage levels and type (single/three phase)

Return ONLY valid JSON with this structure:
{
  "components": [
    {
      "id": "comp_1",
      "type": "${PROMPT_TYPE_ENUM}",
      "label": "string or null",
      "rating": "string or null (e.g. 1000kVA, 100A)",
      "voltage": "string or null (e.g. 22.9kV, 380V)",
      "current": "string or null",
      "position": { "x": 0-100, "y": 0-100 },
      "properties": {}
    }
  ],
  "connections": [
    {
      "id": "conn_1",
      "from": "comp_1",
      "to": "comp_2",
      "cableType": "string or null (e.g. XLPE, CV)",
      "length": "string or null (e.g. 50m)",
      "conductorSize": "string or null (e.g. 185sq)"
    }
  ],
  "systemVoltage": "main voltage level",
  "systemType": "3-phase 4-wire / 3-phase 3-wire / single-phase",
  "confidence": 0.0-1.0,
  "rawDescription": "brief text description of the SLD"
}
- Use "arrester" for lightning/surge arresters (LA, SA, SPD, 피뢰기, 서지흡수기) — they are protective devices, not switches
- "transformer" means POWER transformers only. Instrument transformers (PT, VT, CT, ZCT, MOF, 계기용 변성기) are "meter" — they feed measurement, not load
- Use "source" for the incoming supply point (INCOMING LINE, INCOMER, 수전점, 인입, 한전/KEPCO supply, utility feed, a "FROM : ..." note naming an upstream substation). It is where power ENTERS the drawing. Never type it as "load" — that inverts the direction of the whole diagram
- A component group printed with a multiplicity marker ("LA x 3", "P.T x 3", "3EA", "3개") is that many physical devices. Keep the marker in "label" verbatim so the count is not lost
- A cross-reference note ("FROM SV-VCS#1 PT LINE", "TO SV-TIE LBS PANEL") tells you where a line comes from or goes to on ANOTHER sheet. It is not a device on this sheet — attach it to the device it annotates via "properties", or type it "annotation". Never emit it as a meter, load, or panel
- A voltage printed on a CABLE or BUS is its INSULATION CLASS, not the operating voltage (e.g. "600V 3P4W" on a bus of a 380V system). Never report it as systemVoltage. Take systemVoltage from the incoming-line note or from the PT ratio; if neither is present, omit systemVoltage rather than guessing
- Position x/y must be numeric values from 0 to 100 relative to the current image
- Include length only when a numeric value and unit are explicitly printed on the drawing
- Never infer a physical length, rating, voltage, or conductor size from pixel spacing
- If printed text is too blurred, faint, or low-resolution to read with certainty, set that field to null. Do NOT pick the most likely digit. A scanned drawing where "5" and "6" are indistinguishable must yield null, not a guess — a wrong rating on a compliance report is worse than a missing one
- Lower "confidence" when key printed values were unreadable. A high confidence with guessed ratings is the worst outcome
Return ONLY valid JSON. No markdown, no explanation.`;

/**
 * Vision LLM을 사용한 단선도(SLD) 분석
 */
export async function analyzeSLD(
  imageData: string | Blob,
  options: SLDAnalysisOptions,
): Promise<SLDAnalysis> {
  const base64 = await toBase64(imageData);
  const mimeType = detectMimeType(base64);

  let responseText: string;

  switch (options.provider) {
    case 'openai':
      responseText = await callOpenAIVision(base64, mimeType, options);
      break;
    case 'claude':
      responseText = await callClaudeVision(base64, mimeType, options);
      break;
    case 'gemini':
      responseText = await callGeminiVision(base64, mimeType, options);
      break;
    default:
      throw new Error(`[ESA-SLD] Unsupported vision provider: ${options.provider}. Use openai, claude, or gemini.`);
  }

  const parsed = parseSLDResponse(responseText);
  const suggestions = generateSuggestions(parsed);

  return {
    ...parsed,
    suggestedCalculations: suggestions,
  };
}

/**
 * 절단된 VLM JSON을 복구한다(버그 사냥·라이브 검증 실측). 문자열 리터럴을
 * 무시하며 괄호 깊이를 추적해, 마지막으로 "완전한 값이 끝난 지점"까지 자르고
 * 열려 있는 `[`·`{`를 순서 반대로 닫는다. 완전 복구가 아니라 부분 판독 보존이
 * 목적 — 상세 도면이 토큰 한도를 넘겨 잘려도 0개 폐기 대신 앞부분을 살린다.
 */
export function salvageTruncatedJson(input: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastComplete = -1; // 컨테이너(객체/배열)가 완결로 닫힌 직후 인덱스만 안전
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { stack.pop(); lastComplete = i + 1; }
    // 문자열 닫힘·콤마는 안전 지점이 아니다(미완 객체 내부일 수 있음).
  }
  if (lastComplete <= 0) throw new Error('복구할 완전한 값이 없습니다.');
  // lastComplete까지의 깊이를 재계산해 그 지점에서 열린 괄호만 닫는다.
  let head = input.slice(0, lastComplete);
  const closeStack: string[] = [];
  let s = false, e = false;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (s) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') s = false; continue; }
    if (c === '"') s = true;
    else if (c === '{') closeStack.push('}');
    else if (c === '[') closeStack.push(']');
    else if (c === '}' || c === ']') closeStack.pop();
  }
  return head + closeStack.reverse().join('');
}

export function parseSLDResponse(text: string): SLDAnalysis {
  try {
    const trimmed = text.trim();
    // 견고 추출(라이브 VLM 검증 실측 수리): Gemini가 ```json 펜스로 감싸거나
    // 앞뒤에 설명 문장을 붙여 보내면 구 `^```...```$` 전체앵커가 실패해, VLM이
    // 도면을 옳게 읽고도(예: "Main Breaker 100AF/75AT") 결과가 통째로 버려졌다
    // (components 0·confidence 0). 펜스를 느슨히 벗기고 첫 '{'~마지막 '}'를
    // 뽑아 주변 텍스트·미완 펜스를 허용한다.
    let candidate = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidate = candidate.slice(firstBrace, lastBrace + 1);
    } else if (firstBrace >= 0) {
      candidate = candidate.slice(firstBrace);
    }
    let parsed: unknown;
    let partialRecovery = false;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      // 절단 복구(라이브 검증 실측): 상세 도면은 VLM JSON이 토큰 한도(8192)도
      // 넘겨 배열 중간에서 잘린다 — 마지막 완전한 요소까지 자르고 열린 괄호를
      // 닫아 부분 판독을 살린다(0개 폐기 < 부분 살림). 미국 배전 도면 실측.
      parsed = JSON.parse(salvageTruncatedJson(candidate));
      partialRecovery = true;
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('SLD 응답은 객체여야 합니다.');
    const data = parsed as Record<string, unknown>;
    // components만 필수. connections는 없으면 빈 배열로 본다(절단 복구·라이브
    // 검증 실측: 상세 도면은 components 배열 중간에서 잘려 connections 필드가
    // 통째로 없을 수 있는데, 이를 필수로 요구하면 살린 부분 판독마저 폐기됐다).
    if (!Array.isArray(data.components)) {
      throw new Error('SLD components는 배열이어야 합니다.');
    }
    const connectionRows: unknown[] = Array.isArray(data.connections) ? data.connections : [];

    const ids = new Set<string>();
    const components: SLDComponent[] = [];
    /** 계기용 변성기를 전력 변압기로 낸 건수 — 보정 사실을 경고로 남긴다. */
    const instrumentTransformerHits: string[] = [];
    /** 수전점을 부하로 낸 건수 — 보정 사실을 경고로 남긴다. */
    const incomingSourceHits: string[] = [];
    /** 참조 주석을 기기로 낸 건수. */
    const crossReferenceHits: string[] = [];
    /** 피뢰기를 다른 타입으로 낸 건수. */
    const arresterHits: string[] = [];
    for (const row of data.components.slice(0, 2_000)) {
      if (!row || typeof row !== 'object') continue;
      const component = row as Record<string, unknown>;
      const id = boundedText(component.id, 128);
      const type = boundedText(component.type, 64);
      const position = component.position && typeof component.position === 'object'
        ? component.position as Record<string, unknown>
        : undefined;
      const x = finiteNumber(position?.x);
      const y = finiteNumber(position?.y);
      if (!id || ids.has(id) || !type || !SLD_COMPONENT_TYPE_SET.has(type as SLDComponentType) ||
          x == null || y == null || x < 0 || x > 100 || y < 0 || y > 100) continue;
      ids.add(id);
      const properties = stringProperties(component.properties);
      const label = boundedText(component.label, 256) ?? '';
      const quantity = parseMultiplicity(label);
      // 수전점 보정이 먼저다 — `FROM : … INCOMING LINE` 은 참조 주석이 아니라 전원이다.
      const normalizedType = normalizeCrossReference(
        normalizeArrester(
          normalizeIncomingSource(
            normalizeInstrumentTransformer(type as SLDComponentType, label, instrumentTransformerHits),
            label,
            properties ? Object.values(properties).join(' ') : '',
            incomingSourceHits,
          ),
          label,
          arresterHits,
        ),
        label,
        Boolean(component.rating || component.voltage || component.current),
        crossReferenceHits,
      );
      components.push({
        id,
        type: normalizedType,
        position: { x, y },
        ...optionalTextField('label', component.label),
        ...optionalTextField('rating', component.rating),
        ...optionalTextField('voltage', component.voltage),
        ...optionalTextField('current', component.current),
        ...(properties ? { properties } : {}),
        ...(quantity ? { quantity } : {}),
      });
    }

    const connectionIds = new Set<string>();
    const connections: SLDConnection[] = [];
    for (const row of connectionRows.slice(0, 5_000)) {
      if (!row || typeof row !== 'object') continue;
      const connection = row as Record<string, unknown>;
      const id = boundedText(connection.id, 128);
      const from = boundedText(connection.from, 128);
      const to = boundedText(connection.to, 128);
      if (!id || connectionIds.has(id) || !from || !to || from === to || !ids.has(from) || !ids.has(to)) continue;
      connectionIds.add(id);
      const rawLength = boundedText(connection.length, 64);
      const length = rawLength && /^\d+(?:\.\d+)?\s*(?:mm|cm|m|km|ft|in)$/i.test(rawLength)
        ? rawLength
        : undefined;
      connections.push({
        id,
        from,
        to,
        ...optionalTextField('cableType', connection.cableType),
        ...(length ? { length } : {}),
        ...optionalTextField('conductorSize', connection.conductorSize),
      });
    }

    /**
     * 케이블·모선에 적힌 전압은 **절연등급**이지 계통전압이 아니다.
     *
     * 실측 2026-07-27: 저압 배전반 실도면의 모선이 `600V 3Ø4W 60Hz 600A` 인데
     * 실제 계통은 380V 였다(PT 가 380V/190V). 600V 는 절연 등급이다. 이걸
     * 계통전압으로 잡으면 전압강하·단락전류의 기준값이 통째로 어긋난다.
     *
     * 사람도 틀리는 자리다 — 내가 이 도면의 라벨을 만들 때 정확히 이 오독을 했다.
     * 그래서 조용히 넘기지 않고 경고로 남긴다. 값을 지우지는 않는다: 22.9kV
     * 계통처럼 케이블 정격과 계통전압이 실제로 같은 경우가 있어, 같다는 사실만으로
     * 틀렸다고 단정할 수 없다.
     */
    const declaredVoltage = boundedText(data.systemVoltage, 64) ?? '';
    const insulationClassSuspect = declaredVoltage
      && components.some(
        (c) => (c.type === 'cable' || c.type === 'bus')
          && [c.voltage, c.rating].some((v) => v && v.replace(/\s/g, '') === declaredVoltage.replace(/\s/g, '')),
      )
      // PT(계기용 변압기)가 있으면 계통전압의 독립 근거가 따로 있다는 뜻이다.
      && !components.some((c) => c.type === 'meter' && /P\.?T|VT|변성기/i.test(c.label ?? ''));

    const rawConfidence = finiteNumber(data.confidence) ?? 0.5;
    return {
      components,
      connections,
      suggestedCalculations: [],
      ...optionalTextField('systemVoltage', data.systemVoltage),
      ...optionalTextField('systemType', data.systemType),
      confidence: components.length > 0
        ? Math.max(0, Math.min(partialRecovery ? 0.5 : 1, rawConfidence))
        : 0,
      ...(partialRecovery ? { partial: true } : {}),
      ...((partialRecovery || instrumentTransformerHits.length || incomingSourceHits.length || crossReferenceHits.length || arresterHits.length || insulationClassSuspect) ? {
        warnings: [
          ...(partialRecovery ? ['TRUNCATED_MODEL_OUTPUT_PARTIAL_RECOVERY'] : []),
          ...(insulationClassSuspect ? [
            `SYSTEM_VOLTAGE_MAY_BE_INSULATION_CLASS: 계통전압 "${declaredVoltage}" 이(가) 케이블·모선 표기와 같습니다 — 절연등급일 수 있으니 확인하세요`,
          ] : []),
          // 조용히 고치면 모델이 계속 틀린 채로 남고 아무도 모른다.
          ...instrumentTransformerHits.map(
            (label) => `INSTRUMENT_TRANSFORMER_RECLASSIFIED: "${label}" 을(를) transformer → meter 로 보정`,
          ),
          ...incomingSourceHits.map(
            (label) => `INCOMING_SOURCE_RECLASSIFIED: "${label}" 을(를) load → source(수전점) 로 보정`,
          ),
          ...crossReferenceHits.map(
            (label) => `CROSS_REFERENCE_NOTE: "${label}" 은(는) 타 도면 참조 주석이라 기기에서 제외`,
          ),
          ...arresterHits.map(
            (label) => `ARRESTER_RECLASSIFIED: "${label}" 을(를) 피뢰기로 보정`,
          ),
        ],
      } : {}),
      rawDescription: boundedText(data.rawDescription, 2_000) ?? '',
    };
  } catch {
    return {
      components: [],
      connections: [],
      suggestedCalculations: [],
      confidence: 0,
      rawDescription: text.slice(0, 2_000),
    };
  }
}

/**
 * 런타임 검증용 집합. 정본 배열에서 만든다.
 *
 * 전에는 같은 파일 안에서 어휘를 한 번 더 손으로 나열했다. 유니온에만 타입을
 * 더하면 이 가드가 그 타입을 모르고 `continue` 로 조용히 버린다 — 화면에는
 * 그 기기가 아예 없던 것처럼 보인다.
 */
const SLD_COMPONENT_TYPE_SET: ReadonlySet<SLDComponentType> = new Set(SLD_COMPONENT_TYPES);

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalTextField<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  const text = boundedText(value, 256);
  return text ? { [key]: text } as Partial<Record<K, string>> : {};
}

function stringProperties(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .slice(0, 50)
    .flatMap(([key, entryValue]) => {
      const safeKey = boundedText(key, 64);
      const safeValue = boundedText(entryValue, 256);
      return safeKey && safeValue ? [[safeKey, safeValue] as const] : [];
    });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * 추출된 기기·연결에서 "확인이 필요한 계산 항목"을 만든다.
 *
 * 이미지 AI 경로만 이 함수를 부르고 DXF·PDF 벡터 경로는 `[]` 를 하드코딩하고
 * 있었다(실측 2026-07-26: 실도면 4건 전부 제안 0건). 규칙은 기기 종류만 보므로
 * 추출 경로와 무관하다 — 벡터도 같은 것을 써야 한다. 두 벌로 나누면 한쪽만
 * 고쳐지는 일이 반복된다.
 */
/**
 * 도면에서 읽은 값을 그 계산기의 파라미터 이름·단위로 옮긴다.
 *
 * 판독값은 "250A"·"22.9kV" 처럼 단위가 붙은 문자열이라 그대로 넘기면 폼이
 * Number("250A") = NaN 으로 버린다. 이름도 계산기가 쓰는 것과 달랐다 —
 * 실측(2026-07-26): 제안·체인 12개 조합 중 cable-sizing 하나만 이름이 맞았고
 * 나머지는 대부분/전부 무시됐다. 오류가 안 나서 "앱이 못 읽었나" 로만 보인다.
 *
 * 옮기지 못한 값은 넣지 않는다 — 빈 칸이 잘못 채워진 칸보다 낫다.
 */
function measured(
  calculatorId: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const defs = CALCULATOR_PARAMS[calculatorId] ?? [];
  const out: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(values)) {
    if (raw === undefined || raw === null || raw === '') continue;
    const def = defs.find((d) => d.name === name);
    if (!def) continue;
    const value = parseMeasuredValue(def, raw);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

export function generateSuggestions(analysis: Pick<SLDAnalysis, 'components' | 'connections'>): CalcSuggestion[] {
  const suggestions: CalcSuggestion[] = [];
  const { components, connections } = analysis;

  // 변압기가 있으면 단락전류 계산 추천
  const transformers = components.filter(c => c.type === 'transformer');
  for (const tx of transformers) {
    suggestions.push({
      calculatorId: 'short-circuit',
      inputs: measured('short-circuit', {
        transformerCapacity: tx.rating,
        systemVoltage: tx.voltage,
      }),
      reason: `변압기 ${tx.label ?? tx.id} 단락전류 계산`,
      priority: 1,
    });

    suggestions.push({
      calculatorId: 'transformer-capacity',
      // 이 계산기는 **부하**로 필요한 용량을 구한다. 도면의 변압기 명판 용량은
      // 그 입력이 아니라 비교 대상이라 실어 보내지 않는다 — 넣으면 사용자가
      // 준 값처럼 보이면서 정작 폼은 못 읽는다.
      inputs: {},
      reason: `변압기 ${tx.label ?? tx.id} 용량 검증 (도면 명판 ${tx.rating ?? '?'})`,
      priority: 2,
    });
  }

  // 케이블 연결이 있으면 전압강하 계산
  const cablesWithLength = connections.filter(c => c.length);
  for (const cable of cablesWithLength) {
    const fromComp = components.find(c => c.id === cable.from);
    const toComp = components.find(c => c.id === cable.to);

    suggestions.push({
      calculatorId: 'voltage-drop',
      inputs: measured('voltage-drop', {
        length: cable.length,
        cableSize: cable.conductorSize,
        voltage: fromComp?.voltage ?? toComp?.voltage,
        current: toComp?.current,
      }),
      reason: `${fromComp?.label ?? cable.from} → ${toComp?.label ?? cable.to} 전압강하`,
      priority: 1,
    });

    suggestions.push({
      calculatorId: 'cable-sizing',
      inputs: measured('cable-sizing', {
        current: toComp?.current,
        length: cable.length,
        voltage: fromComp?.voltage,
      }),
      reason: `${fromComp?.label ?? cable.from} → ${toComp?.label ?? cable.to} 케이블 사이즈 선정`,
      priority: 2,
    });
  }

  // 차단기 → 보호협조 / 차단기 선정
  const breakers = components.filter(c => c.type === 'breaker');
  for (const brk of breakers) {
    suggestions.push({
      calculatorId: 'breaker-sizing',
      inputs: measured('breaker-sizing', {
        loadCurrent: brk.current ?? brk.rating,
        voltage: brk.voltage,
      }),
      reason: `차단기 ${brk.label ?? brk.id} 선정 검증`,
      priority: 2,
    });
  }

  // 모터 → 모터 기동 계산
  const motors = components.filter(c => c.type === 'motor');
  for (const motor of motors) {
    suggestions.push({
      calculatorId: 'starting-current',
      inputs: measured('starting-current', {
        ratedPower: motor.rating,
        voltage: motor.voltage,
      }),
      reason: `모터 ${motor.label ?? motor.id} 기동전류 계산`,
      priority: 1,
    });
  }

  // 콘덴서 → 역률보상 계산
  const caps = components.filter(c => c.type === 'capacitor');
  if (caps.length > 0) {
    suggestions.push({
      calculatorId: 'reactive-power',
      // 이 계산기의 입력은 유효전력·현재 역률·목표 역률이다. 도면의 콘덴서
      // 용량은 결과와 비교할 값이지 입력이 아니다.
      inputs: {},
      reason: `역률보상 계산 (도면 콘덴서 ${caps[0]?.rating ?? '?'})`,
      priority: 3,
    });
  }

  // 부하 계산
  const loads = components.filter(c => c.type === 'load');
  if (loads.length > 0) {
    suggestions.push({
      calculatorId: 'demand-diversity',
      // 이 계산기는 개별 최대수요 목록(kW)을 받는다. 도면의 정격 표기는 단위가
      // 제각각이라 그대로 목록으로 넘기지 않고, 읽어낸 kW 만 싣는다.
      inputs: {
        individualMaxDemands: loads
          .map((l) => parseMeasuredValue(
            { name: 'value', type: 'number', unit: 'kW', description: '최대수요' },
            l.rating,
          ))
          .filter((v): v is number => v !== undefined)
          .map((value) => ({ value })),
      },
      reason: `${loads.length}개 부하 수용률 계산`,
      priority: 2,
    });
  }

  // 같은 계산기·같은 사유·같은 입력이면 한 줄이다. 같은 라벨의 기기가 두 번
  // 읽히면 사용자에게는 똑같은 줄이 두 개 보이고 건수만 부풀었다(실측
  // 2026-07-26: "확인이 필요한 계산 항목 (3건)" 중 2건이 완전히 같은 줄).
  const seen = new Set<string>();
  const unique = suggestions.filter((s) => {
    const key = `${s.calculatorId}|${s.reason}|${JSON.stringify(s.inputs)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by priority
  return unique.sort((a, b) => a.priority - b.priority);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Calculation Chain Generation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SLD 분석 결과로부터 자동 계산 워크플로우 생성
 * 전력 계통 순서대로 계산 체인 구성:
 * 1. 부하 계산 → 2. 변압기 용량 → 3. 단락전류 → 4. 케이블 사이즈 → 5. 전압강하 → 6. 차단기 선정
 */
export function generateCalcChainFromSLD(analysis: SLDAnalysis): CalcChainStep[] {
  const steps: CalcChainStep[] = [];
  let stepNum = 1;
  // 동적 스텝 번호를 결박한다(버그 사냥 F7 수리): dependsOn을 [2]/[3]으로 하드코딩하면
  // load 단계가 없을 때 스텝 번호가 당겨져 단락전류·케이블 단계가 자기 자신을
  // 참조한다(재현: TR+cable, load 없음 → short-circuit step2 dependsOn[2]). 실제
  // 배정된 번호를 변수로 잡아 참조한다.
  let txStepNum: number | undefined;
  let scStepNum: number | undefined;

  const { components, connections } = analysis;
  const hasTransformers = components.some(c => c.type === 'transformer');
  const hasCables = connections.some(c => c.length);
  const hasMotors = components.some(c => c.type === 'motor');
  const hasLoads = components.some(c => c.type === 'load');

  // Step 1: 부하 계산 (if loads exist)
  if (hasLoads) {
    const loads = components.filter(c => c.type === 'load');
    steps.push({
      step: stepNum++,
      calculatorId: 'max-demand',
      // 항목 스키마는 name·ratedPower(kW)·demandFactor 다. 도면의 정격 표기를
      // kW 로 옮기지 못하면 그 부하는 넣지 않는다.
      inputs: {
        loads: loads
          .map((l) => ({
            name: l.label ?? l.id,
            ratedPower: parseMeasuredValue(
              { name: 'ratedPower', type: 'number', unit: 'kW', description: '정격 용량' },
              l.rating,
            ),
          }))
          .filter((l): l is { name: string; ratedPower: number } => l.ratedPower !== undefined),
      },
      description: '부하 계산 - 총 수전 용량 산정',
    });
  }

  // Step 2: 변압기 용량 검증
  if (hasTransformers) {
    const tx = components.find(c => c.type === 'transformer')!;
    txStepNum = stepNum++;
    steps.push({
      step: txStepNum,
      calculatorId: 'transformer-capacity',
      // 이 계산기는 **부하**로 필요 용량을 구한다. 도면의 변압기 명판 용량은
      // 입력이 아니라 결과와 비교할 값이라 싣지 않는다(사유 문구에 적는다).
      inputs: {},
      dependsOn: hasLoads ? [1] : undefined,
      description: `변압기 용량 검증 (도면 명판 ${tx.rating ?? '?'})`,
    });
  }

  // Step 3: 단락전류 계산
  if (hasTransformers) {
    const tx = components.find(c => c.type === 'transformer')!;
    scStepNum = stepNum++;
    steps.push({
      step: scStepNum,
      calculatorId: 'short-circuit',
      inputs: measured('short-circuit', {
        transformerCapacity: tx.rating,
        systemVoltage: analysis.systemVoltage,
      }),
      dependsOn: txStepNum !== undefined ? [txStepNum] : undefined,
      description: '단락전류 계산 - 차단기 선정 근거',
    });
  }

  // Step 4: 케이블 사이즈 선정
  if (hasCables) {
    const cable = connections.find(c => c.length)!;
    const toComp = components.find(c => c.id === cable.to);
    steps.push({
      step: stepNum++,
      calculatorId: 'cable-sizing',
      inputs: measured('cable-sizing', {
        current: toComp?.current,
        length: cable.length,
        voltage: analysis.systemVoltage,
      }),
      dependsOn: scStepNum !== undefined ? [scStepNum] : undefined,
      description: '케이블 사이즈 선정',
    });
  }

  // Step 5: 전압강하 계산
  if (hasCables) {
    const cable = connections.find(c => c.length)!;
    steps.push({
      step: stepNum++,
      calculatorId: 'voltage-drop',
      inputs: measured('voltage-drop', {
        length: cable.length,
        cableSize: cable.conductorSize,
        voltage: analysis.systemVoltage,
      }),
      dependsOn: [stepNum - 2],
      description: '전압강하 검토',
    });
  }

  // Step 6: 모터 기동 계산
  if (hasMotors) {
    const motor = components.find(c => c.type === 'motor')!;
    steps.push({
      step: stepNum++,
      calculatorId: 'starting-current',
      inputs: measured('starting-current', {
        ratedPower: motor.rating,
        voltage: motor.voltage,
      }),
      description: `모터 기동전류 계산 (${motor.label ?? motor.rating ?? '?'})`,
    });
  }

  return steps;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal — Vision LLM Calls
// ═══════════════════════════════════════════════════════════════════════════════

async function callOpenAIVision(
  base64: string,
  mimeType: string,
  options: SLDAnalysisOptions,
): Promise<string> {
  const model = options.model || 'gpt-5.6-terra';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SLD_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this Single Line Diagram (SLD) and extract all components and connections.' },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' },
            },
          ],
        },
      ],
      max_completion_tokens: 8192,
      ...(model.startsWith('gpt-5') ? {} : { temperature: 0.1 }),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`[ESA-SLD] OpenAI Vision error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callClaudeVision(
  base64: string,
  mimeType: string,
  options: SLDAnalysisOptions,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model || 'claude-sonnet-5',
      // 8192로 상향(라이브 검증 수리): 4000 토큰은 분전반 일람(차단기 30+·연결
      // 다수)의 JSON을 중간에 끊어 파싱 실패→결과 폐기를 유발했다. role-runner와 동일.
      max_tokens: 8192,
      system: SLD_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 },
            },
            {
              type: 'text',
              text: 'Analyze this Single Line Diagram (SLD) and extract all components and connections.',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`[ESA-SLD] Claude Vision error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

async function callGeminiVision(
  base64: string,
  mimeType: string,
  options: SLDAnalysisOptions,
): Promise<string> {
  const model = options.model || 'gemini-3.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': options.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${SLD_SYSTEM_PROMPT}\n\nAnalyze this Single Line Diagram (SLD).` },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`[ESA-SLD] Gemini Vision error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal — Helpers
// ═══════════════════════════════════════════════════════════════════════════════

async function toBase64(imageData: string | Blob): Promise<string> {
  if (typeof imageData === 'string') {
    if (imageData.startsWith('data:')) {
      return imageData.split(',')[1] ?? imageData;
    }
    return imageData;
  }

  const buffer = await imageData.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function detectMimeType(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lG')) return 'image/gif';
  if (base64.startsWith('UklG')) return 'image/webp';
  return 'image/jpeg';
}
