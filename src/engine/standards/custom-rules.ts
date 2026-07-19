/**
 * 사내 규정(커스텀 룰셋) — 외부 규칙 로딩 통로
 * ─────────────────────────────────────────────
 * 판정 엔진(CodeArticle + evaluateCondition)은 데이터 구동인데 규칙을 외부에서
 * 불러오는 통로가 없었다. 이 모듈이 그 통로다: JSON 룰셋을 구조 검증(린트)하고,
 * 도면 추출 결과 위에서 KEC와 동일한 시맨틱으로 평가한다.
 *
 * 원칙:
 * - 엔진을 새로 만들지 않는다 — Condition 구조·평가 시맨틱은 registry 범용 경로와 동일
 * - 임계값을 지어내지 않는다 — 자리표시자(0+부등호)는 HOLD, 누락 param도 HOLD
 * - 무효 룰셋을 조용히 버리지 않는다 — 로드는 fail-closed(오류 목록 반환)
 * - HOLD는 결함이 아니라 보완 안내다 — note에 "무엇이 없어서 못 정하는지"를 명시
 *
 * 설계 전문 = docs/CUSTOM_RULES_DESIGN.md
 */

import type { Condition } from './kec/types';
import { evaluateCondition } from './kec/types';
import { isPlaceholderThreshold } from './evaluator-guard';
import { parseSpecText } from '@/engine/topology/spec-text';

// =========================================================================
// PART 1 — 타입
// =========================================================================

export type RuleScope = 'connection' | 'component' | 'global';
export type RuleSeverity = 'critical' | 'major' | 'minor';

export interface CustomRuleArticle {
  /** 룰셋 내 유일 식별자 (예: "3.2.1") */
  article: string;
  title: string;
  scope: RuleScope;
  /** component scope 한정 — 대상 컴포넌트 타입 필터. 생략 시 전체 적용 */
  appliesTo?: string[];
  /** FAIL 시 위반 심각도 (기본 major) */
  severity?: RuleSeverity;
  /** FAIL 시 시정 안내 — 룰 저자 제공만. 엔진이 발명하지 않는다 */
  remedy?: string;
  conditions: Condition[];
}

export interface CustomRuleSet {
  name: string;
  version: string;
  organization?: string;
  /** 어떤 공적 기준을 상회/보충하는지 (예: "KEC 2021") */
  basedOn?: string;
  /** 리포트 표시 라벨 (기본 '사내규정') */
  standardLabel?: string;
  articles: CustomRuleArticle[];
}

export interface RuleLintResult {
  ok: boolean;
  ruleSet?: CustomRuleSet;
  errors: string[];
  warnings: string[];
  summary?: {
    articles: number;
    conditions: number;
    byScope: Record<RuleScope, number>;
  };
}

/** 평가 대상 — 도면 추출 결과의 최소 사영 (agent 타입에 의존하지 않는다) */
export interface RuleEvalExtraction {
  components: Array<{ id: string; type: string; label: string; rating?: string }>;
  connections: Array<{
    from: string;
    to: string;
    lengthM?: number;
    conductorSizeSq?: number;
    currentA?: number;
    /** 실전류 기반 계산이 있을 때만 — 추정치를 넣지 않는다 */
    voltageDropPercent?: number;
  }>;
  /** 요청 params 중 숫자 값 — 도면에 없는 값의 유일한 합법 통로 */
  userParams?: Record<string, number>;
}

export interface CustomRuleFinding {
  article: string;
  title: string;
  scope: RuleScope;
  /** 인스턴스 라벨 — "TR-1", "comp_1→comp_2", "(도면 전체)" */
  target: string;
  judgment: 'PASS' | 'FAIL' | 'HOLD';
  note: string;
  severity: RuleSeverity;
  remedy?: string;
}

// =========================================================================
// PART 2 — 파라미터 사전 (파이프라인이 실제로 가진 값만)
// =========================================================================

