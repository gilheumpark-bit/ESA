/** Measured tokens preserve sign, exponent and unit; bare magnitude is never evidence. */
export const QUANTITY_PATTERN = /(?<![A-Za-z0-9_.,])([+\-−]?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:[eE][+\-]?\d+)?)[ \t]*(%|℃|℉|°\s*[CF]|킬로미터|밀리미터|센티미터|미터|암페어|볼트|와트|퍼센트|개월|시간|분|초|년|개|명|회|배|상|도|[A-Za-zΩμµ]+(?:[²³23])?(?:\/[A-Za-zΩμµ]+(?:[²³23])?)?)?/g;

const aliases: Readonly<Record<string, string>> = {
  미터: 'm', 밀리미터: 'mm', 센티미터: 'cm', 킬로미터: 'km',
  암페어: 'A', 볼트: 'V', 와트: 'W', 퍼센트: '%',
  '°C': '℃', '°F': '℉', '㎟': 'mm2', 'mm²': 'mm2', 'm²': 'm2', 'm³': 'm3',
};
export function canonicalUnit(unit = ''): string {
  const compact = unit.replace(/\s+/g, '');
  // SI prefix case is significant: mA and MA must not collapse.
  return aliases[compact] ?? compact;
}

/** Exact decimal normalization, without IEEE-754 rounding or materializing a huge exponent. */
export function canonicalMagnitude(raw: string): string | null {
  const match = /^([+\-]?)(\d*)(?:\.(\d*))?(?:e([+\-]?\d+))?$/i.exec(raw.replace(/,/g, '').replace('−', '-'));
  if (!match || !(match[2] || match[3])) return null;
  let digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '');
  const power = Number(match[4] ?? 0) - (match[3]?.length ?? 0);
  if (!Number.isSafeInteger(power) || Math.abs(power) > 1000) return null;
  if (!digits) return '0e0';
  const zeros = digits.length - digits.replace(/0+$/, '').length;
  digits = digits.slice(0, digits.length - zeros);
  return `${match[1] === '-' ? '-' : ''}${digits}e${power + zeros}`;
}
export function quantityKey(value: string, unit = ''): string {
  const magnitude = canonicalMagnitude(value);
  return magnitude === null ? '' : `${magnitude}|${canonicalUnit(unit)}`;
}
