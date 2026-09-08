/** Copy only after a user action; manual fallback is not a successful copy. */
export async function copyTextWithFallback(text: string, label = '복사할 내용:'): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denial and missing secure-context support both have a manual path.
  }
  if (typeof window !== 'undefined') {
    try { window.prompt(label, text); } catch { /* A sandbox can also deny dialogs. */ }
  }
  return false;
}
