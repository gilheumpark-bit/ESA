/** Only a normal internal route or credential-free HTTP(S) destination is clickable. */
export function safeFeatureLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4096 || /[\\\u0000-\u0020\u007f]/.test(value)) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
export function featureCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const protectedText = /^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replace(/"/g, '""')}"`;
}
export function featureCsv(headers: string[], rows: unknown[][]): string {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(featureCsvCell).join(',')).join('\r\n') + '\r\n';
}
