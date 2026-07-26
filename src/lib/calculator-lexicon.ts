/**
 * Calculator Lexicon — 계산기 정의에서 자연어 어휘를 **파생**한다.
 *
 * 계산기 57종의 이름·파라미터 설명·단위는 이미 한국어로 적혀 있다(`실 면적`,
 * `목표(필요) 조도`, 단위 `lx`·`lm`·`m²`). 그러므로 질의 해석용 패턴을 따로
 * 손으로 쓸 이유가 없다 — 손으로 쓰면 계산기가 추가·수정될 때마다 어긋난다.
 * 이 모듈은 그 정의를 그대로 어휘로 바꾼다.
 *
 * 두 가지를 제공한다.
 *   1. `matchCalculatorByName` — 이름 토큰으로 57종 중 하나를 고른다.
 *   2. `extractScopedParams` — **계산기가 정해진 뒤** 그 계산기의 파라미터만
 *      대상으로 값을 읽는다. 범위를 좁히는 것이 핵심이다: 전역으로는 "V"가
 *      전압·전위 어디로도 갈 수 있지만, illuminance 안에는 V 파라미터가 아예
 *      없어서 모호성이 사라진다.
 */

import { CALCULATOR_PARAMS, CALCULATOR_NAMES } from '@/lib/calculator-params';
import type { ExtendedParamDef } from '@/components/CalculatorForm';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 공통 정규화
// ═══════════════════════════════════════════════════════════════════════════════

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 비교용 정규화 — 공백·괄호를 지운다. "전압 강하 계산" 과 "전압강하계산" 을 같게 본다. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s()[\]]/g, '');
}

/**
 * 파라미터 설명에서 검색어를 뽑는다.
 * "목표(필요) 조도" → ["목표(필요) 조도", "목표조도", "조도"]
 * "주위 온도" → ["주위 온도", "주위온도", "온도"]
 * 괄호 안 범위 표기("(0~1)", "(선간)", "(1 또는 3)")는 값이 아니라 주석이므로 버린다.
 */
function descriptionTerms(description: string): string[] {
  const terms = new Set<string>();
  const withoutRanges = description.replace(/\([^)]*[0-9~또는][^)]*\)/g, '').trim();
  for (const candidate of [description, withoutRanges]) {
    const cleaned = candidate.trim();
    if (cleaned.length >= 2) {
      terms.add(cleaned);
      terms.add(cleaned.replace(/\s+/g, ''));
    }
  }
  // 마지막 낱말도 후보로 둔다 — "주위 온도" 를 "온도" 로만 쓰는 질문이 흔하다.
  const words = withoutRanges.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
  const last = words[words.length - 1];
  if (last && last.length >= 2) terms.add(last);
  // 긴 것부터 시도해야 "주위온도" 가 "온도" 에 먼저 먹히지 않는다.
  return [...terms].sort((a, b) => b.length - a.length);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 이름 인덱스 (라우팅 폴백)
// ═══════════════════════════════════════════════════════════════════════════════

