/**
 * Unit Price Database
 * -------------------
 * 전기 자재/시공 단가표. 2024년 기준 국내 시장가 참조.
 * 출처: 대한전기협회 표준품셈, 한전 단가표, 주요 제조사 리스트프라이스.
 *
 * PART 1: Material prices (자재)
 * PART 2: Labor costs (노무비)
 * PART 3: Price lookup API
 * PART 4: Project cost estimator
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Material Prices (자재 단가)
// ═══════════════════════════════════════════════════════════════════════════════

export interface UnitPriceEntry {
  id: string;
  category: string;
  name: string;
  nameKo: string;
  spec: string;
  unit: string;           // '개', 'm', 'kVA', 'set'
  priceKRW: number;       // 원
  manufacturer?: string;
  lastUpdated: string;    // YYYY-MM
  note?: string;
}

const MATERIAL_PRICES: UnitPriceEntry[] = [
  // === 케이블 (per meter) ===
  { id: 'MAT-C-001', category: 'cable', name: 'HIV 2.5sq', nameKo: 'HIV 2.5sq 전선', spec: '600V HIV 2.5mm²', unit: 'm', priceKRW: 850, lastUpdated: '2024-06', note: 'Cu' },
  { id: 'MAT-C-002', category: 'cable', name: 'HIV 4sq', nameKo: 'HIV 4sq 전선', spec: '600V HIV 4mm²', unit: 'm', priceKRW: 1200, lastUpdated: '2024-06' },
  { id: 'MAT-C-003', category: 'cable', name: 'HIV 6sq', nameKo: 'HIV 6sq 전선', spec: '600V HIV 6mm²', unit: 'm', priceKRW: 1800, lastUpdated: '2024-06' },
  { id: 'MAT-C-004', category: 'cable', name: 'HIV 10sq', nameKo: 'HIV 10sq 전선', spec: '600V HIV 10mm²', unit: 'm', priceKRW: 2900, lastUpdated: '2024-06' },
  { id: 'MAT-C-005', category: 'cable', name: 'HIV 16sq', nameKo: 'HIV 16sq 전선', spec: '600V HIV 16mm²', unit: 'm', priceKRW: 4500, lastUpdated: '2024-06' },
  { id: 'MAT-C-006', category: 'cable', name: 'HIV 25sq', nameKo: 'HIV 25sq 전선', spec: '600V HIV 25mm²', unit: 'm', priceKRW: 7200, lastUpdated: '2024-06' },
  { id: 'MAT-C-007', category: 'cable', name: 'HIV 35sq', nameKo: 'HIV 35sq 전선', spec: '600V HIV 35mm²', unit: 'm', priceKRW: 9800, lastUpdated: '2024-06' },
  { id: 'MAT-C-008', category: 'cable', name: 'HIV 50sq', nameKo: 'HIV 50sq 전선', spec: '600V HIV 50mm²', unit: 'm', priceKRW: 13500, lastUpdated: '2024-06' },
  { id: 'MAT-C-010', category: 'cable', name: 'XLPE 6sq 3C', nameKo: 'XLPE 6sq 3C 케이블', spec: '0.6/1kV XLPE 3C 6mm²', unit: 'm', priceKRW: 5800, lastUpdated: '2024-06' },
  { id: 'MAT-C-011', category: 'cable', name: 'XLPE 10sq 3C', nameKo: 'XLPE 10sq 3C 케이블', spec: '0.6/1kV XLPE 3C 10mm²', unit: 'm', priceKRW: 8200, lastUpdated: '2024-06' },
  { id: 'MAT-C-012', category: 'cable', name: 'XLPE 25sq 3C', nameKo: 'XLPE 25sq 3C 케이블', spec: '0.6/1kV XLPE 3C 25mm²', unit: 'm', priceKRW: 18500, lastUpdated: '2024-06' },
  { id: 'MAT-C-013', category: 'cable', name: 'XLPE 50sq 3C', nameKo: 'XLPE 50sq 3C 케이블', spec: '0.6/1kV XLPE 3C 50mm²', unit: 'm', priceKRW: 32000, lastUpdated: '2024-06' },
  { id: 'MAT-C-014', category: 'cable', name: 'XLPE 95sq 3C', nameKo: 'XLPE 95sq 3C 케이블', spec: '0.6/1kV XLPE 3C 95mm²', unit: 'm', priceKRW: 58000, lastUpdated: '2024-06' },

  // === 전선관 (per meter) ===
  { id: 'MAT-CD-001', category: 'conduit', name: 'EMT 16mm', nameKo: 'EMT 전선관 16mm', spec: 'EMT φ16', unit: 'm', priceKRW: 1200, lastUpdated: '2024-06' },
  { id: 'MAT-CD-002', category: 'conduit', name: 'EMT 22mm', nameKo: 'EMT 전선관 22mm', spec: 'EMT φ22', unit: 'm', priceKRW: 1600, lastUpdated: '2024-06' },
  { id: 'MAT-CD-003', category: 'conduit', name: 'EMT 28mm', nameKo: 'EMT 전선관 28mm', spec: 'EMT φ28', unit: 'm', priceKRW: 2200, lastUpdated: '2024-06' },
  { id: 'MAT-CD-004', category: 'conduit', name: 'EMT 36mm', nameKo: 'EMT 전선관 36mm', spec: 'EMT φ36', unit: 'm', priceKRW: 3000, lastUpdated: '2024-06' },
  { id: 'MAT-CD-005', category: 'conduit', name: 'Cable Tray 200mm', nameKo: '케이블트레이 200mm', spec: '200W × 100H', unit: 'm', priceKRW: 15000, lastUpdated: '2024-06' },
  { id: 'MAT-CD-006', category: 'conduit', name: 'Cable Tray 400mm', nameKo: '케이블트레이 400mm', spec: '400W × 100H', unit: 'm', priceKRW: 22000, lastUpdated: '2024-06' },

  // === 차단기 (per unit) ===
  { id: 'MAT-BR-001', category: 'breaker', name: 'MCCB 30A', nameKo: 'MCCB 30A 3P', spec: '3P 30AF/30AT', unit: '개', priceKRW: 45000, manufacturer: 'LS일렉트릭', lastUpdated: '2024-06' },
  { id: 'MAT-BR-002', category: 'breaker', name: 'MCCB 50A', nameKo: 'MCCB 50A 3P', spec: '3P 50AF/50AT', unit: '개', priceKRW: 55000, manufacturer: 'LS일렉트릭', lastUpdated: '2024-06' },
  { id: 'MAT-BR-003', category: 'breaker', name: 'MCCB 100A', nameKo: 'MCCB 100A 3P', spec: '3P 100AF/100AT', unit: '개', priceKRW: 85000, manufacturer: 'LS일렉트릭', lastUpdated: '2024-06' },
  { id: 'MAT-BR-004', category: 'breaker', name: 'MCCB 200A', nameKo: 'MCCB 200A 3P', spec: '3P 225AF/200AT', unit: '개', priceKRW: 145000, manufacturer: 'LS일렉트릭', lastUpdated: '2024-06' },
  { id: 'MAT-BR-005', category: 'breaker', name: 'MCCB 400A', nameKo: 'MCCB 400A 3P', spec: '3P 400AF/400AT', unit: '개', priceKRW: 350000, manufacturer: 'LS일렉트릭', lastUpdated: '2024-06' },
  { id: 'MAT-BR-006', category: 'breaker', name: 'ELCB 30A', nameKo: 'ELCB 30A 3P', spec: '3P 30A/30mA', unit: '개', priceKRW: 65000, lastUpdated: '2024-06' },
  { id: 'MAT-BR-007', category: 'breaker', name: 'ACB 800A', nameKo: 'ACB 800A', spec: '3P 800AF/800AT', unit: '개', priceKRW: 2800000, manufacturer: 'LS일렉트릭', lastUpdated: '2024-06' },
  { id: 'MAT-BR-008', category: 'breaker', name: 'VCB 630A', nameKo: 'VCB 630A 25.8kV', spec: '25.8kV 630A 25kA', unit: '개', priceKRW: 8500000, lastUpdated: '2024-06' },

  // === 변압기 (per unit) ===
  { id: 'MAT-TR-001', category: 'transformer', name: 'Dry TR 300kVA', nameKo: '건식변압기 300kVA', spec: '22.9kV/380V 300kVA', unit: '대', priceKRW: 15000000, lastUpdated: '2024-06' },
  { id: 'MAT-TR-002', category: 'transformer', name: 'Dry TR 500kVA', nameKo: '건식변압기 500kVA', spec: '22.9kV/380V 500kVA', unit: '대', priceKRW: 22000000, lastUpdated: '2024-06' },
  { id: 'MAT-TR-003', category: 'transformer', name: 'Dry TR 1000kVA', nameKo: '건식변압기 1000kVA', spec: '22.9kV/380V 1000kVA', unit: '대', priceKRW: 38000000, lastUpdated: '2024-06' },
  { id: 'MAT-TR-004', category: 'transformer', name: 'Oil TR 500kVA', nameKo: '유입변압기 500kVA', spec: '22.9kV/380V 500kVA ONAN', unit: '대', priceKRW: 16000000, lastUpdated: '2025-01' },
  { id: 'MAT-TR-005', category: 'transformer', name: 'Oil TR 1000kVA', nameKo: '유입변압기 1000kVA', spec: '22.9kV/380V 1000kVA ONAN', unit: '대', priceKRW: 28000000, lastUpdated: '2025-01' },
  { id: 'MAT-TR-006', category: 'transformer', name: 'Oil TR 2000kVA', nameKo: '유입변압기 2000kVA', spec: '22.9kV/380V 2000kVA ONAN', unit: '대', priceKRW: 48000000, lastUpdated: '2025-01' },
  { id: 'MAT-TR-007', category: 'transformer', name: 'Dry TR 2000kVA', nameKo: '건식변압기 2000kVA', spec: '22.9kV/380V 2000kVA', unit: '대', priceKRW: 65000000, lastUpdated: '2025-01' },

  // === EV 충전기 ===
  { id: 'MAT-EV-001', category: 'ev_charger', name: 'EV Charger 7kW', nameKo: 'EV 완속충전기 7kW', spec: 'AC 7kW 1구 Type2', unit: '대', priceKRW: 2500000, lastUpdated: '2025-01' },
  { id: 'MAT-EV-002', category: 'ev_charger', name: 'EV Fast Charger 50kW', nameKo: 'EV 급속충전기 50kW', spec: 'DC 50kW CCS2+CHAdeMO', unit: '대', priceKRW: 35000000, lastUpdated: '2025-01' },

  // === 태양광 ===
  { id: 'MAT-PV-001', category: 'renewable', name: 'PV Module 550W', nameKo: '태양광 모듈 550W', spec: 'Mono PERC 550Wp', unit: '장', priceKRW: 180000, lastUpdated: '2025-01' },
  { id: 'MAT-PV-002', category: 'renewable', name: 'PV Inverter 50kW', nameKo: '태양광 인버터 50kW', spec: '3상 50kW 계통연계', unit: '대', priceKRW: 8500000, lastUpdated: '2025-01' },

  // === UPS / ESS ===
  { id: 'MAT-UPS-001', category: 'ups', name: 'UPS 10kVA', nameKo: 'UPS 10kVA', spec: 'Online 10kVA 3상', unit: '대', priceKRW: 6500000, lastUpdated: '2025-01' },
  { id: 'MAT-ESS-001', category: 'ess', name: 'ESS Battery 100kWh', nameKo: 'ESS 배터리 100kWh', spec: 'LiFePO4 100kWh', unit: '세트', priceKRW: 85000000, lastUpdated: '2025-01' },

  // === 분전반 / 수배전반 (per unit) ===
  { id: 'MAT-PN-001', category: 'panel', name: 'Distribution Panel 12회로', nameKo: '분전반 12회로', spec: '12회로 3P', unit: '면', priceKRW: 250000, lastUpdated: '2024-06' },
  { id: 'MAT-PN-002', category: 'panel', name: 'Distribution Panel 24회로', nameKo: '분전반 24회로', spec: '24회로 3P', unit: '면', priceKRW: 420000, lastUpdated: '2024-06' },
  { id: 'MAT-PN-003', category: 'panel', name: 'MCC Panel', nameKo: 'MCC 전동기제어반', spec: '6회로 3P', unit: '면', priceKRW: 3500000, lastUpdated: '2024-06' },

  // === 접지 (per unit) ===
  { id: 'MAT-GD-001', category: 'grounding', name: 'Ground Rod 1.5m', nameKo: '접지봉 1.5m', spec: 'Cu φ14 × 1500mm', unit: '본', priceKRW: 18000, lastUpdated: '2024-06' },
  { id: 'MAT-GD-002', category: 'grounding', name: 'Ground Wire 6sq', nameKo: '접지선 6sq', spec: 'GV 6mm²', unit: 'm', priceKRW: 2200, lastUpdated: '2024-06' },

  // === 조명기구 (per unit) ===
  { id: 'MAT-LT-001', category: 'lighting', name: 'LED Flat 40W', nameKo: 'LED 평판등 40W', spec: '600×600 40W 4000K', unit: '개', priceKRW: 35000, lastUpdated: '2024-06' },
  { id: 'MAT-LT-002', category: 'lighting', name: 'Emergency Light', nameKo: '비상등', spec: 'LED 비상조명 90분', unit: '개', priceKRW: 25000, lastUpdated: '2024-06' },
  { id: 'MAT-LT-003', category: 'lighting', name: 'Exit Sign', nameKo: '유도등', spec: '피난구유도등 대형', unit: '개', priceKRW: 45000, lastUpdated: '2024-06' },

  // === 콘센트 / 스위치 (per unit) ===
  { id: 'MAT-WR-001', category: 'wiring_device', name: 'Outlet 2P', nameKo: '콘센트 2구', spec: '220V 15A 2구', unit: '개', priceKRW: 3500, lastUpdated: '2024-06' },
  { id: 'MAT-WR-002', category: 'wiring_device', name: 'Switch 1P', nameKo: '스위치 1구', spec: '220V 15A 1구', unit: '개', priceKRW: 2500, lastUpdated: '2024-06' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Labor Costs (노무비)
// ═══════════════════════════════════════════════════════════════════════════════

export interface LaborCostEntry {
  id: string;
  task: string;
  taskKo: string;
  unit: string;
  laborKRW: number;       // 노무비
  note?: string;
}

const LABOR_COSTS: LaborCostEntry[] = [
  { id: 'LAB-001', task: 'Cable pulling', taskKo: '전선 포설', unit: 'm', laborKRW: 1500, note: '전선관 내 입선 기준' },
  { id: 'LAB-002', task: 'Conduit install', taskKo: '전선관 설치', unit: 'm', laborKRW: 3500, note: 'EMT 노출 기준' },
  { id: 'LAB-003', task: 'Outlet install', taskKo: '콘센트 설치', unit: '개', laborKRW: 12000 },
  { id: 'LAB-004', task: 'Light install', taskKo: '조명기구 설치', unit: '개', laborKRW: 15000 },
  { id: 'LAB-005', task: 'Panel install', taskKo: '분전반 설치', unit: '면', laborKRW: 150000 },
  { id: 'LAB-006', task: 'Breaker install', taskKo: '차단기 설치', unit: '개', laborKRW: 8000 },
  { id: 'LAB-007', task: 'Ground rod install', taskKo: '접지봉 타입', unit: '본', laborKRW: 35000 },
  { id: 'LAB-008', task: 'Transformer install', taskKo: '변압기 설치', unit: '대', laborKRW: 800000, note: '건식 300~1000kVA' },
  { id: 'LAB-009', task: 'Cable tray install', taskKo: '케이블트레이 설치', unit: 'm', laborKRW: 8000 },
  { id: 'LAB-010', task: 'Fire detector install', taskKo: '감지기 설치', unit: '개', laborKRW: 10000 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Price Lookup API
// ═══════════════════════════════════════════════════════════════════════════════

const PRICE_INDEX = new Map<string, UnitPriceEntry>();
for (const p of MATERIAL_PRICES) {
  PRICE_INDEX.set(p.id, p);
  PRICE_INDEX.set(p.name.toUpperCase(), p);
  PRICE_INDEX.set(p.nameKo, p);
}

/**
 * 자재 단가 조회.
 * ID, 영문명, 한글명으로 검색 가능.
 */
