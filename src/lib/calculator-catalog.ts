/**
 * 계산기 분야·난이도 카탈로그 — 화면들이 공유하는 정본.
 *
 * 이 표가 /calc 페이지 안에만 있었고, 계산 기록(/history)은 10종짜리 자체
 * 표를 따로 들고 있었다. 그래서 나머지 47종은 분야가 'other' 로 빠졌고,
 * 필터 목록에는 조명·전동기·수변전·글로벌 분야가 아예 없어서 그 계산들을
 * 걸러낼 방법이 없었다(실측 2026-07-26: 조도 계산 기록이 어느 필터에도
 * 걸리지 않는다).
 *
 * 이름은 CALCULATOR_NAMES 가 정본이다. 여기는 분야·난이도만 둔다.
 */

export type CalcCategoryId =
  | 'power'
  | 'voltage-drop'
  | 'cable'
  | 'transformer'
  | 'protection'
  | 'grounding'
  | 'motor'
  | 'renewable'
  | 'substation'
  | 'lighting'
  | 'global'
  | 'ai';

export const CALC_CATEGORY_LABELS: Record<CalcCategoryId, string> = {
  'power': '전력기초',
  'voltage-drop': '전압강하',
  'cable': '케이블',
  'transformer': '변압기',
  'protection': '보호협조',
  'grounding': '접지',
  'motor': '전동기',
  'renewable': '신재생/ESS',
  'substation': '수변전',
  'lighting': '조명',
  'global': '글로벌',
  'ai': 'AI특화',
};

export type CalcDifficulty = 'basic' | 'intermediate' | 'advanced';

export const CALCULATOR_CATALOG: Record<string, { category: CalcCategoryId; difficulty: CalcDifficulty }> = {
  'single-phase-power': { category: 'power', difficulty: 'basic' },
  'three-phase-power': { category: 'power', difficulty: 'basic' },
  'power-factor': { category: 'power', difficulty: 'basic' },
  'reactive-power': { category: 'power', difficulty: 'intermediate' },
  'demand-diversity': { category: 'power', difficulty: 'intermediate' },
  'max-demand': { category: 'power', difficulty: 'intermediate' },
  'power-loss': { category: 'power', difficulty: 'advanced' },
  'voltage-drop': { category: 'voltage-drop', difficulty: 'intermediate' },
  'three-phase-vd': { category: 'voltage-drop', difficulty: 'intermediate' },
  'complex-voltage-drop': { category: 'voltage-drop', difficulty: 'advanced' },
  'busbar-vd': { category: 'voltage-drop', difficulty: 'advanced' },
  'country-compare-vd': { category: 'voltage-drop', difficulty: 'advanced' },
  'cable-sizing': { category: 'cable', difficulty: 'advanced' },
  'awg-converter': { category: 'cable', difficulty: 'basic' },
  'ampacity-compare': { category: 'cable', difficulty: 'intermediate' },
  'cable-impedance': { category: 'cable', difficulty: 'intermediate' },
  'transformer-capacity': { category: 'transformer', difficulty: 'intermediate' },
  'transformer-loss': { category: 'transformer', difficulty: 'intermediate' },
  'transformer-efficiency': { category: 'transformer', difficulty: 'intermediate' },
  'impedance-voltage': { category: 'transformer', difficulty: 'intermediate' },
  'inrush-current': { category: 'transformer', difficulty: 'advanced' },
  'parallel-operation': { category: 'transformer', difficulty: 'advanced' },
  'short-circuit': { category: 'protection', difficulty: 'advanced' },
  'breaker-sizing': { category: 'protection', difficulty: 'intermediate' },
  'earth-fault': { category: 'protection', difficulty: 'advanced' },
  'rcd-sizing': { category: 'protection', difficulty: 'intermediate' },
  'relay-basic': { category: 'protection', difficulty: 'advanced' },
  'arc-flash': { category: 'protection', difficulty: 'advanced' },
  'ground-resistance': { category: 'grounding', difficulty: 'intermediate' },
  'ground-conductor': { category: 'grounding', difficulty: 'intermediate' },
  'equipotential-bonding': { category: 'grounding', difficulty: 'advanced' },
  'lightning-protection': { category: 'grounding', difficulty: 'advanced' },
  'motor-capacity': { category: 'motor', difficulty: 'intermediate' },
  'starting-current': { category: 'motor', difficulty: 'intermediate' },
  'motor-efficiency': { category: 'motor', difficulty: 'intermediate' },
  'inverter-capacity': { category: 'motor', difficulty: 'intermediate' },
  'motor-pf-correction': { category: 'motor', difficulty: 'advanced' },
  'braking-resistor': { category: 'motor', difficulty: 'advanced' },
  'solar-generation': { category: 'renewable', difficulty: 'basic' },
  'battery-capacity': { category: 'renewable', difficulty: 'basic' },
  'solar-cable': { category: 'renewable', difficulty: 'intermediate' },
  'pcs-capacity': { category: 'renewable', difficulty: 'intermediate' },
  'grid-connect': { category: 'renewable', difficulty: 'intermediate' },
  'substation-capacity': { category: 'substation', difficulty: 'intermediate' },
  'ct-sizing': { category: 'substation', difficulty: 'intermediate' },
  'vt-sizing': { category: 'substation', difficulty: 'intermediate' },
  'surge-arrester': { category: 'substation', difficulty: 'intermediate' },
  'illuminance': { category: 'lighting', difficulty: 'basic' },
  'energy-saving': { category: 'lighting', difficulty: 'basic' },
  'ups-capacity': { category: 'lighting', difficulty: 'intermediate' },
  'emergency-generator': { category: 'lighting', difficulty: 'intermediate' },
  'temp-correction': { category: 'global', difficulty: 'basic' },
  'ampacity-global-compare': { category: 'global', difficulty: 'intermediate' },
  'awg-converter-full': { category: 'global', difficulty: 'basic' },
  'frequency-compare': { category: 'global', difficulty: 'basic' },
  'nec-load-calc': { category: 'global', difficulty: 'intermediate' },
  'token-cost': { category: 'ai', difficulty: 'basic' },
};
