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
  // === English patterns ===
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|system)/i,
  /disregard\s+(the\s+)?(above|previous)/i,
  /you\s+are\s+now\s+(a|an|in|DAN)\b/i,
  /system\s*[\[\(]?\s*override/i,
  /forget\s+(everything|all)\s+(above|before)/i,
  /(?:print|show|reveal|output)\s+(?:your\s+)?(?:system\s*prompt|instructions|full\s*prompt)/i,
  /(?:enter|enable)\s+(?:developer|debug|admin)\s+mode/i,
  /disable\s+(?:all\s+)?(?:content\s*)?(?:filter|safety|guard)/i,
  /(?:act\s+as|pretend\s+to\s+be|simulate)\s+(?:an?\s+)?(?:unrestricted|unfiltered)/i,
  /do\s+anything\s+now/i,
  /repeat\s+everything\s+above/i,
  /(?:from\s+now\s+on|henceforth)\s+you\s+(?:are|have)\s+(?:an?\s+)?(?:no\s+)?(?:unrestricted|unfiltered|safety|restrict|filter)/i,
  // === Korean patterns ===
  /위\s*지시(?:사항)?\s*(?:를|을)?\s*(?:무시|잊)/,
  /이전\s*(?:지시|명령)\s*(?:는|을)\s*(?:모두\s*)?무시/,
  /시스템\s*프롬프트\s*(?:를|을)?\s*(?:보여|출력|공개)/,
  /(?:개발자|관리자)\s*모드\s*(?:진입|활성)/,
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
