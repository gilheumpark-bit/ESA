// ============================================================
// ESVA Security Hardening — 클라이언트 사이드 보안 강화
// ============================================================
// XSS 방지, 입력 정제, 프로토타입 오염 방지, BYOK 키 마스킹.
// 원본: eh-universe-web/src/lib/web-features/security-hardening.ts

// ============================================================
// PART 1 — External Link Hardening
// ============================================================

/** 외부 링크에 rel="noopener noreferrer" 강제 적용 */
export function hardenExternalLinks(): void {
  if (typeof document === 'undefined') return;
  const observer = new MutationObserver(() => {
    document.querySelectorAll('a[target="_blank"]').forEach(link => {
      if (!link.getAttribute('rel')?.includes('noopener')) {
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/** 개발자 도구 경고 (프로덕션) */
export function devToolsWarning(): void {
  if (typeof console === 'undefined') return;
  if (process.env.NODE_ENV !== 'production') return;
  console.log(
    '%c⚠️ ESVA Security Warning',
    'font-size: 20px; font-weight: bold; color: #ff6b6b;',
  );
  console.log(
    '%cDo not paste any code or commands here. This is a browser feature for developers. If someone asked you to paste something here, it is likely a scam.',
    'font-size: 14px; color: #ffa07a;',
  );
}

// ============================================================
// PART 2 — Input Sanitization
// ============================================================

/** XSS-safe HTML 이스케이프 */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, c => map[c] || c);
}

/** 사용자 입력 정제 (null bytes, 제어 문자, zero-width 제거) */
export function sanitizeInput(input: string): string {
  return input
    .replace(/\0/g, '')                           // null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '') // 제어 문자
    .replace(/[\u200B-\u200D\uFEFF]/g, '')         // zero-width
    .trim();
}

// ============================================================
// PART 3 — Data Integrity
// ============================================================

/** SHA-256 무결성 해시 (localStorage/IndexedDB 변조 감지) */
export async function computeIntegrityHash(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 안전한 JSON 파싱 (prototype pollution 방지) */
export function safeJsonParse<T>(json: string): T | null {
  try {
    const parsed = JSON.parse(json);
    const str = JSON.stringify(parsed);
    if (/__proto__|constructor\s*:|prototype\s*:/i.test(str)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ============================================================
// PART 4 — Validation Helpers
// ============================================================

/** Content-Type 검증 (파일 업로드 시) */
export function isAllowedMimeType(mime: string, allowed: string[]): boolean {
  return allowed.some(a => {
    if (a.endsWith('/*')) return mime.startsWith(a.slice(0, -1));
    return mime === a;
  });
}

/** API 키 마스킹 (BYOK UI 표시용) */
export function maskSecret(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars) return '\u2022'.repeat(value.length);
  return value.slice(0, visibleChars) + '\u2022'.repeat(Math.min(value.length - visibleChars, 20));
}