/** 이름에서 뽑은 토큰. "부스바 전압강하" → ["부스바", "전압강하"] */
function nameTokens(name: string): string[] {
  return name
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

interface NameEntry {
  id: string;
  /** 토큰 → 희소도 가중치. 57종 중 몇 개 이름에 나오는지로 정한다. */
  tokens: Array<{ token: string; weight: number }>;
}

/**
 * 토큰 희소도로 가중한 이름 인덱스.
 *
 * `계산`·`선정` 처럼 대부분의 이름에 나오는 낱말은 가중치가 0에 가깝고,
 * `부스바`(1종)·`아크플래시`(1종)는 높다. `전압강하`는 5종에 나오므로 중간이다.
 * 그래서 "부스바 전압강하" 는 busbar-vd 로, 그냥 "전압강하" 는 어느 쪽으로도
 * 확정되지 않는다(그 경우는 상위 순위 파서가 이미 정했거나, 확정을 포기한다).
 */
const NAME_INDEX: NameEntry[] = (() => {
  const ids = Object.keys(CALCULATOR_PARAMS).filter((id) => CALCULATOR_NAMES[id]);
  const documentFrequency = new Map<string, number>();
  const perId = new Map<string, string[]>();

  for (const id of ids) {
    const tokens = new Set(nameTokens(CALCULATOR_NAMES[id].name));
    perId.set(id, [...tokens]);
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  return ids.map((id) => ({
    id,
    tokens: (perId.get(id) ?? []).map((token) => ({
      token,
      weight: Math.log(ids.length / (documentFrequency.get(token) ?? 1)),
    })),
  }));
})();

/** 이 점수 아래는 "이름이 스쳤을 뿐"으로 보고 계산기를 고르지 않는다. */
const NAME_MATCH_MIN_SCORE = 1.0;
/** 1등과 2등이 이만큼 벌어지지 않으면 확정하지 않는다 — 애매하면 고르지 않는 쪽이 안전하다. */
const NAME_MATCH_MIN_MARGIN = 0.3;

/**
 * 계산기 이름이 질의에 **통째로** 들어 있으면 그 계산기다.
 *
 * 토큰 점수와 달리 이것은 흔들리지 않는다. "케이블 사이징: …" 은 cable-sizing 을
 * 가리키지만, 같은 질문에 들어 있는 "허용 전압강하 3%" 때문에 토큰 점수로는
 * voltage-drop 이 이긴다(실측). 반대로 "KEC 232.3.9 전압강하 조항 원문" 은
 * `전압강하` 는 품고 있어도 `전압강하계산` 이라는 이름 전체는 품지 않는다 —
 * 그래서 규정 질문을 계산기로 끌고 가지 않는다.
 *
 * 긴 이름부터 본다. "AWG↔mm² 변환"(awg-converter)과 "통합 변환"(awg-converter-full)
 * 처럼 한쪽이 다른 쪽에 포함될 때 더 구체적인 쪽을 고르기 위해서다.
 */
export function matchCalculatorByExactName(query: string): string | undefined {
  const haystack = normalize(query);
  let best: { id: string; length: number } | undefined;
  for (const id of Object.keys(CALCULATOR_PARAMS)) {
    const name = CALCULATOR_NAMES[id]?.name;
    if (!name) continue;
    const needle = normalize(name);
    if (needle.length < 4 || !haystack.includes(needle)) continue;
    if (!best || needle.length > best.length) best = { id, length: needle.length };
  }
  return best?.id;
}

/**
 * 이름 토큰 점수로 계산기를 고른다. 확정할 수 없으면 undefined.
 *
 * 이것은 **최하위 폴백**이다. 실측(2026-07-25)상 이 매칭은 비계산 질의 10건 중
 * 7건에 반응한다 — "KEC 전압강하 기준 알려줘" 를 voltage-drop 으로, "차단기와
 * 개폐기의 차이" 를 breaker-sizing 으로 짚는다. 즉 **이름이 스쳤다는 것은 계산
 * 요청이라는 증거가 아니다**. 그래서 호출부는 이 결과만으로 계산기를 열지 않고,
 * 그 계산기의 입력을 실제로 읽어냈는지를 함께 본다.
 */
export function matchCalculatorByName(query: string): string | undefined {
  const haystack = normalize(query);
  const scored = NAME_INDEX.map((entry) => ({
    id: entry.id,
    score: entry.tokens.reduce(
      (sum, { token, weight }) => (haystack.includes(normalize(token)) ? sum + weight : sum),
      0,
    ),
  }))
    .filter((entry) => entry.score >= NAME_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return undefined;
  if (scored.length > 1 && scored[0].score - scored[1].score < NAME_MATCH_MIN_MARGIN) return undefined;
  return scored[0].id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 계산기 범위 한정 파라미터 추출
// ═══════════════════════════════════════════════════════════════════════════════

const NUMBER = '(-?\\d+(?:\\.\\d+)?)';

/**
 * 추출 결과. 읽어낸 값과 **질문에 적힌 그대로의 숫자**를 함께 돌려준다.
 *
 * 단위 환산이 있으면 둘이 달라진다 — "22.9kV" 는 값 22900 으로 읽히지만 질문에
 * 적힌 숫자는 22.9 다. 값만 보고 "읽은 숫자"를 판정하면 환산된 값이 전부
 * 미확인으로 남아 자동 실행이 막힌다.
 */
export interface ScopedExtraction {
  values: Record<string, unknown>;
  readNumbers: number[];
}

/**
 * 읽은 숫자를 파라미터 정의에 비추어 받아들일지 정한다. 못 받아들이면 undefined —
 * 그러면 그 수치는 "읽지 못한 값"으로 남아 가드가 되묻게 한다.
 *
 * 두 가지를 본다.
 *   · 백분율 환산 — 정의가 0~1 분수인데 질문이 "%"로 쓴 경우(수용률 70%, 여유율 20%).
 *     이건 추측이 아니라 단위 환산이다. 반대로 정의 단위가 이미 "%"면 그대로 둔다.
 *   · 범위 — 정의의 min/max 를 벗어나면 우리가 잘못 읽은 것이다. 실측: "여유율 20%"
 *     를 20 으로 읽어 0~1 범위의 growthMargin 에 넣자 계산기가 예외를 던졌다.
 *     범위를 아는데도 넘겨서 던지게 두는 것은 결함이다.
 */
/**
 * SI 접두어. **대소문자를 가린다** — `/i` 로 뭉뚱그리면 "누전차단기 15mA"(밀리)가
 * 15,000,000A 가 된다. 길이(m·km)는 넣지 않는다: mm·mm²·m² 와 섞인다.
 */
const SI_PREFIX: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, m: 1e-3 };

/** 접두어를 붙일 수 있는 전기 단위. 긴 것부터 봐야 kVA 가 V+A 로 쪼개지지 않는다. */
const PREFIXABLE_BASE = ['VA', 'Wh', 'V', 'A', 'W'] as const;

/**
 * "kVA" → { base:'VA', factor:1e3 }. 접두어만 대소문자를 가리고 본체는 가리지
 * 않는다 — 현장은 "22.9kv" 라고도 쓰지만 "mA" 와 "MA" 는 6자리 다른 값이다.
 */
function splitPrefix(unit: string): { base: string; factor: number } | undefined {
  for (const base of PREFIXABLE_BASE) {
    if (unit.toUpperCase() === base) return { base, factor: 1 };
    if (unit.length === base.length + 1 && unit.slice(1).toUpperCase() === base) {
      const factor = SI_PREFIX[unit[0]];
      if (factor !== undefined) return { base, factor };
    }
  }
  return undefined;
}

/**
 * 질문에 적힌 단위를 파라미터 단위로 옮기는 배율. 옮길 수 없으면 undefined —
 * 그러면 그 수치는 "읽지 못한 값"으로 남는다(추측하지 않는다).
 *
 * 수배전 현장 표기가 파라미터 단위와 다른 자릿수인 것이 기본이다. 계통은
 * 22.9kV·154kV 로 쓰는데 파라미터는 V 고, 변압기는 10MVA 로 쓰는데 파라미터는
 * kVA 다. 실측(2026-07-26): "단락전류 계산 22.9kV 10MVA" 에서 추출 0건.
 */
function unitScale(paramUnit: string, unitToken: string): number | undefined {
  if (!unitToken) return 1;
  if (unitAliases(paramUnit).some((a) => a.toLowerCase() === unitToken.toLowerCase())) return 1;

  const target = splitPrefix(paramUnit);
  const written = splitPrefix(unitToken);
  if (!target || !written || target.base !== written.base) return undefined;
  return written.factor / target.factor;
}

function acceptValue(param: ExtendedParamDef, raw: string, unitToken: string): number | undefined {
  let value = parseFloat(raw);
  if (!Number.isFinite(value)) return undefined;

  const isFraction = !param.unit && param.max !== undefined && param.max <= 1;
  if (isFraction && unitToken === '%') value /= 100;
  else if (param.unit) {
    const scale = unitScale(param.unit, unitToken);
    if (scale === undefined) return undefined;
    // 부동소수 잔재를 남기지 않는다 — 22.9 × 1000 은 22900 이어야 한다.
    if (scale !== 1) value = Number((value * scale).toPrecision(12));
  }

  if (param.min !== undefined && value < param.min) return undefined;
  if (param.max !== undefined && value > param.max) return undefined;
  return value;
}

/** 단위 표기 흔들림 — 정의된 단위 하나에 대해 질문에서 나올 수 있는 표기들. */
const UNIT_ALIASES: Record<string, string[]> = {
  '°C': ['°C', '℃', '도', 'C'],
  'm²': ['m²', 'm2', '제곱미터', '㎡', 'sqm'],
  mm: ['mm', '밀리미터'],
  'mm²': ['mm²', 'mm2', 'sq', '스퀘어', '㎟'],
  'Ω': ['Ω', '옴', 'ohm'],
  'Ω·m': ['Ω·m', 'Ωm', '옴미터', 'ohm·m'],
  'Ω/km': ['Ω/km', 'Ω/㎞', '옴/km'],
  m: ['m', '미터'],
  km: ['km', '킬로미터'],
  V: ['V', '볼트'],
  A: ['A', '암페어'],
  kA: ['kA'],
  W: ['W', '와트'],
  kW: ['kW', '킬로와트'],
  kVA: ['kVA'],
  VA: ['VA'],
  kWh: ['kWh'],
  kWp: ['kWp'],
  lx: ['lx', 'lux', '룩스'],
  lm: ['lm', 'lumen', '루멘'],
  Hz: ['Hz', '헤르츠'],
  s: ['s', '초', 'sec'],
  min: ['min', '분'],
  h: ['h', '시간', 'hr'],
  개: ['개', 'EA', 'ea'],
  EA: ['EA', 'ea', '개'],
  '%': ['%', '퍼센트'],
  rpm: ['rpm'],
  AWG: ['AWG', 'awg'],
};

function unitAliases(unit: string): string[] {
  return UNIT_ALIASES[unit] ?? (unit ? [unit] : []);
}

/**
 * 정규식이 잡아야 할 표기 — 선언 단위의 별칭 + 같은 본체의 접두어 표기.
 *
 * 접두어 표기를 넣지 않으면 "22.9kV" 는 매칭 자체가 안 된다(V 앞에 k 가 있어
 * `\s*(V|볼트)` 가 실패한다). 어느 배율인지는 acceptValue 가 대소문자를 가려
 * 정한다 — 여기서는 후보만 넓힌다.
 *
 * 긴 표기부터 놓는다. 'V' 가 앞에 오면 교대에서 먼저 걸려 'kV' 를 못 잡는다.
 */
function unitAliasesForMatch(unit: string): string[] {
  const aliases = unitAliases(unit);
  const decomposed = splitPrefix(unit);
  if (!decomposed) return aliases;
  const prefixed = Object.keys(SI_PREFIX).map((p) => `${p}${decomposed.base}`);
  return [...new Set([...prefixed, ...aliases])].sort((a, b) => b.length - a.length);
}

/**
 * 그 계산기 안에서 **단 하나의 파라미터만** 쓰는 단위를 찾는다.
 * 그런 단위는 "3000lm" 만으로 어느 파라미터인지 확정된다.
 */
function uniqueUnitOwners(params: ExtendedParamDef[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const param of params) {
    if (!param.unit) continue;
    counts.set(param.unit, (counts.get(param.unit) ?? 0) + 1);
  }
  const owners = new Map<string, string>();
  for (const param of params) {
    if (param.unit && counts.get(param.unit) === 1) owners.set(param.unit, param.name);
  }
  return owners;
}

/**
 * 계산기의 파라미터 정의만 가지고 질의에서 값을 읽는다.
 *
 * 두 규칙만 쓴다.
 *   ① `설명어 [:=]? 숫자 [단위]?`  — "실 면적 100제곱미터", "조명률 0.6"
 *   ② `숫자 + 단위`가 그 계산기 안에서 유일한 단위일 때 — "3000lm" → luminousFlux
 * ①이 ②보다 강하다. 사용자가 이름을 대며 준 값이 단위만으로 추측한 값보다 확실하다.
 *
 * 선택지형(options)은 값·라벨을 그대로 찾는다 — 도체 `Cu`/`구리`, 절연 `XLPE`.
 */
export function extractScopedParams(
  query: string,
  params: ExtendedParamDef[],
): ScopedExtraction {
  const found: Record<string, unknown> = {};
  const consumed: Array<[number, number]> = [];
  // 질문에 **적힌 그대로의** 숫자. 단위 환산이 있으면 읽어낸 값과 달라지므로
  // (22.9kV → 22900), "무엇을 읽었나" 는 값이 아니라 이 목록으로 판단해야 한다.
  const readNumbers: number[] = [];

  const overlaps = (start: number, end: number): boolean =>
    consumed.some(([s, e]) => start < e && s < end);

  // ① 설명어 기반 — 긴 설명어부터 잡아야 "주위온도"가 "온도"에 먹히지 않는다.
  const byDescription = params
    .filter((param) => param.type === 'number')
    .flatMap((param) => descriptionTerms(param.description ?? '').map((term) => ({ param, term })))
    .sort((a, b) => b.term.length - a.term.length);

  for (const { param, term } of byDescription) {
    if (param.name in found) continue;
    // 단위 없는 비율 파라미터(역률·수용률·여유율)도 질문에서는 "%"로 쓰인다.
    const units = [...unitAliasesForMatch(param.unit ?? ''), ...(param.unit ? [] : ['%'])]
      .map(escapeRegExp)
      .join('|');
    const unitPart = units ? `\\s*(${units})?` : '()';
    const pattern = new RegExp(
      `${escapeRegExp(term).replace(/\\?\s+/g, '\\s*')}\\s*(?:은|는|이|가|를|을|:|=)?\\s*${NUMBER}${unitPart}`,
      'i',
    );
    const match = pattern.exec(query);
    if (!match || match.index === undefined) continue;
    if (overlaps(match.index, match.index + match[0].length)) continue;
    const accepted = acceptValue(param, match[1] ?? '', match[2] ?? '');
    if (accepted === undefined) continue;
    found[param.name] = accepted;
    readNumbers.push(parseFloat(match[1] ?? ''));
    consumed.push([match.index, match.index + match[0].length]);
  }

  // ② 유일 단위 기반
  for (const [unit, paramName] of uniqueUnitOwners(params)) {
    if (paramName in found) continue;
    const units = unitAliasesForMatch(unit).map(escapeRegExp).join('|');
    if (!units) continue;
    const pattern = new RegExp(`${NUMBER}\\s*(${units})(?![A-Za-z가-힣])`, 'i');
    const match = pattern.exec(query);
    if (!match || match.index === undefined) continue;
    if (overlaps(match.index, match.index + match[0].length)) continue;
    const param = params.find((p) => p.name === paramName);
    if (!param) continue;
    const accepted = acceptValue(param, match[1] ?? '', match[2] ?? '');
    if (accepted === undefined) continue;
    found[paramName] = accepted;
    readNumbers.push(parseFloat(match[1] ?? ''));
    consumed.push([match.index, match.index + match[0].length]);
  }

  // ③ 배열형 — 한 문장은 부하 하나를 말한다. 그것을 1항목 목록으로 묶는다.
  //
  // 7종이 목록을 요구한다(부하 목록·병렬 변압기 목록·구간 목록). 여러 항목을
  // 한 문장으로 받는 것은 무리지만, "설비용량 500kW 수용률 0.7" 처럼 **하나로
  // 합친 부하**를 말하는 것은 흔하고 그것이 곧 1항목이다. 항목 스키마의 필드도
  // 같은 규칙으로 읽는다 — 하나도 못 읽으면 목록을 만들지 않는다(빈 항목을
  // 기본값으로 채워 넣으면 그것이야말로 사용자의 계산이 아니다).
  for (const param of params) {
    if (param.type !== 'array' || !param.itemSchema || param.name in found) continue;
    const nested = extractScopedParams(query, param.itemSchema);
    const item = nested.values;
    if (Object.values(item).every((value) => typeof value !== 'number')) continue;
    readNumbers.push(...nested.readNumbers);

    // 항목의 나머지 칸은 최상위 파라미터와 같은 규칙으로 채운다 — 스키마가
    // 선언한 기본값만 쓰고, 기본값이 없는 칸이 비면 목록을 만들지 않는다.
    // 그래야 폼이 그 칸을 사용자에게 묻는다.
    let complete = true;
    for (const field of param.itemSchema) {
      if (field.name in item) continue;
      if (field.defaultValue !== undefined) item[field.name] = field.defaultValue;
      else if (field.type === 'string' && field.name === 'name') item[field.name] = '전체';
      else complete = false;
    }
    if (!complete) continue;

    // `flatten` 인 스키마는 항목이 값 하나다(개별 부하 최대수요 목록).
    const single = param.flatten && param.itemSchema.length === 1
      ? item[param.itemSchema[0].name]
      : item;

    // 병렬운전처럼 2대 이상을 요구하면, "N대" 를 읽어 동일 사양으로 채운다.
    // 동일 용량·동일 %Z 병렬이 현장의 표준 구성이라 이 복제는 임의 추정이 아니다.
    const minItems = param.minItems ?? 1;
    const countMatch = /(\d+)\s*(?:대|기|조|개)/.exec(query);
    const count = Math.max(minItems, countMatch ? parseInt(countMatch[1], 10) : 1);
    found[param.name] = Array.from({ length: count }, () => (typeof single === 'object' ? { ...single } : single));
  }

  // ④ 선택지형 — 값 또는 라벨이 질문에 그대로 나오면 채택한다.
  for (const param of params) {
    if (param.name in found || !param.options) continue;
    for (const option of param.options) {
      const label = option.label ?? '';
      const labelCore = label.split('(')[0].trim();
      const needles = [String(option.value), labelCore].filter((n) => n.length >= 2);
      if (needles.some((needle) => normalize(query).includes(normalize(needle)))) {
        found[param.name] = option.value;
        break;
      }
    }
  }

  return { values: found, readNumbers };
}

/** 이름 인덱스에 등재된 계산기 수 — 커버리지 확인용. */
export const NAME_INDEX_SIZE = NAME_INDEX.length;