export const CONNECTION_PARAMS = ['lengthM', 'conductorSizeSq', 'currentA', 'voltageDropPercent'] as const;
export const COMPONENT_PARAMS = ['ratingKva', 'ratingKw', 'ratingA', 'ratingV', 'ratingHp'] as const;
export const GLOBAL_PARAMS = [
  'componentCount', 'connectionCount', 'transformerCount',
  'breakerCount', 'motorCount', 'panelCount', 'totalLengthM',
] as const;

const KNOWN_PARAMS: Record<RuleScope, readonly string[]> = {
  connection: CONNECTION_PARAMS,
  component: COMPONENT_PARAMS,
  global: GLOBAL_PARAMS, // + 사용자 제공 param — 린트에서 경고만, 오류 아님
};

/** 도면 추출이 낼 수 있는 컴포넌트 타입 (sld-recognition SLDComponentType과 동일 어휘) */
const KNOWN_COMPONENT_TYPES = new Set([
  'transformer', 'breaker', 'cable', 'bus', 'generator', 'motor',
  'capacitor', 'load', 'switch', 'relay', 'meter', 'panel', 'ups', 'mcc',
]);

// =========================================================================
// PART 3 — 린트 (로드 시 fail-closed)
// =========================================================================

const CAPS = {
  articles: 200,
  conditionsPerArticle: 20,
  stringLength: 300,
} as const;

