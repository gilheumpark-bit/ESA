/**
 * Lightweight request safety — prompt-injection / abuse patterns only.
 * Domain "wrong answer" is handled by SJC + engines, not keyword blocks here.
 */

export interface SafetyBlockResult {
  blocked: true;
  code: 'ESVA-3020';
  message: string;
}

export interface SafetyOk {
  blocked: false;
}

/** Common jailbreak / instruction-override phrases (EN + KO). */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|system)/i,
  /disregard\s+(the\s+)?(above|previous)/i,
  /you\s+are\s+now\s+(a|an|in)\s+/i,
  /system\s*[\[\(]?\s*override/i,
  /\[?\s*system\s*\]?\s*:?/i,
  /forget\s+(everything|all)\s+(above|before)/i,
  /위\s*지시(?:사항)?\s*(?:를|을)?\s*(?:무시|잊)/,
  /이전\s*(?:지시|명령)\s*(?:는|을)\s*무시/,
];

/**
 * Returns blocked if the user text matches a high-confidence injection pattern.
 */
export function checkPromptInjectionSafety(text: string): SafetyOk | SafetyBlockResult {
  const t = text.trim();
  if (!t) return { blocked: false };

  for (const re of INJECTION_PATTERNS) {
    if (re.test(t)) {
      return {
        blocked: true,
        code: 'ESVA-3020',
        message: 'This request was blocked by automated safety rules.',
      };
    }
  }

  return { blocked: false };
}
