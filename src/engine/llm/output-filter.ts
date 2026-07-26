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

// ---------------------------------------------------------------------------
// PART 1 — Detection Patterns
// ---------------------------------------------------------------------------

/**
 * Probabilistic / hedge expressions that are forbidden before numbers.
 * Korean + English + Japanese patterns.
 */
const PROBABILISTIC_PATTERNS = /(?:약|대략|보통|일반적으로|대체로|경험상|대충|대개|통상|통상적으로|roughly|approximately|usually|typically|around|about|generally|normally|on average|大体|およそ|通常|一般的に|概ね)/gi;

/**
 * Number pattern: integers, decimals, percentages, scientific notation.
 * Excludes dates (YYYY-MM-DD), version strings (v1.2.3), and clause refs (232.3.9).
 *
 * \uCC9C\uB2E8\uC704 \uAD6C\uBD84\uC790\uB294 \uD55C \uB369\uC5B4\uB9AC\uB85C \uC77D\uB294\uB2E4. \uC774\uC804\uC5D0\uB294 "55,000 W" \uAC00 "55" \uC640 "000" \uB450
 * \uD1A0\uD070\uC73C\uB85C \uCABC\uAC1C\uC838, \uC55E\uC790\uB9AC\uB294 \uC0AC\uC6A9\uC790 \uC785\uB825\uC774\uB77C \uD1B5\uACFC\uD558\uACE0 \uB4B7\uC790\uB9AC\uB294 \uADFC\uAC70\uAC00 \uC5C6\uB2E4\uBA70
 * \uC9C0\uC6CC\uC84C\uB2E4 \u2014 \uC0AC\uC6A9\uC790\uC5D0\uAC8C\uB294 "55,[\uBBF8\uD655\uC778]" \uC774\uB77C\uB294 \uBB38\uC7A5\uC774 \uB098\uAC14\uB2E4(\uC2E4\uCE21 2026-07-26,
 * \uBAA8\uB378\uC774 55kW \uB97C W \uB85C \uD658\uC0B0\uD55C \uC790\uB9AC). \uC27C\uD45C\uB294 \uC790\uB9BF\uC218 \uD45C\uAE30\uC9C0 \uAC12\uC758 \uACBD\uACC4\uAC00 \uC544\uB2C8\uB2E4.
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
 * Find all source tag positions in the output.
 */
function findSourcePositions(output: string): Set<number> {
  const positions = new Set<number>();
  let match: RegExpExecArray | null;

  SOURCE_TAG_PATTERN.lastIndex = 0;
  while ((match = SOURCE_TAG_PATTERN.exec(output)) !== null) {
    positions.add(match.index);
  }

  return positions;
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
): FilterResult {
  const blocked: BlockedItem[] = [];
  const hasAnyToolCalls = toolCalls.length > 0;

  // Step 1: Find all source tag positions
  const sourcePositions = findSourcePositions(output);

  // Step 2: Extract and check all numbers
  const numbers = extractNumbers(output, sourcePositions, findTrustedNumbers(trustedInput));

  for (const num of numbers) {
    if (num.isAllowed || num.isTrustedInput) continue;

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

    if (!hasLookup && !hasSourceTag) {
      blocked.push({
        text: stdMatch[0],
        reason: 'direct_citation',
        position: pos,
      });
    }
  }

  // Step 5: Build filtered output
  if (blocked.length === 0) {
    return { original: output, filtered: output, blocked: [], passed: true };
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
 * trustedInput 을 받는 이유: 이 인자가 없던 동안 isClean() 이 filterLLMOutput()
 * 보다 엄격했다. 사용자가 질문에 적어 넣은 수치를 그대로 인용한 답을
 * filterLLMOutput() 은 통과시키는데 isClean() 은 거부해, 같은 출력에 두 함수가
 * 다른 판정을 냈다. 현재 프로덕션 호출처는 0 이라 실피해는 없었지만(engine/index
 * 재수출과 테스트뿐) 배선되는 순간 발화할 함정이라 계약을 맞춰 둔다.
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