const VALID_OPERATORS = new Set(['<=', '>=', '==', '<', '>']);
const VALID_RESULTS = new Set(['PASS', 'FAIL']);
const VALID_SCOPES = new Set<string>(['connection', 'component', 'global']);
const VALID_SEVERITIES = new Set<string>(['critical', 'major', 'minor']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strField(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= CAPS.stringLength
    ? v.trim()
    : null;
}

/**
 * JSON 룰셋 → 검증된 CustomRuleSet.
 * 오류 = 로드 거부(구조 위반) / 경고 = 로드하되 고지(평가 시 HOLD 위험).
 */
export function parseCustomRuleSet(raw: unknown): RuleLintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ['룰셋 루트는 JSON 객체여야 합니다'], warnings };
  }

  const name = strField(raw.name);
  const version = strField(raw.version);
  if (!name) errors.push('name 누락 또는 무효 (1~300자 문자열)');
  if (!version) errors.push('version 누락 또는 무효 (1~300자 문자열)');

  if (!Array.isArray(raw.articles) || raw.articles.length === 0) {
    errors.push('articles는 비어 있지 않은 배열이어야 합니다');
    return { ok: false, errors, warnings };
  }
  if (raw.articles.length > CAPS.articles) {
    errors.push(`조항 수 ${raw.articles.length} > 한도 ${CAPS.articles}`);
    return { ok: false, errors, warnings };
  }

  const articles: CustomRuleArticle[] = [];
  const seenIds = new Set<string>();
  let conditionTotal = 0;
  const byScope: Record<RuleScope, number> = { connection: 0, component: 0, global: 0 };

  raw.articles.forEach((a, i) => {
    const at = `articles[${i}]`;
    if (!isRecord(a)) {
      errors.push(`${at}: 객체가 아닙니다`);
      return;
    }

    const article = strField(a.article);
    const title = strField(a.title);
    const scope = typeof a.scope === 'string' && VALID_SCOPES.has(a.scope) ? (a.scope as RuleScope) : null;
    if (!article) errors.push(`${at}: article 누락 또는 무효`);
    if (!title) errors.push(`${at}: title 누락 또는 무효`);
    if (!scope) errors.push(`${at}: scope는 connection|component|global 중 하나여야 합니다`);
    if (article && seenIds.has(article)) errors.push(`${at}: article "${article}" 중복`);
    if (article) seenIds.add(article);

    let severity: RuleSeverity = 'major';
    if (a.severity !== undefined) {
      if (typeof a.severity === 'string' && VALID_SEVERITIES.has(a.severity)) {
        severity = a.severity as RuleSeverity;
      } else {
        errors.push(`${at}: severity는 critical|major|minor 중 하나여야 합니다`);
      }
    }

    let appliesTo: string[] | undefined;
    if (a.appliesTo !== undefined) {
      if (!Array.isArray(a.appliesTo) || a.appliesTo.some((t) => typeof t !== 'string')) {
        errors.push(`${at}: appliesTo는 문자열 배열이어야 합니다`);
      } else {
        appliesTo = (a.appliesTo as string[]).map((t) => t.trim().toLowerCase());
        for (const t of appliesTo) {
          if (!KNOWN_COMPONENT_TYPES.has(t)) {
            warnings.push(`${at}: appliesTo "${t}"는 도면 추출이 내지 않는 타입 — 해당 조항이 대상 0개일 수 있습니다`);
          }
        }
      }
    }
    if (scope === 'component' && !appliesTo) {
      warnings.push(`${at}: component 조항에 appliesTo가 없어 모든 컴포넌트에 적용됩니다 — 대량 HOLD 소음 가능`);
    }
    if (scope !== 'component' && appliesTo) {
      warnings.push(`${at}: appliesTo는 component scope에서만 의미 있음 — 무시됩니다`);
    }

    const remedy = a.remedy !== undefined ? strField(a.remedy) : null;
    if (a.remedy !== undefined && !remedy) {
      errors.push(`${at}: remedy가 무효 (1~300자 문자열)`);
    }

    if (!Array.isArray(a.conditions) || a.conditions.length === 0) {
      errors.push(`${at}: conditions는 비어 있지 않은 배열이어야 합니다`);
      return;
    }
    if (a.conditions.length > CAPS.conditionsPerArticle) {
      errors.push(`${at}: 조건 수 ${a.conditions.length} > 한도 ${CAPS.conditionsPerArticle}`);
      return;
    }

    const conditions: Condition[] = [];
    a.conditions.forEach((c, j) => {
      const ct = `${at}.conditions[${j}]`;
      if (!isRecord(c)) {
        errors.push(`${ct}: 객체가 아닙니다`);
        return;
      }
      const param = strField(c.param);
      if (!param) errors.push(`${ct}: param 누락 또는 무효`);
      const operator = typeof c.operator === 'string' && VALID_OPERATORS.has(c.operator) ? c.operator : null;
      if (!operator) errors.push(`${ct}: operator는 <=|>=|==|<|> 중 하나여야 합니다`);
      const value = typeof c.value === 'number' && Number.isFinite(c.value) ? c.value : null;
      if (value === null) errors.push(`${ct}: value는 유한한 숫자여야 합니다`);
      const result = typeof c.result === 'string' && VALID_RESULTS.has(c.result) ? (c.result as 'PASS' | 'FAIL') : null;
      if (!result) errors.push(`${ct}: result는 PASS|FAIL 중 하나여야 합니다`);
      const unit = typeof c.unit === 'string' && c.unit.length <= CAPS.stringLength ? c.unit : '';
      const note =
        typeof c.note === 'string' && c.note.length <= CAPS.stringLength ? c.note : '';
      if (typeof c.note === 'string' && c.note.length > CAPS.stringLength) {
        errors.push(`${ct}: note가 ${CAPS.stringLength}자를 초과합니다`);
      }

      if (!param || !operator || value === null || !result) return;

      const cond: Condition = { param, operator: operator as Condition['operator'], value, unit, result, note };
      if (isPlaceholderThreshold(cond)) {
        warnings.push(`${ct}: 임계값 0+부등호는 자리표시자로 간주 — 평가 시 HOLD됩니다. 실제 값을 입력하세요`);
      }
      if (scope && !KNOWN_PARAMS[scope].includes(param)) {
        warnings.push(
          scope === 'global'
            ? `${ct}: param "${param}"은 집계 사전에 없음 — 요청 params로 값을 제공하지 않으면 HOLD됩니다`
            : `${ct}: param "${param}"은 ${scope} 사전(${KNOWN_PARAMS[scope].join(', ')})에 없음 — 항상 HOLD됩니다`,
        );
      }
      conditions.push(cond);
      conditionTotal += 1;
    });

    if (!article || !title || !scope || conditions.length !== a.conditions.length) return;

    byScope[scope] += 1;
    articles.push({
      article,
      title,
      scope,
      ...(scope === 'component' && appliesTo ? { appliesTo } : {}),
      severity,
      ...(remedy ? { remedy } : {}),
      conditions,
    });
  });

  if (errors.length > 0) return { ok: false, errors, warnings };

  const ruleSet: CustomRuleSet = {
    name: name!,
    version: version!,
    ...(strField(raw.organization) ? { organization: strField(raw.organization)! } : {}),
    ...(strField(raw.basedOn) ? { basedOn: strField(raw.basedOn)! } : {}),
    standardLabel: strField(raw.standardLabel) ?? '사내규정',
    articles,
  };

  return {
    ok: true,
    ruleSet,
    errors,
    warnings,
    summary: { articles: articles.length, conditions: conditionTotal, byScope },
  };
}

