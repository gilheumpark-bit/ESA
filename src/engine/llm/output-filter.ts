/**
 * LLM Output Post-Processing Filter
 *
 * "Tool 없이 수치를 말하면 시스템이 차단합니다."
 *
 * Scans LLM output and blocks:
 *   1. Numbers without source tags (not from tool call results)
 *   2. Probabilistic expressions paired with numbers
 *   3. Unsourced standard citations
 *   4. Direct citations without DB lookup
 *
 * PART 1: Regex patterns
 * PART 2: Number extraction and source matching
 * PART 3: filterLLMOutput() main function
 * PART 4: isClean() quick check
 */

import type { FilterResult, BlockedItem } from './types';
import { findAssertedSource, findContradiction } from './app-asserted-constants';

// ---------------------------------------------------------------------------
// PART 1 — Detection Patterns
// ---------------------------------------------------------------------------

/**
 * Probabilistic / hedge expressions that are forbidden before numbers.
 * Korean + English + Japanese patterns.
 */
/**
 * `약` 은 **낱말 안에서 발화하면 안 된다.**
 *
 * 무경계로 두면 `계약전력 100kW` 가 `계[미확인]` 이 된다 — 앞 음절부터
 * 통째로 지워져 문장이 깨진다. 수전설비 앱에서 `계약전력` 은 최빈 용어이고,
 * `절약`·`예약`·`요약`·`제약`·`규약` 도 같은 자리를 밟는다.
 *
 * 한국어에는 단어 경계(`\b`)가 없으므로 **앞 글자가 한글이면 접미가 아니다**
 * 로 판별한다. `약 100kW`(추정)는 계속 잡히고 `계약전력`은 통과한다.
 * 나머지 어휘는 그 자체로 두 글자 이상이라 이 문제가 없다.
 */
const PROBABILISTIC_PATTERNS = /(?:(?<![가-힣])약(?=\s*[\d.]|\s)|대략|보통|일반적으로|대체로|경험상|대충|대개|통상|통상적으로|roughly|approximately|usually|typically|around|about|generally|normally|on average|大体|およそ|通常|一般的に|概ね)/gi;

/**
 * Number pattern: integers, decimals, percentages, scientific notation.
 * Excludes dates (YYYY-MM-DD), version strings (v1.2.3), and clause refs (232.3.9).
 *
 * 천단위 쉼표는 한 덩어리로 읽는다 — 쉼표는 자릿수 표기지 값의 경계가
 * 아니다. 쪼개면 "55,000 W" 가 "55,[미확인]" 으로 나간다.
 */
