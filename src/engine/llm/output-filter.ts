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
 * Excludes dates (YYYY-MM-DD), version strings (v1.2.3), and clause refs (232.51).
 */
const NUMBER_PATTERN = /(?<!\d{4}-\d{2}-)(?<!\d\.)(?<![vV]\d+\.)(?<!\w)(\d+(?:\.\d+)?)\s*(%|[A-Za-z\u03A9]+(?:\/[A-Za-z]+)?)?/g;

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
 *   - Clause references (232.51 after KEC/NEC/etc.)
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
}

/**
 * Extract all numbers from output and check if each has a source.
 */
function extractNumbers(
  output: string,
  sourcePositions: Set<number>,
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
    const isAllowed = ALLOWED_NUMBER_CONTEXTS.some(re => re.test(prefix));

    // Check if a source tag exists within 200 chars after this number
    let hasSource = false;
    for (const sPos of sourcePositions) {
      if (sPos >= pos && sPos <= pos + 200) {
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
    });
  }

  return results;
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
export function filterLLMOutput(
  output: string,
  toolCalls: Array<{ name: string; result?: unknown }> = [],
): FilterResult {
  const blocked: BlockedItem[] = [];
  const hasAnyToolCalls = toolCalls.length > 0;

  // Step 1: Find all source tag positions
  const sourcePositions = findSourcePositions(output);

  // Step 2: Extract and check all numbers
  const numbers = extractNumbers(output, sourcePositions);

  for (const num of numbers) {
    if (num.isAllowed) continue;

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

    // Check if a number follows within 40 characters
    const numAfter = /\d+(?:\.\d+)?/.exec(afterText.slice(probMatch[0].length));
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

  // Sort blocked items by position (descending) for safe removal
  const sortedBlocked = [...blocked].sort((a, b) => b.position - a.position);

  let filtered = output;
  for (const item of sortedBlocked) {
    const before = filtered.slice(0, item.position);
    const after = filtered.slice(item.position + item.text.length);

    // Replace with a warning marker
    const marker = item.reason === 'probabilistic'
      ? '[BLOCKED: 확률적 표현 금지 / Probabilistic expression blocked]'
      : item.reason === 'no_source'
        ? '[BLOCKED: 출처 없는 수치 / Unsourced number blocked]'
        : item.reason === 'direct_citation'
          ? '[BLOCKED: DB 조회 필요 / DB lookup required]'
          : '[BLOCKED: Tool 호출 필요 / Tool call required]';

    filtered = before + marker + after;
  }

  return {
    original: output,
    filtered,
    blocked,
    passed: false,
  };
}

// ---------------------------------------------------------------------------
// PART 4 — Quick Check
// ---------------------------------------------------------------------------

/**
 * Quick check whether an LLM output would pass the filter.
 * Cheaper than full filterLLMOutput() — no replacement step.
 */
export function isClean(
  output: string,
  toolCalls: Array<{ name: string; result?: unknown }> = [],
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
    const numbers = extractNumbers(output, new Set());
    // Filter out small ordinal integers
    const suspiciousNumbers = numbers.filter(n => !n.isAllowed);
    if (suspiciousNumbers.length > 0) {
      return false;
    }
  }

  return true;
}