// =========================================================================
// PART 4 — 평가
// =========================================================================

/** own-property + 유한수만 인정 — "__proto__" 같은 param이 프로토타입을 줍지 못하게 */
function readParam(params: Record<string, number>, key: string): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(params, key)) return undefined;
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * 조항 하나를 param 레코드에 대조 — registry 범용 경로와 동일 시맨틱:
 * ① 자리표시자 → HOLD ② 값 있는 조건 중 위반 → FAIL
 * ③ 전부 존재+충족 → PASS ④ 그 외 → HOLD(누락 param 명시)
 */
function judgeArticle(
  a: CustomRuleArticle,
  params: Record<string, number>,
  target: string,
): CustomRuleFinding {
  const base = {
    article: a.article,
    title: a.title,
    scope: a.scope,
    target,
    severity: a.severity ?? 'major',
    ...(a.remedy ? { remedy: a.remedy } : {}),
  };

  const placeholders = a.conditions.filter(isPlaceholderThreshold);
  if (placeholders.length > 0) {
    return {
      ...base,
      judgment: 'HOLD',
      note: `임계값 자리표시자 — 자동 판정 보류. 적용 규칙: ${placeholders[0].note || '조항 원문 참조'}`,
    };
  }

  const failed: Condition[] = [];
  const missing: string[] = [];
  let matchedCount = 0;

  for (const cond of a.conditions) {
    const actual = readParam(params, cond.param);
    if (actual === undefined) {
      missing.push(cond.param);
      continue;
    }
    if (evaluateCondition(cond, actual)) matchedCount += 1;
    else failed.push(cond);
  }

  if (failed.length > 0) {
    const f = failed[0];
    const actual = readParam(params, f.param);
    return {
      ...base,
      judgment: 'FAIL',
      note:
        `${f.param}=${actual}${f.unit} — 기준 ${f.operator} ${f.value}${f.unit} 위반` +
        (f.note ? ` (${f.note})` : ''),
    };
  }

  if (missing.length === 0 && matchedCount === a.conditions.length) {
    return { ...base, judgment: 'PASS', note: `전 조건 충족 (${a.conditions.length}건)` };
  }

  return {
    ...base,
    judgment: 'HOLD',
    note: `판정 불가 — 미제공 값: ${missing.join(', ')}. 도면 표기 또는 요청 params로 제공 필요`,
  };
}

/** 도면 정격 문자열("500kVA"·"800A") → component param 레코드 */
function componentParams(rating: string | undefined): Record<string, number> {
  const params: Record<string, number> = {};
  if (!rating) return params;
  const spec = parseSpecText(rating);
  if (spec.power !== undefined && spec.powerUnit) {
    const u = spec.powerUnit.toLowerCase();
    if (u === 'kva') params.ratingKva = spec.power;
    else if (u === 'mva') params.ratingKva = spec.power * 1000;
    else if (u === 'kw') params.ratingKw = spec.power;
    else if (u === 'mw') params.ratingKw = spec.power * 1000;
    else if (u === 'hp') params.ratingHp = spec.power;
  }
  if (spec.current !== undefined) params.ratingA = spec.current;
  if (spec.voltage !== undefined) params.ratingV = spec.voltage;
  return params;
}

