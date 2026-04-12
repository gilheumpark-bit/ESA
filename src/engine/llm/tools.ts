/**
 * ESVA Tool Definitions — Vercel AI SDK Compatible
 *
 * "LLM은 계산하지 않는다" — Every numeric result must come from a tool call.
 *
 * PART 1: Tool definitions array
 * PART 2: Tool lookup helper
 * PART 3: Vercel AI SDK tool() format adapter
 */

import type { ESATool, ParamDef } from './types';

// ---------------------------------------------------------------------------
// Helper — shorthand param builders
// ---------------------------------------------------------------------------

function numParam(
  name: string,
  description: string,
  descriptionEn: string,
  unit: string,
  required = true,
  opts?: Partial<ParamDef>,
): [string, ParamDef] {
  return [name, {
    name, type: 'number', unit, description, descriptionEn, required, ...opts,
  }];
}

function strParam(
  name: string,
  description: string,
  descriptionEn: string,
  required = true,
  opts?: Partial<ParamDef>,
): [string, ParamDef] {
  return [name, {
    name, type: 'string', description, descriptionEn, required, ...opts,
  }];
}

function enumParam(
  name: string,
  description: string,
  descriptionEn: string,
  values: string[],
  required = true,
  opts?: Partial<ParamDef>,
): [string, ParamDef] {
  return [name, {
    name, type: 'enum', description, descriptionEn, required,
    enumValues: values, ...opts,
  }];
}

// ---------------------------------------------------------------------------
// PART 1 — Complete ESVA Tool Definitions
// ---------------------------------------------------------------------------

