/**
 * Report Templates — Standard Engineering Report Formats
 *
 * Pre-defined templates for generating structured reports from
 * ESVA calculation receipts. Each template maps to a specific
 * engineering deliverable.
 *
 * PART 1: Type definitions
 * PART 2: Template definitions (8 templates)
 * PART 3: Template lookup
 * PART 4: Report data generation
 */

import type { Receipt } from '../receipt/types';

// ---------------------------------------------------------------------------
// PART 1 — Type Definitions
// ---------------------------------------------------------------------------

/** Section type within a report */
export type ReportSectionType =
  | 'meta'
  | 'inputs'
  | 'calculation'
  | 'result'
  | 'judgment'
  | 'comparison'
  | 'disclaimer';

/** A single section within a report template */
export interface ReportSection {
  /** Section title (supports {{variable}} interpolation) */
  title: string;
  /** Section type determines rendering logic */
  type: ReportSectionType;
  /** Template string with {{variable}} placeholders */
  template: string;
}

/** Complete report template definition */
export interface ReportTemplate {
  /** Unique template identifier */
  id: string;
  /** Display name (Korean) */
  name_ko: string;
  /** Display name (English) */
  name_en: string;
  /** Ordered sections */
  sections: ReportSection[];
  /** Calculator IDs whose receipts can populate this template */
  applicableCalcs: string[];
}

/** Generated report data ready for rendering */
export interface ReportData {
  /** Template used */
  templateId: string;
  /** Report title */
  title: string;
  /** Generation timestamp (ISO-8601) */
  generatedAt: string;
  /** Applied standard and version */
  standard: { name: string; version: string };
  /** Filled sections */
  sections: FilledSection[];
  /** Receipts used */
  receiptIds: string[];
}