/**
 * 룰셋 전체를 도면 추출 결과에 대조한다.
 * 반환은 인스턴스 단위 판정 목록 — 호출자(sld-team)가 리포트 타입으로 매핑한다.
 */
export function evaluateCustomRules(
  ruleSet: CustomRuleSet,
  extraction: RuleEvalExtraction,
): CustomRuleFinding[] {
  const findings: CustomRuleFinding[] = [];

  // global 집계 — 사용자 params를 먼저 깔고 집계로 덮는다(집계가 정본)
  const globals: Record<string, number> = {};
  for (const [k, v] of Object.entries(extraction.userParams ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) globals[k] = v;
  }
  const counts = { transformer: 0, breaker: 0, motor: 0, panel: 0 };
  for (const c of extraction.components) {
    if (c.type in counts) counts[c.type as keyof typeof counts] += 1;
  }
  globals.componentCount = extraction.components.length;
  globals.connectionCount = extraction.connections.length;
  globals.transformerCount = counts.transformer;
  globals.breakerCount = counts.breaker;
  globals.motorCount = counts.motor;
  globals.panelCount = counts.panel;
  globals.totalLengthM = extraction.connections.reduce(
    (sum, conn) => sum + (typeof conn.lengthM === 'number' && Number.isFinite(conn.lengthM) ? conn.lengthM : 0),
    0,
  );

  for (const article of ruleSet.articles) {
    switch (article.scope) {
      case 'global': {
        findings.push(judgeArticle(article, globals, '(도면 전체)'));
        break;
      }

      case 'component': {
        const targets = article.appliesTo
          ? extraction.components.filter((c) => article.appliesTo!.includes(c.type.toLowerCase()))
          : extraction.components;
        if (targets.length === 0) {
          findings.push({
            article: article.article,
            title: article.title,
            scope: article.scope,
            target: '(대상 없음)',
            severity: article.severity ?? 'major',
            judgment: 'HOLD',
            note: `대상 컴포넌트 없음 (필터: ${article.appliesTo?.join(', ') ?? '전체'}) — 도면에 해당 설비가 없거나 타입 미인식`,
          });
          break;
        }
        for (const comp of targets) {
          findings.push(judgeArticle(article, componentParams(comp.rating), comp.label || comp.id));
        }
        break;
      }

      case 'connection': {
        if (extraction.connections.length === 0) {
          findings.push({
            article: article.article,
            title: article.title,
            scope: article.scope,
            target: '(결선 없음)',
            severity: article.severity ?? 'major',
            judgment: 'HOLD',
            note: '도면에서 결선이 추출되지 않음 — 판정 불가',
          });
          break;
        }
        for (const conn of extraction.connections) {
          const params: Record<string, number> = {};
          if (typeof conn.lengthM === 'number' && Number.isFinite(conn.lengthM)) params.lengthM = conn.lengthM;
          if (typeof conn.conductorSizeSq === 'number' && Number.isFinite(conn.conductorSizeSq)) params.conductorSizeSq = conn.conductorSizeSq;
          if (typeof conn.currentA === 'number' && Number.isFinite(conn.currentA)) params.currentA = conn.currentA;
          if (typeof conn.voltageDropPercent === 'number' && Number.isFinite(conn.voltageDropPercent)) params.voltageDropPercent = conn.voltageDropPercent;
          findings.push(judgeArticle(article, params, `${conn.from}→${conn.to}`));
        }
        break;
      }
    }
  }

  return findings;
}

// IDENTITY_SEAL: standards/custom-rules | role=사내 규정 룰셋 린트+평가(외부 규칙 로딩 통로) | inputs=JSON ruleset+extraction | outputs=lint result+findings