export const ESVA_TOOLS: ESATool[] = [
  // ── Calculation Tools ─────────────────────────────────────────────────────

  {
    name: 'calculate_voltage_drop',
    description: '전압강하를 계산합니다. 단상/삼상 회로의 전압강하(V) 및 백분율(%)을 산출합니다.',
    descriptionEn: 'Calculate voltage drop for single-phase or three-phase circuits. Returns drop in volts and percentage.',
    parameters: Object.fromEntries([
      numParam('voltage', '시스템 전압', 'System voltage', 'V'),
      numParam('current', '부하 전류', 'Load current', 'A'),
      numParam('length', '편도 케이블 길이', 'One-way cable length', 'm'),
      numParam('cableSize', '케이블 단면적', 'Cable cross-section area', 'mm2'),
      enumParam('conductor', '도체 재질', 'Conductor material', ['Cu', 'Al']),
      numParam('powerFactor', '역률', 'Power factor', '', true, { min: 0.01, max: 1.0 }),
      enumParam('phase', '상 구성', 'Phase configuration', ['1', '3']),
      numParam('reactance', '케이블 리액턴스', 'Cable reactance', 'Ohm/km', false, { default: 0.08 }),
      numParam('dropLimitPercent', '전압강하 허용치', 'Voltage drop limit', '%', false, { default: 3 }),
    ]),
    handler: 'calculateVoltageDrop',
    category: 'calculation',
  },

  {
    name: 'calculate_cable_sizing',
    description: '케이블 사이즈를 선정합니다. 허용전류와 전압강하 기준을 모두 만족하는 최소 케이블을 결정합니다.',
    descriptionEn: 'Select minimum cable size satisfying both ampacity and voltage drop criteria.',
    parameters: Object.fromEntries([
      numParam('voltage', '시스템 전압', 'System voltage', 'V'),
      numParam('current', '부하 전류', 'Load current', 'A'),
      numParam('length', '편도 케이블 길이', 'One-way cable length', 'm'),
      enumParam('conductor', '도체 재질', 'Conductor material', ['Cu', 'Al']),
      enumParam('insulation', '절연 종류', 'Insulation type', ['XLPE', 'PVC']),
      numParam('powerFactor', '역률', 'Power factor', '', true, { min: 0.01, max: 1.0 }),
      enumParam('phase', '상 구성', 'Phase configuration', ['1', '3']),
      numParam('ambientTemp', '주위 온도', 'Ambient temperature', 'degC', false, { default: 30 }),
      numParam('groupingFactor', '그룹 보정 계수', 'Grouping correction factor', '', false, { default: 1.0 }),
      numParam('dropLimitPercent', '전압강하 허용치', 'Voltage drop limit', '%', false, { default: 3 }),
    ]),
    handler: 'calculateCableSizing',
    category: 'calculation',
  },

  {
    name: 'calculate_breaker_sizing',
    description: '차단기를 선정합니다. 부하전류, 단락전류, 케이블 허용전류를 고려하여 적정 MCCB를 결정합니다.',
    descriptionEn: 'Select circuit breaker rating based on load current, short-circuit current, and cable ampacity coordination.',
    parameters: Object.fromEntries([
      numParam('loadCurrent', '부하 전류', 'Load current', 'A'),
      numParam('shortCircuitCurrent', '단락 전류', 'Prospective short-circuit current', 'kA'),
      numParam('voltage', '시스템 전압', 'System voltage', 'V'),
      numParam('cableAmpacity', '케이블 허용전류', 'Cable ampacity', 'A', false),
    ]),
    handler: 'calculateBreakerSizing',
    category: 'calculation',
  },

  {
    name: 'calculate_short_circuit',
    description: '단락전류를 계산합니다. 변압기 임피던스 기반의 예상 단락전류(kA)를 산출합니다.',
    descriptionEn: 'Calculate prospective short-circuit current based on transformer impedance.',
    parameters: Object.fromEntries([
      numParam('transformerKVA', '변압기 용량', 'Transformer capacity', 'kVA'),
      numParam('impedancePercent', '임피던스 전압', 'Impedance voltage', '%'),
      numParam('secondaryVoltage', '2차 전압', 'Secondary voltage', 'V'),
      enumParam('phase', '상 구성', 'Phase configuration', ['1', '3']),
    ]),
    handler: 'calculateShortCircuit',
    category: 'calculation',
  },

  {
    name: 'calculate_transformer',
    description: '변압기 용량을 선정합니다. 부하 합계에 수요율을 적용하여 적정 표준 용량을 결정합니다.',
    descriptionEn: 'Select transformer capacity based on total load with demand factor applied.',
    parameters: Object.fromEntries([
      numParam('totalLoad', '총 부하', 'Total connected load', 'kW'),
      numParam('demandFactor', '수요율', 'Demand factor', '', true, { min: 0.01, max: 1.0 }),
      numParam('powerFactor', '역률', 'Power factor', '', true, { min: 0.01, max: 1.0 }),
      numParam('growthPercent', '성장 여유율', 'Growth margin', '%', false, { default: 20 }),
    ]),
    handler: 'calculateTransformerCapacity',
    category: 'calculation',
  },

  {
    name: 'calculate_grounding',
    description: '접지 저항을 계산합니다. 봉형 접지극의 접지저항(Ohm)을 산출합니다.',
    descriptionEn: 'Calculate ground resistance for rod-type grounding electrode.',
    parameters: Object.fromEntries([
      numParam('soilResistivity', '대지 저항률', 'Soil resistivity', 'Ohm-m'),
      numParam('rodLength', '접지봉 길이', 'Ground rod length', 'm'),
      numParam('rodDiameter', '접지봉 직경', 'Ground rod diameter', 'mm'),
      numParam('rodCount', '접지봉 수량', 'Number of ground rods', 'ea', false, { default: 1 }),
      numParam('rodSpacing', '접지봉 간격', 'Spacing between rods', 'm', false),
    ]),
    handler: 'calculateGroundResistance',
    category: 'calculation',
  },

  {
    name: 'calculate_illumination',
    description: '조명 설계 계산을 수행합니다. 광원법(Lumen Method)에 의한 조도 계산 또는 소요 등기구 수를 산출합니다.',
    descriptionEn: 'Calculate illumination using the lumen method. Returns required number of luminaires or achieved illuminance.',
    parameters: Object.fromEntries([
      numParam('roomArea', '실 면적', 'Room area', 'm2'),
      numParam('targetLux', '목표 조도', 'Target illuminance', 'lx'),
      numParam('luminousFlux', '등기구 1개 광속', 'Luminous flux per luminaire', 'lm'),
      numParam('maintenanceFactor', '보수율', 'Maintenance factor', '', true, { min: 0.1, max: 1.0 }),
      numParam('utilizationFactor', '조명률', 'Utilization factor', '', true, { min: 0.1, max: 1.0 }),
    ]),
    handler: 'calculateIllumination',
    category: 'calculation',
  },

  {
    name: 'calculate_load',
    description: '부하 집계를 수행합니다. 개별 부하 합계에 수요율/부등률을 적용하여 최대수요전력을 산출합니다.',
    descriptionEn: 'Aggregate loads with demand and diversity factors to calculate maximum demand.',
    parameters: Object.fromEntries([
      strParam('loads', '부하 목록 (JSON)', 'Load list as JSON array [{name, kW, qty, demandFactor}]'),
      numParam('diversityFactor', '부등률', 'Diversity factor', '', false, { default: 1.0, min: 0.01 }),
      numParam('powerFactor', '역률', 'Power factor', '', false, { default: 0.9, min: 0.01, max: 1.0 }),
    ]),
    handler: 'calculateMaxDemand',
    category: 'calculation',
  },

  {
    name: 'calculate_power_factor',
    description: '역률 개선 계산을 수행합니다. 목표 역률 달성에 필요한 콘덴서 용량(kVar)을 산출합니다.',
    descriptionEn: 'Calculate capacitor bank size required to improve power factor to target value.',
    parameters: Object.fromEntries([
      numParam('activePower', '유효전력', 'Active power', 'kW'),
      numParam('currentPF', '현재 역률', 'Current power factor', '', true, { min: 0.01, max: 0.99 }),
      numParam('targetPF', '목표 역률', 'Target power factor', '', true, { min: 0.01, max: 1.0 }),
    ]),
    handler: 'calculatePowerFactor',
    category: 'calculation',
  },

  // ── Lookup Tools ──────────────────────────────────────────────────────────

  {
    name: 'lookup_code_article',
    description: '전기 관련 기준/규격 조항을 조회합니다. KEC, NEC, IEC 등의 특정 조항 내용을 검색합니다.',
    descriptionEn: 'Look up a specific article/clause from electrical standards (KEC, NEC, IEC, etc.).',
    parameters: Object.fromEntries([
      strParam('standard', '기준 이름', 'Standard name', true),
      strParam('clause', '조항 번호', 'Clause number'),
      strParam('keyword', '검색 키워드', 'Search keyword', false),
      enumParam('country', '국가', 'Country', ['KR', 'US', 'JP', 'CN', 'DE', 'AU'], false),
    ]),
    handler: 'lookupCodeArticle',
    category: 'lookup',
  },

  // ── Conversion Tools ──────────────────────────────────────────────────────

  {
    name: 'convert_unit',
    description: '전기공학 단위를 변환합니다. AWG↔mm2, HP↔kW, kVA↔kW 등을 변환합니다.',
    descriptionEn: 'Convert electrical engineering units: AWG<->mm2, HP<->kW, kVA<->kW, etc.',
    parameters: Object.fromEntries([
      numParam('value', '변환할 값', 'Value to convert', ''),
      strParam('fromUnit', '원래 단위', 'Source unit'),
      strParam('toUnit', '목표 단위', 'Target unit'),
    ]),
    handler: 'convertUnit',
    category: 'conversion',
  },

  // ── Comparison Tools ──────────────────────────────────────────────────────

  {
    name: 'compare_scenarios',
    description: '두 가지 설계 시나리오를 비교합니다. 동일 계산을 서로 다른 입력으로 실행하여 결과를 대조합니다.',
    descriptionEn: 'Compare two design scenarios by running the same calculation with different inputs.',
    parameters: Object.fromEntries([
      strParam('calcId', '계산기 ID', 'Calculator ID to use'),
      strParam('scenarioA', '시나리오 A 입력 (JSON)', 'Scenario A inputs as JSON'),
      strParam('scenarioB', '시나리오 B 입력 (JSON)', 'Scenario B inputs as JSON'),
    ]),
    handler: 'compareScenarios',
    category: 'comparison',
  },

  // ── KEC Structured Query Tools ────────────────────────────────────────────

  {
    name: 'query_ampacity',
    description: 'KEC 허용전류표를 구조화 쿼리합니다. 도체/절연/시공방법/규격으로 정확한 허용전류를 반환합니다.',
    descriptionEn: 'Query KEC ampacity table. Returns exact ampacity for given conductor/insulation/installation/size.',
    parameters: Object.fromEntries([
      numParam('size', '케이블 단면적', 'Cable cross-section', 'mm2'),
      enumParam('conductor', '도체 재질', 'Conductor material', ['Cu', 'Al']),
      enumParam('insulation', '절연 종류', 'Insulation type', ['PVC', 'XLPE', 'MI']),
      enumParam('installation', '시공 방법', 'Installation method', ['conduit', 'tray', 'directBuried', 'freeAir']),
      numParam('ambientTemp', '주위 온도', 'Ambient temperature', 'degC', false, { default: 30 }),
      numParam('groupCount', '밀집 회로 수', 'Number of grouped circuits', 'ea', false, { default: 1 }),
    ]),
    handler: 'queryAmpacity',
    category: 'lookup',
  },

  {
    name: 'find_min_cable_size',
    description: '필요 전류에서 최소 케이블 규격을 역산합니다. KEC 표준 규격 중 허용전류를 만족하는 최소값.',
    descriptionEn: 'Reverse lookup: find minimum KEC standard cable size for required current.',
    parameters: Object.fromEntries([
      numParam('requiredCurrent', '필요 전류', 'Required current', 'A'),
      enumParam('conductor', '도체 재질', 'Conductor material', ['Cu', 'Al']),
      enumParam('insulation', '절연 종류', 'Insulation type', ['PVC', 'XLPE', 'MI']),
      enumParam('installation', '시공 방법', 'Installation method', ['conduit', 'tray', 'directBuried', 'freeAir']),
      numParam('ambientTemp', '주위 온도', 'Ambient temperature', 'degC', false, { default: 30 }),
      numParam('groupCount', '밀집 회로 수', 'Number of grouped circuits', 'ea', false, { default: 1 }),
    ]),
    handler: 'findMinCableSize',
    category: 'lookup',
  },

  {
    name: 'query_breaker_rating',
    description: 'KEC 212.3 기준 차단기 정격 후보를 조회합니다. 부하전류 × 1.25 이상, 전선 허용전류 이하.',
    descriptionEn: 'Query breaker rating candidates per KEC 212.3. Filters by load×1.25 and wire ampacity.',
    parameters: Object.fromEntries([
      numParam('loadCurrent', '부하 전류', 'Load current', 'A'),
      numParam('wireAmpacity', '전선 허용전류', 'Wire ampacity', 'A', false),
    ]),
    handler: 'queryBreakerRating',
    category: 'lookup',
  },

  {
    name: 'query_voltage_drop_judgment',
    description: 'KEC 232.52 전압강하 기준 적합/부적합을 판정합니다.',
    descriptionEn: 'Judge voltage drop compliance per KEC 232.52. Returns PASS/FAIL verdict.',
    parameters: Object.fromEntries([
      numParam('voltageDropPercent', '전압강하율', 'Voltage drop percentage', '%'),
      enumParam('circuitType', '회로 유형', 'Circuit type', ['main', 'branch', 'combined'], false),
    ]),
    handler: 'queryVoltageDrop',
    category: 'lookup',
  },

  // ── Report Tools ──────────────────────────────────────────────────────────

  {
    name: 'generate_report',
    description: '계산 결과 보고서를 생성합니다. 지정된 템플릿에 따라 구조화된 보고서 데이터를 생성합니다.',
    descriptionEn: 'Generate a structured report from calculation receipts using the specified template.',
    parameters: Object.fromEntries([
      enumParam('templateId', '보고서 템플릿', 'Report template', [
        'breaker-schedule', 'load-summary', 'voltage-drop-report',
        'grounding-report', 'cable-schedule', 'substation-report',
        'compliance-checklist', 'comprehensive-report',
      ]),
      strParam('receiptIds', '영수증 ID 목록 (JSON)', 'Receipt IDs as JSON array'),
      enumParam('language', '보고서 언어', 'Report language', ['ko', 'en', 'ja'], false, { default: 'ko' }),
    ]),
    handler: 'generateReport',
    category: 'report',
  },
];