const NUMBER_PATTERN = /(?<!\d{4}-\d{2}-)(?<!\d\.)(?<![vV]\d+\.)(?<!\w)(?<![\d,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(%|[A-Za-z\u03A9]+(?:\/[A-Za-z]+)?)?/g;

/**
 * Source tag pattern: [SOURCE: ...] that the tool system injects.
 */
const SOURCE_TAG_PATTERN = /\[SOURCE:\s*([^\]]+)\]/g;

/**
 * Standard citation pattern: mentions of KEC, NEC, IEC, etc. with clause numbers.
 */
const STANDARD_CITATION_PATTERN = /\b(KEC|NEC|IEC|JIS|GB|VDE|AS\/NZS|KEPIC|IEEE|NFPA)\s+(?:\d{2,6}(?:\.\d+)*(?:-\d+)?)/gi;

/**
 * Allowed number contexts — numbers in these contexts are NOT blocked:
 *   - Inside source tags [SOURCE: ...]
 *   - Inside tool result markers [RESULT: ...]
 *   - Dates (2021, 2023 etc. when preceded by standard name)
 *   - Version strings (v0.1.0)
 *   - Clause references (232.3.9 after KEC/NEC/etc.)
 *   - Step ordinals (Step 1, Step 2, ...)
 */
const ALLOWED_NUMBER_CONTEXTS = [
  /\[SOURCE:[^\]]*$/,    // inside a SOURCE tag
  /\[RESULT:[^\]]*$/,    // inside a RESULT tag
  /\b(?:KEC|NEC|IEC|JIS|GB|VDE|NFPA|IEEE|AS\/NZS)\s*$/i,  // standard edition year
  /[vV]$/,                // version prefix
  /Step\s*$/i,            // step ordinals
  /단계\s*$/,             // Korean "step"
  /第\s*$/,               // Japanese ordinal prefix
  /(?:표|Table|表)\s*$/i, // table references
];

// ---------------------------------------------------------------------------
// PART 2 — Number Extraction & Source Matching
// ---------------------------------------------------------------------------

interface ExtractedNumber {
  /** The numeric string */
  text: string;
  /** Position in the output */
  position: number;
  /** The unit if detected */
  unit?: string;
  /** Whether this number has a source tag nearby */
  hasSource: boolean;
  /** Whether this number appears in an allowed context */
  isAllowed: boolean;
  /** Whether the value is copied from the user's trusted input. */
  isTrustedInput: boolean;
}

/**
 * Extract all numbers from output and check if each has a source.
 */
function extractNumbers(
  output: string,
  sourcePositions: Set<number>,
  trustedNumbers: Set<string> = new Set(),
): ExtractedNumber[] {
  const results: ExtractedNumber[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  NUMBER_PATTERN.lastIndex = 0;

  while ((match = NUMBER_PATTERN.exec(output)) !== null) {
    const pos = match.index;
    const numText = match[1];
    const unit = match[2];

    // Check if in an allowed context
    const prefix = output.slice(Math.max(0, pos - 40), pos);
    // 서기 연도는 공학 수치가 아니라 달력 참조다. 판별자가 수치 앞이 아니라
    // 뒤("년")에 있어서 prefix 규칙만으로는 잡히지 않는다 — "KEC 2021"은 표준명이
    // 앞서 통과하지만 "2021년 개정"은 통과하지 못해 정당한 연도가 [BLOCKED]로
    // 답을 훼손했다. 4자리 서기 연도 + "년"만 예외로 둔다. "수명 5년"·"30분"
    // 같은 수량은 그대로 출처를 요구한다.
    const isCalendarYear = /^(?:19|20)\d\d$/.test(numText)
      && /^\s*년/.test(output.slice(pos + numText.length, pos + numText.length + 3));
    const isAllowed = isCalendarYear || ALLOWED_NUMBER_CONTEXTS.some(re => re.test(prefix));

    // 출처 태그는 수치 앞뒤 어디에 와도 그 수치의 출처다. 프로덕션 프롬프트는
    // 수치 뒤에 붙이라고 지시하지만(lib/chat-calculation-evidence.ts) 모델이 순서를
    // 뒤집으면 정당한 출처가 무시돼 옳은 답이 [BLOCKED]로 훼손된다. 같은 파일의
    // 표준 인용 검사는 이미 양방향(Math.abs ≤ 150)이라 한 파일 안에서 규칙이
    // 갈려 있었다. 방향만 맞추고 창 크기는 유지한다 — 무출처 수치는 계속 차단된다.
    let hasSource = false;
    for (const sPos of sourcePositions) {
      if (Math.abs(sPos - pos) <= 200) {
        hasSource = true;
        break;
      }
    }

    // Skip pure integers 0-10 without units (ordinals, list items)
    const numVal = parseFloat(numText);
    if (Number.isInteger(numVal) && numVal <= 10 && !unit) {
      continue;
    }

    results.push({
      text: match[0],
      position: pos,
      unit,
      hasSource,
      isAllowed,
      isTrustedInput: trustedNumbers.has(normalizeNumericToken(match[0]))
        || trustedNumbers.has(match[1].replace(/,/g, '')),
    });
  }

  return results;
}

function normalizeNumericToken(value: string): string {
  // 쉼표는 자릿수 표기다 — 신뢰 목록 대조에서 "55,000" 과 "55000" 은 같은 값이다.
  return value.replace(/\s+/g, '').replace(/,/g, '').toLowerCase();
}

/**
 * 사용자가 질문에 적어 넣은 조항 표기.
 *
 * 질문의 조항을 되받는 것은 근거 주장이 아니라 **대상 지칭**이다. 이 예외가
 * 없으면 "문의하신 [미확인] 조항은…" 처럼 무엇을 묻는지가 지워진다. 모델이
 * *다른* 조항을 근거로 끌어오는 것은 여전히 막힌다 — 질문에 없으면 여기 없다.
 */
function findTrustedCitations(input: string): Set<string> {
  const found = new Set<string>();
  const pattern = new RegExp(STANDARD_CITATION_PATTERN.source, STANDARD_CITATION_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    found.add(match[0].replace(/\s+/g, ' ').trim().toUpperCase());
  }
  return found;
}

function findTrustedNumbers(input: string): Set<string> {
  const numbers = new Set<string>();
  const pattern = new RegExp(NUMBER_PATTERN.source, NUMBER_PATTERN.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    numbers.add(normalizeNumericToken(match[0]));
    numbers.add(match[1].replace(/,/g, ''));
  }
  return numbers;
}

/**
 * `[SOURCE: ...]` 태그 위치.
 *
 * **이 태그는 모델이 쓴 글자다** — 라우트는 `toolCalls` 로 빈 배열을 넘기고,
 * 태그는 모델 출력 안의 텍스트다. 즉 태그를 적는 것만으로 제 숫자에 근거를
 * 붙일 수 있다.
 *
 * **계산기 태그는 근접 승인을 하지 않는다.** 계산기가 실제로 낸 값은
 * `trustedInput`(= `calculationEvidence.trustedText`)에 있고 값이 정확히
 * 일치할 때 이미 통과하므로, 근접 창이 덮는 것은 계산기가 내지 않은 수치뿐이다.
 * 비용: 모델이 9.93 을 "약 10" 으로 반올림해 쓰면 막힌다 — 10 은 계산기가
 * 말한 값이 아니므로 그게 맞다.
 *
 * **남은 구멍**: 계산기가 아닌 payload(`KEC_TABLE …`)는 여전히 ±200 자 근접
 * 승인이 된다. 모델이 표 번호를 지어낼 수 있는데, 값에 결박할 대상이 없어
 * (표 조회 결과가 응답 경로에 없다) 지금은 못 닫는다.
 */
function findSourcePositions(output: string, attestedSources?: ReadonlySet<string>): Set<number> {
  const positions = new Set<number>();
  let match: RegExpExecArray | null;

  SOURCE_TAG_PATTERN.lastIndex = 0;
  while ((match = SOURCE_TAG_PATTERN.exec(output)) !== null) {
    const payload = (match[1] ?? '').trim();
    // 계산기를 댄 태그는 **근접만으로 근거가 되지 않는다** — 아래 참조.
    if (namesCalculator(payload)) continue;
    positions.add(match.index);
  }

  void attestedSources; // 대조는 `findForgedCalculatorTags` 가 한다.
  return positions;
}

/** 계산기를 근거로 댄 태그인가 — 대소문자·id 유무와 무관하게 잡는다. */
function namesCalculator(payload: string): boolean {
  return /ESA_CALCULATOR/i.test(payload);
}

/**
 * 모델이 **돌지 않은 계산기**를 근거로 댄 자리들.
 *
 * 근접 승인을 없앤 뒤에도 이 대조가 필요한 이유: 출처를 지어내는 것 자체가
 * 신호다. 수치는 어차피 막히지만, 없는 근거를 만들어 내는 답변은 사용자에게
 * 그대로 나가면 안 되고 로그에도 남아야 한다.
 */
function findForgedCalculatorTags(
  output: string,
  attestedSources?: ReadonlySet<string>,
): Array<{ index: number; payload: string }> {
  if (!attestedSources) return [];
  const found: Array<{ index: number; payload: string }> = [];
  let match: RegExpExecArray | null;
  SOURCE_TAG_PATTERN.lastIndex = 0;
  while ((match = SOURCE_TAG_PATTERN.exec(output)) !== null) {
    const payload = (match[1] ?? '').trim();
    if (!namesCalculator(payload)) continue;
    const id = /ESA_CALCULATOR\s*:\s*([A-Za-z0-9_-]+)/i.exec(payload)?.[1];
    // id 를 안 밝힌 태그도 위조로 본다 — 어느 계산기인지 대조할 수 없다.
    if (!id || !attestedSources.has(id)) found.push({ index: match.index, payload });
  }
  return found;
}

// ---------------------------------------------------------------------------
// PART 3 — Main Filter Function
// ---------------------------------------------------------------------------

/**
 * Filter LLM output to remove unsourced numbers and probabilistic claims.
 *
 * @param output - Raw LLM output string
 * @param toolCalls - Array of tool call records from the conversation
 * @returns FilterResult with original, filtered output, and blocked items
 */
/**
 * 지운 자리에 남기는 표시. 짧아야 문장이 읽힌다 — 자세한 사유는 답변 끝에
 * 한 번만 붙인다.
 */
const UNVERIFIED = '[미확인]';

const MARKERS: Record<BlockedItem['reason'], string> = {
  probabilistic: UNVERIFIED,
  no_source: UNVERIFIED,
  direct_citation: UNVERIFIED,
  no_tool_call: UNVERIFIED,
  insufficient_data: UNVERIFIED,
};

const REASON_NOTES: Record<BlockedItem['reason'], string> = {
  probabilistic: '추정 표현',
  no_source: '출처 없음',
  direct_citation: '기준 원문 조회 필요',
  no_tool_call: '계산기 미실행',
  insufficient_data: '입력 부족',
};

export function filterLLMOutput(
  output: string,
  toolCalls: Array<{ name: string; result?: unknown }> = [],
  trustedInput = '',
  /** 실제로 돌아서 통과한 계산기 id — 주면 모델이 쓴 근거 태그를 대조한다. */
  attestedSources?: ReadonlySet<string>,
): FilterResult {
  const blocked: BlockedItem[] = [];
  const hasAnyToolCalls = toolCalls.length > 0;

  // Step 1: Find all source tag positions
  const sourcePositions = findSourcePositions(output, attestedSources);

  // Step 2: Extract and check all numbers
  const numbers = extractNumbers(output, sourcePositions, findTrustedNumbers(trustedInput));
  const trustedCitations = findTrustedCitations(trustedInput);

  /**
   * 앱이 이미 근거와 함께 내보내는 값은 그 근거를 붙여 남긴다. 통과 조건은
   * 값·단위 정확 일치 + 대상 용어 근접이다(`app-asserted-constants.ts`).
   */
  const assertedNotes = new Map<number, string>();
  /** 아는 값과 어긋난 자리 — 답변 끝에 정정을 붙인다. */
  const contradictionNotes = new Map<number, string>();

  for (const num of numbers) {
    if (num.isAllowed) continue;

    const nearby = output.slice(Math.max(0, num.position - 60), num.position + 60);

    /**
     * **아는 값과 다르면 막는다 — 누가 적었든.**
     *
     * `isTrustedInput` 보다 **먼저** 본다. 사용자가 질문에 적은 숫자는 신뢰
     * 입력이 되어 무검사로 통과하는데, 그게 유도 질문의 통로였다:
     * `"154kV 접근 한계거리 1.6m 맞죠?"` → 모델의 동의가 그대로 나간다.
     * 앱 체크리스트는 같은 값을 1.7m 라고 말한다.
     *
     * 우리가 정답을 들고 있는 자리에서만 발화한다(등재된 대상·단위).
     */
    const contradiction = findContradiction(
      num.text.replace(/[^\d.,]/g, ''),
      num.unit ?? '',
      nearby,
      // 전압 같은 식별자는 답변 어딘가에 한 번만 적힌다 — 전체를 준다.
      output,
    );
    if (contradiction) {
      blocked.push({
        text: num.text,
        reason: 'no_source',
        position: num.position,
      });
      contradictionNotes.set(
        num.position,
        `${contradiction.expected}(${contradiction.source})`,
      );
      continue;
    }

    if (num.isTrustedInput) continue;

    if (!num.hasSource) {
      // 숫자 앞뒤를 함께 본다 — 용어가 앞에 오기도("산소 18%"), 뒤에 오기도 한다.
      const asserted = findAssertedSource(
        num.text.replace(/[^\d.,]/g, ''),
        num.unit ?? '',
        nearby,
        // 식별자(전압·등급)는 답변 어딘가에 한 번만 적힌다 — 전체를 준다.
        output,
      );
      if (asserted) {
        assertedNotes.set(num.position, asserted);
        continue;
      }
    }

    if (!num.hasSource && !hasAnyToolCalls) {
      // No tool calls at all — any number is suspicious
      blocked.push({
        text: num.text,
        reason: 'no_tool_call',
        position: num.position,
      });
    } else if (!num.hasSource) {
      // Tool calls exist but this number has no source
      blocked.push({
        text: num.text,
        reason: 'no_source',
        position: num.position,
      });
    }
  }

  // Step 3: Detect probabilistic expressions paired with numbers
  PROBABILISTIC_PATTERNS.lastIndex = 0;
  let probMatch: RegExpExecArray | null;

  while ((probMatch = PROBABILISTIC_PATTERNS.exec(output)) !== null) {
    const pos = probMatch.index;
    const afterText = output.slice(pos, pos + 80);

    // Check whether a measured/quantified value follows nearby. Bare integers
    // such as a subsequent "1. 원본 확인" checklist item are structure, not a
    // probabilistic engineering claim, and must not corrupt the answer.
    const numericWindow = afterText.slice(probMatch[0].length, probMatch[0].length + 40);
    const numAfter = /\d+(?:\.\d+)?\s*(?:%|[A-Za-z\u03A9]+(?:\/[A-Za-z]+)?|개|명|회|배|년|개월|시간|분)/.exec(numericWindow);
    if (numAfter) {
      blocked.push({
        text: afterText.slice(0, probMatch[0].length + numAfter.index! + numAfter[0].length),
        reason: 'probabilistic',
        position: pos,
      });
    }
  }

  // Step 4: Detect unsourced standard citations
  STANDARD_CITATION_PATTERN.lastIndex = 0;
  let stdMatch: RegExpExecArray | null;

  while ((stdMatch = STANDARD_CITATION_PATTERN.exec(output)) !== null) {
    const pos = stdMatch.index;

    // Check if a lookup_code_article tool call was made
    const hasLookup = toolCalls.some(tc => tc.name === 'lookup_code_article');

    // Check if this citation has a source tag nearby
    let hasSourceTag = false;
    for (const sPos of sourcePositions) {
      if (Math.abs(sPos - pos) <= 150) {
        hasSourceTag = true;
        break;
      }
    }

    // 질문에 있던 조항을 되받는 것은 대상 지칭이지 근거 주장이 아니다.
    const isTrustedCitation = trustedCitations.has(stdMatch[0].replace(/\s+/g, ' ').trim().toUpperCase());

    if (!hasLookup && !hasSourceTag && !isTrustedCitation) {
      blocked.push({
        text: stdMatch[0],
        reason: 'direct_citation',
        position: pos,
      });
    }
  }

  /**
   * Step 5: 돌지 않은 계산기를 근거로 댄 태그.
   *
   * 근접 승인을 없앤 뒤에도 이걸 따로 잡는다 — **출처를 지어내는 것 자체가
   * 신호**다. 수치는 어차피 막히지만, 없는 근거를 만들어 내는 답변을 그대로
   * 내보내면 사용자는 그 태그를 읽고 믿는다. 로그에도 남아야 한다.
   */
  for (const forged of findForgedCalculatorTags(output, attestedSources)) {
    blocked.push({
      text: `[SOURCE: ${forged.payload}]`,
      reason: 'no_tool_call',
      position: forged.index,
    });
  }

  /**
   * 앱 근거로 남긴 값의 출처를 답변 끝에 한 번 모아 붙인다.
   *
   * **조용히 통과시키지 않는다** — 필터의 목적은 "근거 없는 수치 제거"이지
   * "일부 수치 면제"가 아니다. 남겼으면 근거를 보여야 그 목적이 유지된다.
   */
  const assertedFooter = assertedNotes.size > 0
    ? `${'\n'}${'\n'}> 위 수치 중 다음은 앱이 근거와 함께 쓰는 값입니다 — ${[...new Set(assertedNotes.values())].join(' · ')}.`
    : '';

  /**
   * **정정을 함께 낸다.** 지우기만 하면 사용자는 무엇이 맞는지 모른 채
   * 자기가 적은 값을 그대로 믿는다 — 유도 질문을 막는 목적이 그때 사라진다.
   */
  const correctionFooter = contradictionNotes.size > 0
    ? `

> 지운 수치가 앱이 아는 값과 달랐습니다. 앱 기준 — ${[...new Set(contradictionNotes.values())].join(' · ')}.`
    : '';

  // Step 5: Build filtered output
  if (blocked.length === 0) {
    const passedOutput = output + assertedFooter + correctionFooter;
    return { original: output, filtered: passedOutput, blocked: [], passed: true };
  }

  // Collapse overlapping findings before replacement. A probabilistic phrase
  // such as "약 32A" otherwise produces two markers whose offsets corrupt
  // each other after the first replacement.
  const nonOverlapping = [...blocked]
    .sort((a, b) => a.position - b.position || b.text.length - a.text.length)
    .filter((item, index, items) => !items.slice(0, index).some((kept) => {
      const keptEnd = kept.position + kept.text.length;
      const itemEnd = item.position + item.text.length;
      return kept.position < itemEnd && item.position < keptEnd;
    }));

  // Sort by position (descending) for safe removal.
  const sortedBlocked = [...nonOverlapping].sort((a, b) => b.position - a.position);

  let filtered = output;
  for (const item of sortedBlocked) {
    const before = filtered.slice(0, item.position);
    const after = filtered.slice(item.position + item.text.length);

    filtered = before + MARKERS[item.reason] + after;
  }

  // 제거 사유는 문장 안이 아니라 끝에 한 번만 적는다.
  //
  // 이전에는 자리마다 "[BLOCKED: Tool 호출 필요 / Tool call required]" 를 끼워
  // 넣었다. 값을 지우는 것은 옳지만(영수증 없는 수치는 나가면 안 된다) 그 결과가
  // "합성 최대수요전력은 **[BLOCKED: Tool 호출 필요 / Tool call required]**입니다"
  // 처럼 읽을 수 없는 문장이 됐다(실측 2026-07-25/26). 필터는 제 일을 했는데
  // 사용자에게는 앱이 고장 난 것으로 보인다.
  const reasons = [...new Set(sortedBlocked.map((item) => REASON_NOTES[item.reason]))];
  // 안내문에는 마커 리터럴을 넣지 않는다 — 넣으면 본문의 표시와 구분되지 않는다.
  filtered += `

> 위에서 **미확인**으로 표시된 값은 근거가 없어 앱이 제거한 것입니다 (${reasons.join(', ')}). 정확한 값은 해당 계산기나 기준 원문에서 확인하세요.`;
  filtered += assertedFooter + correctionFooter;

  return {
    original: output,
    filtered,
    blocked: nonOverlapping,
    passed: false,
  };
}

// ---------------------------------------------------------------------------
// PART 4 — Quick Check
// ---------------------------------------------------------------------------

/**
 * INSUFFICIENT_DATA 마커 삽입 — confidence 부족 시 즉시 차단.
 *
 * 계산기 결과에서 confidence < 0.7이면 결과를 차단하고
 * 명시적 "데이터 부족" 메시지로 대체한다.
 * "추정 금지 규칙"의 최종 방어선.
 */
export function applyConfidenceGate(
  output: string,
  confidence?: number,
): FilterResult {
  if (confidence !== undefined && confidence < 0.7) {
    const marker = `[INSUFFICIENT DATA: 확신도 ${(confidence * 100).toFixed(0)}% — 데이터 부족으로 정확한 계산 불가. 추가 파라미터 입력 또는 PE 검토 필요.]`;
    return {
      original: output,
      filtered: marker,
      blocked: [{
        text: output.slice(0, 100),
        position: 0,
        reason: 'insufficient_data',
      }],
      passed: false,
    };
  }

  return {
    original: output,
    filtered: output,
    blocked: [],
    passed: true,
  };
}

/**
 * Quick check whether an LLM output would pass the filter.
 * Cheaper than full filterLLMOutput() — no replacement step.
 *
 * `trustedInput` 은 생략하지 말 것 — 빼면 `filterLLMOutput()` 보다 엄격해져
 * 같은 출력에 두 함수가 다른 판정을 낸다. (현재 프로덕션 호출처 0)
 */
export function isClean(
  output: string,
  toolCalls: Array<{ name: string; result?: unknown }> = [],
  trustedInput = '',
): boolean {
  // Quick probabilistic check
  PROBABILISTIC_PATTERNS.lastIndex = 0;
  let probMatch: RegExpExecArray | null;
  while ((probMatch = PROBABILISTIC_PATTERNS.exec(output)) !== null) {
    const afterText = output.slice(probMatch.index + probMatch[0].length, probMatch.index + 80);
    if (/\d+(?:\.\d+)?/.test(afterText)) {
      return false;
    }
  }

  // Quick unsourced number check
  if (toolCalls.length === 0) {
    NUMBER_PATTERN.lastIndex = 0;
    const numbers = extractNumbers(output, new Set(), findTrustedNumbers(trustedInput));
    // Filter out small ordinal integers
    const suspiciousNumbers = numbers.filter(n => !n.isAllowed && !n.isTrustedInput);
    if (suspiciousNumbers.length > 0) {
      return false;
    }
  }

  return true;
}