export function getUnitPrice(query: string): UnitPriceEntry | null {
  // 정확 매칭
  const exact = PRICE_INDEX.get(query) ?? PRICE_INDEX.get(query.toUpperCase());
  if (exact) return exact;

  // 부분 매칭
  const lower = query.toLowerCase();
  return MATERIAL_PRICES.find(p =>
    p.name.toLowerCase().includes(lower) ||
    p.nameKo.includes(query) ||
    p.spec.toLowerCase().includes(lower)
  ) ?? null;
}

/**
 * 카테고리별 전체 단가 목록.
 */
export function getPricesByCategory(category: string): UnitPriceEntry[] {
  return MATERIAL_PRICES.filter(p => p.category === category);
}

/**
 * 노무비 조회.
 */
export function getLaborCost(taskId: string): LaborCostEntry | null {
  return LABOR_COSTS.find(l => l.id === taskId || l.task.toLowerCase().includes(taskId.toLowerCase())) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Project Cost Estimator
// ═══════════════════════════════════════════════════════════════════════════════

export interface CostLineItem {
  item: string;
  price: UnitPriceEntry | null;
  quantity?: number;
  subtotalKRW?: number;
}

export interface ProjectCostEstimate {
  materialTotal: number;
  laborTotal: number;
  overheadRate: number;       // 경비율 (보통 15%)
  overheadAmount: number;
  profitRate: number;         // 이윤율 (보통 5%)
  profitAmount: number;
  grandTotal: number;
  currency: 'KRW';
  lineItems: CostLineItem[];
}

/**
 * 프로젝트 개산 견적.
 */
export function estimateProjectCost(
  items: CostLineItem[],
  options?: { overheadRate?: number; profitRate?: number },
): ProjectCostEstimate {
  const overheadRate = options?.overheadRate ?? 0.15;
  const profitRate = options?.profitRate ?? 0.05;

  let materialTotal = 0;
  for (const item of items) {
    if (item.price && item.quantity) {
      item.subtotalKRW = item.price.priceKRW * item.quantity;
      materialTotal += item.subtotalKRW;
    }
  }

  // 노무비 = 자재비의 40% (간이 추정)
  const laborTotal = Math.round(materialTotal * 0.4);
  const directCost = materialTotal + laborTotal;
  const overheadAmount = Math.round(directCost * overheadRate);
  const subtotal = directCost + overheadAmount;
  const profitAmount = Math.round(subtotal * profitRate);
  const grandTotal = subtotal + profitAmount;

  return {
    materialTotal,
    laborTotal,
    overheadRate,
    overheadAmount,
    profitRate,
    profitAmount,
    grandTotal,
    currency: 'KRW',
    lineItems: items,
  };
}

/** 전체 자재 수 */
export function getMaterialCount(): number {
  return MATERIAL_PRICES.length;
}

/** 전체 노무비 항목 수 */
export function getLaborCostCount(): number {
  return LABOR_COSTS.length;
}