// ---------------------------------------------------------------------------
// PART 2 — Tool Lookup
// ---------------------------------------------------------------------------

const toolMap = new Map<string, ESATool>(
  ESVA_TOOLS.map(t => [t.name, t]),
);

/** Get a tool definition by name. Returns null if not found. */
export function getToolByName(name: string): ESATool | null {
  return toolMap.get(name) ?? null;
}

/** Get all tools in a specific category */
export function getToolsByCategory(category: ESATool['category']): ESATool[] {
  return ESVA_TOOLS.filter(t => t.category === category);
}

/** Get tool names as a simple string list (for system prompt injection) */
export function getToolNameList(): string[] {
  return ESVA_TOOLS.map(t => t.name);
}

// ---------------------------------------------------------------------------
// PART 3 — Vercel AI SDK Adapter
// ---------------------------------------------------------------------------

/**
 * Convert ESVA tool definitions to Vercel AI SDK `tools` object format.
 * Each tool becomes { description, parameters: zodSchema, execute }.
 *
 * Note: Actual Zod schema construction requires the `zod` package at runtime.
 * This function produces a plain object description that can be used with
 * the Vercel AI SDK's `tool()` helper or passed as JSON schema.
 */
export function toVercelToolsSchema(): Record<string, {
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}> {
  const result: Record<string, {
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  }> = {};

  for (const tool of ESVA_TOOLS) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(tool.parameters)) {
      const prop: Record<string, unknown> = {
        description: `${param.description} / ${param.descriptionEn}${param.unit ? ` (${param.unit})` : ''}`,
      };

      if (param.type === 'number') {
        prop.type = 'number';
        if (param.min !== undefined) prop.minimum = param.min;
        if (param.max !== undefined) prop.maximum = param.max;
      } else if (param.type === 'enum') {
        prop.type = 'string';
        prop.enum = param.enumValues;
      } else {
        prop.type = 'string';
      }

      if (param.default !== undefined) {
        prop.default = param.default;
      }

      properties[key] = prop;

      if (param.required) {
        required.push(key);
      }
    }

    result[tool.name] = {
      description: `${tool.description}\n${tool.descriptionEn}`,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    };
  }

  return result;
}