/** A section filled with actual data */
export interface FilledSection {
  title: string;
  type: ReportSectionType;
  content: string;
  /** Raw data for programmatic access */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// PART 2 — Template Definitions
// ---------------------------------------------------------------------------

const TEMPLATES: ReportTemplate[] = [
  // ── 1. Breaker Schedule (차단기 스케줄표) ─────────────────────────────
  {
    id: 'breaker-schedule',
    name_ko: '차단기 스케줄표',
    name_en: 'Breaker Schedule',
    applicableCalcs: ['breaker-sizing', 'short-circuit'],
    sections: [
      {
        title: '프로젝트 정보 / Project Information',
        type: 'meta',
        template: '프로젝트: {{projectId}}\n기준: {{appliedStandard}} ({{standardVersion}})\n작성일: {{calculatedAt}}\n엔진: ESVA {{engineVersion}}',
      },
      {
        title: '차단기 선정 입력 / Breaker Selection Inputs',
        type: 'inputs',
        template: '| 항목 | 값 | 단위 |\n|------|------|------|\n{{#inputs}}| {{label}} | {{value}} | {{unit}} |\n{{/inputs}}',
      },
      {
        title: '차단기 선정 결과 / Breaker Selection Results',
        type: 'result',
        template: '| 패널 | 부하전류(A) | 차단기정격(A) | 차단용량(kA) | 판정 |\n|------|------------|-------------|------------|------|\n{{#results}}| {{panel}} | {{loadCurrent}} | {{breakerRating}} | {{breakingCapacity}} | {{judgment}} |\n{{/results}}',
      },
      {
        title: '판정 / Judgment',
        type: 'judgment',
        template: '{{#judgments}}[{{status}}] {{message}} ({{standardRef}})\n{{/judgments}}',
      },
      {
        title: '면책 조항 / Disclaimer',
        type: 'disclaimer',
        template: '{{disclaimerText}}',
      },
    ],
  },

  // ── 2. Load Summary (부하 집계표) ─────────────────────────────────────
  {
    id: 'load-summary',
    name_ko: '부하 집계표',
    name_en: 'Load Summary',
    applicableCalcs: ['max-demand', 'demand-diversity', 'single-phase-power', 'three-phase-power'],
    sections: [
      {
        title: '프로젝트 정보 / Project Information',
        type: 'meta',
        template: '프로젝트: {{projectId}}\n기준: {{appliedStandard}} ({{standardVersion}})\n작성일: {{calculatedAt}}',
      },
      {
        title: '부하 목록 / Load List',
        type: 'inputs',
        template: '| No. | 부하명 | 용량(kW) | 수량 | 수요율 | 수요전력(kW) |\n|-----|--------|---------|------|--------|-------------|\n{{#loads}}| {{no}} | {{name}} | {{kW}} | {{qty}} | {{demandFactor}} | {{demandkW}} |\n{{/loads}}',
      },
      {
        title: '집계 결과 / Aggregation Results',
        type: 'result',
        template: '설비용량 합계: {{totalConnected}} kW\n수요전력 합계: {{totalDemand}} kW\n부등률 적용: {{diversityFactor}}\n최대수요전력: {{maxDemand}} kW\n피상전력: {{apparentPower}} kVA',
      },
      {
        title: '면책 조항 / Disclaimer',
        type: 'disclaimer',
        template: '{{disclaimerText}}',
      },
    ],
  },

  // ── 3. Voltage Drop Report (전압강하 계산서) ──────────────────────────
  {
    id: 'voltage-drop-report',
    name_ko: '전압강하 계산서',
    name_en: 'Voltage Drop Report',
    applicableCalcs: ['voltage-drop', 'three-phase-vd', 'complex-voltage-drop', 'busbar-vd'],
    sections: [
      {
        title: '프로젝트 정보 / Project Information',
        type: 'meta',
        template: '프로젝트: {{projectId}}\n기준: {{appliedStandard}} ({{standardVersion}})\n작성일: {{calculatedAt}}\n엔진: ESVA {{engineVersion}}',
      },
      {
        title: '계산 입력 / Calculation Inputs',
        type: 'inputs',
        template: '| 항목 | 값 | 단위 |\n|------|------|------|\n{{#inputs}}| {{label}} | {{value}} | {{unit}} |\n{{/inputs}}',
      },
      {
        title: '계산 과정 / Calculation Steps',
        type: 'calculation',
        template: '{{#steps}}**Step {{step}}: {{title}}**\n$${{formula}}$$\n= {{value}} {{unit}}{{#standardRef}} ({{standardRef}}){{/standardRef}}\n\n{{/steps}}',
      },
      {
        title: '결과 / Result',
        type: 'result',
        template: '전압강하: {{voltageDropV}} V ({{voltageDropPct}}%)\n허용치: {{dropLimit}}%\n판정: {{judgment}}',
      },
      {
        title: '판정 / Judgment',
        type: 'judgment',
        template: '{{#pass}}[PASS] 전압강하 {{voltageDropPct}}% <= {{dropLimit}}% (적합){{/pass}}{{#fail}}[FAIL] 전압강하 {{voltageDropPct}}% > {{dropLimit}}% (부적합 — 케이블 증대 필요){{/fail}}',
      },
      {
        title: '면책 조항 / Disclaimer',
        type: 'disclaimer',
        template: '{{disclaimerText}}',
      },
    ],
  },

  // ── 4. Grounding Report (접지 계산서) ─────────────────────────────────
  {
    id: 'grounding-report',
    name_ko: '접지 계산서',
    name_en: 'Grounding Report',
    applicableCalcs: ['ground-resistance', 'ground-conductor', 'equipotential-bonding', 'lightning-protection'],
    sections: [
      {
        title: '프로젝트 정보 / Project Information',
        type: 'meta',
        template: '프로젝트: {{projectId}}\n기준: {{appliedStandard}} ({{standardVersion}})\n작성일: {{calculatedAt}}',
      },
      {
        title: '접지 설계 입력 / Grounding Design Inputs',
        type: 'inputs',
        template: '| 항목 | 값 | 단위 |\n|------|------|------|\n{{#inputs}}| {{label}} | {{value}} | {{unit}} |\n{{/inputs}}',
      },
      {
        title: '계산 과정 / Calculation Steps',
        type: 'calculation',
        template: '{{#steps}}**Step {{step}}: {{title}}**\n$${{formula}}$$\n= {{value}} {{unit}}\n\n{{/steps}}',
      },
      {
        title: '접지 저항 결과 / Ground Resistance Result',
        type: 'result',
        template: '접지 저항: {{groundResistance}} Ohm\n허용치: {{resistanceLimit}} Ohm\n접지봉 수량: {{rodCount}}개\n판정: {{judgment}}',
      },
      {
        title: '면책 조항 / Disclaimer',
        type: 'disclaimer',
        template: '{{disclaimerText}}',
      },
    ],
  },

  // ── 5. Cable Schedule (케이블 스케줄표) ────────────────────────────────
  {
    id: 'cable-schedule',
    name_ko: '케이블 스케줄표',
    name_en: 'Cable Schedule',
    applicableCalcs: ['cable-sizing', 'cable-impedance', 'ampacity-compare'],
    sections: [
      {
        title: '프로젝트 정보 / Project Information',
        type: 'meta',
        template: '프로젝트: {{projectId}}\n기준: {{appliedStandard}} ({{standardVersion}})\n작성일: {{calculatedAt}}',
      },
      {
        title: '케이블 스케줄 / Cable Schedule',
        type: 'result',
        template: '| 회로 | 부하(A) | 케이블규격 | 허용전류(A) | 길이(m) | VD(%) | 판정 |\n|------|--------|-----------|-----------|---------|-------|------|\n{{#cables}}| {{circuit}} | {{loadA}} | {{cableSpec}} | {{ampacity}} | {{length}} | {{vdPct}} | {{judgment}} |\n{{/cables}}',
      },
      {
        title: '면책 조항 / Disclaimer',
        type: 'disclaimer',
        template: '{{disclaimerText}}',
      },
    ],
  },

  // ── 6. Substation Report (수변전 용량 계산서) ─────────────────────────
  {
    id: 'substation-report',
    name_ko: '수변전 용량 계산서',
    name_en: 'Substation Capacity Report',
    applicableCalcs: ['transformer-capacity', 'transformer-loss', 'transformer-efficiency', 'substation-capacity', 'ct-sizing', 'vt-sizing'],
    sections: [
      {
        title: '프로젝트 정보 / Project Information',
        type: 'meta',
        template: '프로젝트: {{projectId}}\n기준: {{appliedStandard}} ({{standardVersion}})\n작성일: {{calculatedAt}}',
      },
      {
        title: '부하 집계 / Load Summary',
        type: 'inputs',
        template: '총 설비용량: {{totalLoad}} kW\n수요율: {{demandFactor}}\n역률: {{powerFactor}}\n성장여유: {{growthPercent}}%',
      },
      {
        title: '변압기 선정 / Transformer Selection',
        type: 'result',
        template: '필요 용량: {{requiredKVA}} kVA\n선정 용량: {{selectedKVA}} kVA\n여유율: {{marginPct}}%\n변압기 효율: {{efficiency}}%\n무부하 손실: {{noLoadLoss}} W\n부하 손실: {{loadLoss}} W',
      },
      {
        title: '보호 기기 / Protection Equipment',
        type: 'result',
        template: 'CT 비: {{ctRatio}}\nVT 비: {{vtRatio}}\n차단기 정격: {{breakerRating}} A\n차단 용량: {{breakingCapacity}} kA',
      },
      {
        title: '면책 조항 / Disclaimer',
        type: 'disclaimer',
        template: '{{disclaimerText}}',
      },
    ],
  },

  // ── 7. Compliance Checklist (규격 적합성 체크리스트) ───────────────────
  {
    id: 'compliance-checklist',
    name_ko: '규격 적합성 체크리스트',
    name_en: 'Compliance Checklist',
    applicableCalcs: [
      'voltage-drop', 'cable-sizing', 'breaker-sizing', 'short-circuit',
      'ground-resistance', 'transformer-capacity',
    ],
    sections: [
      {
        title: '프로젝트 정보 / Project Information',
        type: 'meta',
        template: '프로젝트: {{projectId}}\n기준: {{appliedStandard}} ({{standardVersion}})\n검토일: {{calculatedAt}}',
      },
      {
        title: '적합성 검토 결과 / Compliance Review',
        type: 'judgment',
        template: '| No. | 검토 항목 | 기준 조항 | 계산 결과 | 허용 기준 | 판정 |\n|-----|---------|---------|---------|---------|------|\n{{#checks}}| {{no}} | {{item}} | {{clause}} | {{result}} | {{limit}} | {{judgment}} |\n{{/checks}}',
      },
      {
        title: '종합 판정 / Overall Judgment',
        type: 'result',
        template: '총 {{totalChecks}}건 중 적합 {{passCount}}건, 부적합 {{failCount}}건\n종합 판정: {{overallJudgment}}',
      },
      {
        title: '면책 조항 / Disclaimer',
        type: 'disclaimer',
        template: '{{disclaimerText}}',
      },
    ],
  },

  // ── 8. Comprehensive Report (종합 설계 보고서) ────────────────────────
  {
    id: 'comprehensive-report',
    name_ko: '종합 설계 보고서',
    name_en: 'Comprehensive Design Report',
    applicableCalcs: [
      'voltage-drop', 'cable-sizing', 'breaker-sizing', 'short-circuit',
      'ground-resistance', 'transformer-capacity', 'max-demand',
      'power-factor', 'single-phase-power', 'three-phase-power',
    ],
    sections: [
      {
        title: '프로젝트 개요 / Project Overview',
        type: 'meta',
        template: '프로젝트: {{projectId}}\n기준: {{appliedStandard}} ({{standardVersion}})\n작성일: {{calculatedAt}}\n엔진: ESVA {{engineVersion}}\n\n본 보고서는 ESVA 전기 설계 엔진에 의해 자동 생성되었습니다.',
      },
      {
        title: '부하 집계 / Load Summary',
        type: 'inputs',
        template: '{{#hasLoadSummary}}설비용량: {{totalConnected}} kW\n최대수요전력: {{maxDemand}} kW\n변압기 용량: {{transformerKVA}} kVA{{/hasLoadSummary}}{{^hasLoadSummary}}(해당 계산 없음){{/hasLoadSummary}}',
      },
      {
        title: '케이블 및 전압강하 / Cable & Voltage Drop',
        type: 'calculation',
        template: '{{#hasVD}}{{#cables}}회로 {{circuit}}: {{cableSpec}} — VD {{vdPct}}% ({{judgment}})\n{{/cables}}{{/hasVD}}{{^hasVD}}(해당 계산 없음){{/hasVD}}',
      },
      {
        title: '보호 협조 / Protection Coordination',
        type: 'result',
        template: '{{#hasProtection}}{{#breakers}}패널 {{panel}}: {{breakerRating}}A / {{breakingCapacity}}kA ({{judgment}})\n{{/breakers}}{{/hasProtection}}{{^hasProtection}}(해당 계산 없음){{/hasProtection}}',
      },
      {
        title: '접지 / Grounding',
        type: 'result',
        template: '{{#hasGrounding}}접지 저항: {{groundResistance}} Ohm ({{judgment}}){{/hasGrounding}}{{^hasGrounding}}(해당 계산 없음){{/hasGrounding}}',
      },
      {
        title: '적합성 요약 / Compliance Summary',
        type: 'comparison',
        template: '| 항목 | 결과 | 판정 |\n|------|------|------|\n{{#summary}}| {{item}} | {{result}} | {{judgment}} |\n{{/summary}}',
      },
      {
        title: '면책 조항 / Disclaimer',
        type: 'disclaimer',
        template: '{{disclaimerText}}\n\n본 보고서의 모든 수치는 ESVA 엔진의 계산 결과이며, 최종 설계는 자격있는 전기기술자의 검증을 받아야 합니다.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// PART 3 — Template Lookup
// ---------------------------------------------------------------------------

const templateMap = new Map<string, ReportTemplate>(
  TEMPLATES.map(t => [t.id, t]),
);

/** Get a report template by ID. Returns undefined if not found. */
export function getTemplate(id: string): ReportTemplate | undefined {
  return templateMap.get(id);
}

/** Get all available template IDs */
export function getTemplateIds(): string[] {
  return TEMPLATES.map(t => t.id);
}

/** Get templates applicable to a given calculator ID */
export function getTemplatesForCalc(calcId: string): ReportTemplate[] {
  return TEMPLATES.filter(t => t.applicableCalcs.includes(calcId));
}

// ---------------------------------------------------------------------------
// PART 4 — Report Data Generation
// ---------------------------------------------------------------------------

/**
 * Simple mustache-like template interpolation.
 * Supports {{variable}} replacement from a data object.
 * Does NOT support sections ({{#}}/{{/}}) — those are left for the renderer.
 */
function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = data[key];
    if (val === undefined || val === null) return match; // leave placeholder
    return String(val);
  });
}

/**
 * Generate report data by filling a template with actual receipt data.
 *
 * @param template - Report template to fill
 * @param receipts - Calculation receipts to draw data from
 * @returns Filled report data ready for rendering
 */
export function generateReportData(
  template: ReportTemplate,
  receipts: Receipt[],
): ReportData {
  if (receipts.length === 0) {
    throw new Error('At least one receipt is required to generate a report');
  }

  // Build merged data context from all receipts
  const firstReceipt = receipts[0];
  const mergedData: Record<string, unknown> = {
    projectId: firstReceipt.projectId ?? 'N/A',
    appliedStandard: firstReceipt.appliedStandard,
    standardVersion: firstReceipt.standardVersion,
    calculatedAt: firstReceipt.calculatedAt,
    engineVersion: firstReceipt.engineVersion,
    disclaimerText: firstReceipt.disclaimerText,
  };

  // Merge all inputs from all receipts
  for (const receipt of receipts) {
    for (const [key, val] of Object.entries(receipt.inputs)) {
      mergedData[key] = val;
    }
    // Add result values
    if (receipt.result.value !== null) {
      mergedData[`${receipt.calcId}_value`] = receipt.result.value;
      mergedData[`${receipt.calcId}_unit`] = receipt.result.unit;
    }
    if (receipt.result.judgment) {
      mergedData[`${receipt.calcId}_judgment`] = receipt.result.judgment.pass ? 'PASS' : 'FAIL';
      mergedData[`${receipt.calcId}_judgment_msg`] = receipt.result.judgment.message;
    }
  }

  // Fill sections
  const filledSections: FilledSection[] = template.sections.map(section => {
    const content = interpolate(section.template, mergedData);
    return {
      title: section.title,
      type: section.type,
      content,
      data: section.type === 'meta' ? mergedData : undefined,
    };
  });

  // Determine overall standard
  const standards = [...new Set(receipts.map(r => r.appliedStandard))];
  const versions = [...new Set(receipts.map(r => r.standardVersion))];

  return {
    templateId: template.id,
    title: template.name_ko,
    generatedAt: new Date().toISOString(),
    standard: {
      name: standards.join(', '),
      version: versions.join(', '),
    },
    sections: filledSections,
    receiptIds: receipts.map(r => r.id),
  };
}
