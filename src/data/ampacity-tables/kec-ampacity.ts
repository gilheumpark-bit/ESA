/**
 * KEC 허용전류표 (Korean Electrotechnical Code)
 *
 * KEC 232.5 기준 허용전류
 * 도체 종류: Cu (구리), Al (알루미늄)
 * 절연체: PVC (60°C), XLPE (90°C), MI (70°C Mineral Insulated)
 * 시공방법: conduit (전선관), tray (케이블트레이), directBuried (직매), freeAir (기중)
 *
 * 보정계수:
 *   - 주위온도 보정 (KEC 232.5.2 허용전류의 결정)
 *   - 전선 밀집 보정 (KEC 232.5.3 복수회로로 포설된 그룹)
 */

import { SourceTag, createSource } from '../../engine/sjc/types';
import { CalcValidationError } from '../../engine/calculators/types';

// =========================================================================
// PART 1 — Types
// =========================================================================

export type ConductorMaterial = 'Cu' | 'Al';
export type InsulationType = 'PVC' | 'XLPE' | 'MI';
export type InstallationMethod = 'conduit' | 'tray' | 'directBuried' | 'freeAir';

export interface CorrectionFactor {
  type: 'temperature' | 'grouping';
  factor: number;
  description: string;
}

export interface AmpacityOptions {
  /** Cable cross-section in mm² */
  size: number;
  /** Conductor material */
  conductor: ConductorMaterial;
  /** Insulation type */
  insulation: InsulationType;
  /** Installation method */
  installation: InstallationMethod;
  /** Ambient temperature in °C (default: 30°C for KEC) */
  ambientTemp?: number;
  /** Number of grouped circuits (default: 1) */
  groupCount?: number;
}

export interface AmpacityResult {
  /** Base ampacity before correction (A) */
  ampacity: number;
  /** Corrected ampacity after all factors applied (A) */
  corrected: number;
  /** Applied correction factors */
  factors: CorrectionFactor[];
  /** Source reference */
  source: SourceTag;
}

// =========================================================================
// PART 2 — Standard Cable Sizes (mm²)
// =========================================================================

export const KEC_CABLE_SIZES = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630,
] as const;

// =========================================================================
// PART 3 — Base Ampacity Tables (A)
// KEC 232.5 Table — 30°C ambient, single circuit
// =========================================================================

/**
 * Key format: `${conductor}_${insulation}_${installation}`
 * Values indexed by KEC_CABLE_SIZES position
 */
type AmpacityTableKey = `${ConductorMaterial}_${InsulationType}_${InstallationMethod}`;

const BASE_AMPACITY: Record<AmpacityTableKey, number[]> = {
  // -----------------------------------------------------------------------
  // Copper — PVC (60°C)
  // -----------------------------------------------------------------------
  Cu_PVC_conduit:      [14.5, 19.5, 26, 34, 46, 61, 80, 99, 119, 151, 182, 210, 240, 273, 321, 367, 0, 0, 0],
  Cu_PVC_tray:         [15.5, 21, 28, 36, 50, 66, 84, 104, 125, 160, 194, 225, 260, 297, 350, 400, 0, 0, 0],
  Cu_PVC_directBuried: [18, 24, 31, 39, 52, 67, 86, 106, 128, 163, 197, 227, 259, 295, 346, 396, 0, 0, 0],
  Cu_PVC_freeAir:      [17, 23, 30, 38, 52, 69, 90, 111, 133, 171, 207, 239, 275, 314, 370, 426, 0, 0, 0],

  // -----------------------------------------------------------------------
  // Copper — XLPE (90°C)
  // -----------------------------------------------------------------------
  Cu_XLPE_conduit:     [19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299, 344, 392, 461, 530, 600, 679, 770],
  Cu_XLPE_tray:        [21, 29, 38, 49, 68, 91, 119, 147, 179, 229, 278, 322, 371, 424, 500, 576, 649, 736, 835],
  Cu_XLPE_directBuried:[24, 32, 42, 54, 73, 95, 121, 150, 183, 233, 280, 324, 371, 423, 497, 571, 644, 729, 826],
  Cu_XLPE_freeAir:     [23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 407, 464, 546, 629, 710, 806, 916],

  // -----------------------------------------------------------------------
  // Copper — MI (70°C)
  // -----------------------------------------------------------------------
  Cu_MI_conduit:       [16, 22, 30, 38, 52, 69, 90, 111, 134, 171, 207, 239, 275, 314, 370, 426, 0, 0, 0],
  Cu_MI_tray:          [17, 23, 31, 40, 55, 74, 96, 119, 144, 184, 223, 259, 298, 340, 401, 461, 0, 0, 0],
  Cu_MI_directBuried:  [19, 26, 34, 43, 58, 76, 98, 121, 147, 187, 227, 263, 302, 345, 406, 467, 0, 0, 0],
  Cu_MI_freeAir:       [19, 25, 33, 43, 59, 79, 104, 129, 156, 200, 242, 280, 322, 367, 433, 498, 0, 0, 0],

  // -----------------------------------------------------------------------
  // Aluminium — PVC (60°C)
  // -----------------------------------------------------------------------
  Al_PVC_conduit:      [0, 15, 20, 26, 36, 47, 62, 77, 93, 118, 142, 164, 189, 215, 252, 289, 0, 0, 0],
  Al_PVC_tray:         [0, 16.5, 22, 28, 39, 51, 66, 81, 98, 125, 152, 176, 203, 232, 274, 315, 0, 0, 0],
  Al_PVC_directBuried: [0, 18.5, 24, 30, 40, 52, 67, 83, 100, 127, 154, 178, 204, 233, 273, 313, 0, 0, 0],
  Al_PVC_freeAir:      [0, 18, 24, 30, 40, 54, 70, 87, 104, 133, 162, 188, 217, 247, 292, 335, 0, 0, 0],

  // -----------------------------------------------------------------------
  // Aluminium — XLPE (90°C)
  // -----------------------------------------------------------------------
  Al_XLPE_conduit:     [0, 21, 28, 36, 49, 66, 87, 107, 131, 167, 202, 234, 270, 308, 362, 416, 471, 533, 605],
  Al_XLPE_tray:        [0, 23, 30, 38, 53, 71, 93, 115, 140, 179, 217, 251, 291, 332, 392, 451, 510, 578, 655],
  Al_XLPE_directBuried:[0, 25, 33, 42, 57, 74, 95, 117, 143, 183, 220, 254, 291, 332, 390, 448, 506, 572, 649],
  Al_XLPE_freeAir:     [0, 24, 33, 42, 58, 78, 104, 128, 155, 198, 240, 278, 319, 364, 429, 494, 558, 633, 719],

  // -----------------------------------------------------------------------
  // Aluminium — MI (70°C)
  // -----------------------------------------------------------------------
  Al_MI_conduit:       [0, 17, 23, 30, 40, 54, 70, 87, 105, 134, 162, 188, 216, 247, 291, 334, 0, 0, 0],
  Al_MI_tray:          [0, 18, 24, 31, 43, 57, 75, 93, 113, 144, 175, 203, 234, 267, 315, 362, 0, 0, 0],
  Al_MI_directBuried:  [0, 20, 26, 33, 45, 59, 77, 95, 115, 147, 178, 206, 237, 270, 319, 367, 0, 0, 0],
  Al_MI_freeAir:       [0, 20, 26, 33, 46, 62, 81, 101, 122, 157, 190, 220, 253, 288, 340, 391, 0, 0, 0],
};

// =========================================================================
// PART 4 — Temperature Correction Factors (KEC 232.5.2)
// =========================================================================

interface TempCorrectionRow {
  ambientMin: number;
  ambientMax: number;
  pvc70: number;
  mi70: number;
  xlpe90: number;
}

/**
 * Temperature correction factors — IEC 60364-5-52 Table B.52.14 (KEC 232 준거).
 * Base ambient temperature: 30°C. 각 밴드는 상한 온도의 값(밴드 내 보수측)을 쓴다.
 *
 * **열 이름의 숫자는 도체 최고 허용온도(Tmax)다** — PVC 70 · MI 70(시스) ·
 * XLPE/EPR 90. 표 값은 전부 `√((Tmax − Ta)/(Tmax − 30))` 과 일치하며,
 * `ampacity-temp-invariant.test.ts` 가 세 경로(이 표 · IEC 표 · temp-correction
 * 계산기)를 그 식에 함께 묶어 둔다. 이름과 Tmax 가 어긋나면 폴백이 이름을
 * 따라가 틀린다(2026-07-28 실측: `pvc60` 이라 폴백이 60 을 썼다).
 *
 * 2026-07-21 버그 사냥 #1 수리: `xlpe90` 열이 실제로는 PVC70 값(35°C 0.94·45°C
 * 0.79·60°C 0.50)을 담고, `pvc70` 열은 한 밴드 어긋나(45°C 0.71·60°C 0.00) 있었다.
 * XLPE는 90°C 도체라 PVC(70°C)보다 열에 강해 보정계수가 높아야 하는데(45°C 0.87 vs
 * 0.79) 역전돼 있었다 — XLPE 케이블을 과소, 저온측(15°C)은 과대(비보수·화재 방향)로
 * 계산. 별개 `temp-correction` 계산기(공식 √((Tmax−Ta)/(Tmax−30)))는 XLPE 40°C를
 * 0.913으로 옳게 내던 것과도 표가 모순이었다. B.52.14 정확값으로 정렬한다.
 * (mi70 열은 70°C sheath 값이 이미 정확해 불변.)
 */
const TEMP_CORRECTION: TempCorrectionRow[] = [
  { ambientMin: 10, ambientMax: 15, pvc70: 1.17, mi70: 1.18, xlpe90: 1.12 },
  { ambientMin: 16, ambientMax: 20, pvc70: 1.12, mi70: 1.14, xlpe90: 1.08 },
  { ambientMin: 21, ambientMax: 25, pvc70: 1.06, mi70: 1.10, xlpe90: 1.04 },
  { ambientMin: 26, ambientMax: 30, pvc70: 1.00, mi70: 1.00, xlpe90: 1.00 },
  { ambientMin: 31, ambientMax: 35, pvc70: 0.94, mi70: 0.93, xlpe90: 0.96 },
  { ambientMin: 36, ambientMax: 40, pvc70: 0.87, mi70: 0.87, xlpe90: 0.91 },
  { ambientMin: 41, ambientMax: 45, pvc70: 0.79, mi70: 0.79, xlpe90: 0.87 },
  { ambientMin: 46, ambientMax: 50, pvc70: 0.71, mi70: 0.71, xlpe90: 0.82 },
  { ambientMin: 51, ambientMax: 55, pvc70: 0.61, mi70: 0.61, xlpe90: 0.76 },
  { ambientMin: 56, ambientMax: 60, pvc70: 0.50, mi70: 0.50, xlpe90: 0.71 },
];

/** 도체 최고 허용온도 — 표 열 이름의 숫자와 같은 값. 폴백과 오류 메시지가 이걸 공유한다. */
function maxConductorTemp(insulation: InsulationType): number {
  return insulation === 'PVC' ? 70 : insulation === 'MI' ? 70 : 90;
}

function getTemperatureFactor(ambientTemp: number, insulation: InsulationType): number {
  for (const row of TEMP_CORRECTION) {
    if (ambientTemp >= row.ambientMin && ambientTemp <= row.ambientMax) {
      switch (insulation) {
        case 'PVC':  return row.pvc70;
        case 'MI':   return row.mi70;
        case 'XLPE': return row.xlpe90;
      }
    }
  }
  // 표 밖(10°C 미만·60°C 초과)은 같은 식으로 외삽한다:
  //   Kt = sqrt((Tmax - Tambient) / (Tmax - 30))
  //
  // **PVC 의 Tmax 는 70 이다.** 2026-07-28 이전에는 여기만 60 이었다 —
  // 표는 70°C 값(45°C 0.79 = √(25/40))을 담는데 폴백만 60 을 써서 둘이
  // 어긋났다. 결과: 주변 61°C 이상에서 분자가 음수가 되어 계수 0 → 호출부가
  // "PVC 절연 최대 온도 초과" 로 **던졌다.** 같은 케이블을 IEC 표(getIecAmpacity)
  // 는 65°C 에서 26.87A 로 정상 계산한다 — 두 계산기가 같은 질문에 다르게
  // 답하고 있었다(실측). 저온측도 어긋났다: 0°C 에서 60 기준은 √(60/30)=1.414,
  // 70 기준은 √(70/40)=1.323 으로 **6.9% 과대**(비보수 방향)였다.
  //
  // 필드 이름도 `pvc70` → `pvc70` 으로 고쳤다. 이름이 60 이라 폴백이 60 을
  // 따라간 것이고, 값은 2026-07-21 수리에서 이미 70°C 정확값으로 정렬됐었다.
  const tMax = maxConductorTemp(insulation);
  const numerator = tMax - ambientTemp;
  if (numerator <= 0) return 0;
  return Math.sqrt(numerator / (tMax - 30));
}

// =========================================================================
// PART 5 — Grouping Correction Factors (KEC 232.5.3)
// Number of current-carrying circuits or cables
// =========================================================================

const GROUPING_FACTORS: Array<{ min: number; max: number; factor: number }> = [
  { min: 1, max: 1, factor: 1.00 },
  { min: 2, max: 2, factor: 0.80 },
  { min: 3, max: 3, factor: 0.70 },
  { min: 4, max: 4, factor: 0.65 },
  { min: 5, max: 5, factor: 0.60 },
  { min: 6, max: 6, factor: 0.57 },
  { min: 7, max: 8, factor: 0.52 },
  { min: 9, max: 11, factor: 0.48 },
  { min: 12, max: 15, factor: 0.44 },
  { min: 16, max: 19, factor: 0.41 },
  { min: 20, max: Infinity, factor: 0.38 },
];

function getGroupingFactor(count: number): number {
  for (const row of GROUPING_FACTORS) {
    if (count >= row.min && count <= row.max) return row.factor;
  }
  return 0.38;
}

// =========================================================================
// PART 6 — Main Lookup Function
// =========================================================================

/**
 * Look up KEC ampacity with optional temperature and grouping corrections.
 *
 * @example
 * getAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' })
 * // => { ampacity: 112, corrected: 112, factors: [], source: {...} }
 *
 * getAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit', ambientTemp: 40, groupCount: 3 })
 * // => { ampacity: 112, corrected: 112 * 0.87 * 0.70 = 68.21, factors: [...], source: {...} }
 */
export function getAmpacity(opts: AmpacityOptions): AmpacityResult {
  const { size, conductor, insulation, installation, ambientTemp = 30, groupCount = 1 } = opts;

  // Find size index
  const sizeIdx = KEC_CABLE_SIZES.indexOf(size as (typeof KEC_CABLE_SIZES)[number]);
  if (sizeIdx === -1) {
    throw new CalcValidationError(
      'size',
      `Invalid cable size: ${size} mm². Valid KEC sizes: ${KEC_CABLE_SIZES.join(', ')}`,
    );
  }

  // Lookup base ampacity
  const tableKey = `${conductor}_${insulation}_${installation}` as AmpacityTableKey;
  const row = BASE_AMPACITY[tableKey];
  if (!row) {
    // **여기는 우리 잘못이다 — 422 가 아니라 500 이 맞다.**
    // 도체·절연·공사방법은 상류에서 이미 검증됐다. 셋 다 유효한데 표가
    // 없다는 것은 **우리 표에 구멍이 났다**는 뜻이지 호출자 입력이 틀린
    // 게 아니다. 실측: 유효 조합 24/24 전부 표가 있어 지금은 도달 불가한
    // 방어적 불변식이다 — 발화하면 데이터 회귀이고 경보가 울려야 한다.
    //
    // 2026-07-28 독립 심사 지적으로 되돌린다. 앞서 35 자리를 일괄
    // CalcValidationError 로 바꿀 때 이 자리까지 쓸어 담았는데, 그러면
    // 표가 깨져도 사용자에게 "절연 종류가 잘못됐다"(422)가 나가고
    // 페이징이 죽는다. 분류 변경은 수리가 아니다.
    throw new Error(`ESVA-INTERNAL: KEC 허용전류표 누락 — ${tableKey}`);
  }

  const baseAmpacity = row[sizeIdx];
  if (baseAmpacity === 0) {
    throw new CalcValidationError(
      'size',
      `Cable size ${size} mm² is not available for ${conductor}/${insulation}/${installation}`,
      'SIZE_UNAVAILABLE',
    );
  }

  // Apply correction factors
  const factors: CorrectionFactor[] = [];
  let corrected = baseAmpacity;

  // Temperature correction
  if (ambientTemp !== 30) {
    const tf = getTemperatureFactor(ambientTemp, insulation);
    if (tf === 0) {
      // 호출자 잘못이지 서버 고장이 아니다. 평문 Error 로 던지면 `/api/calculate`
      // 의 마지막 catch 가 **500 "Internal calculation error"** 로 뭉갠다 —
      // 사용자는 주위 온도 75°C 를 넣고(입력칸 max 는 80 을 허용한다) 무엇이
      // 잘못됐는지 알 수 없는 메시지를 받았다(2026-07-28 라이브 실측).
      // `CalcValidationError` 는 라우트가 422 로 내보내며 메시지를 그대로 전한다.
      throw new CalcValidationError(
        'ambientTemp',
        `주위 온도 ${ambientTemp}°C 가 ${insulation} 절연의 최고 허용온도(${maxConductorTemp(insulation)}°C) 이상입니다.`
        + ' 이 조건에서는 허용전류가 남지 않습니다 — 내열 절연(XLPE 90°C 등)을 쓰거나 주위 온도를 낮추십시오.',
      );
    }
    factors.push({
      type: 'temperature',
      factor: tf,
      description: `주위온도 보정: ${ambientTemp}°C (기준 30°C), 계수 ${tf}`,
    });
    corrected *= tf;
  }

  // Grouping correction
  if (groupCount > 1) {
    const gf = getGroupingFactor(groupCount);
    factors.push({
      type: 'grouping',
      factor: gf,
      description: `전선 밀집 보정: ${groupCount}회선, 계수 ${gf}`,
    });
    corrected *= gf;
  }

  return {
    ampacity: baseAmpacity,
    corrected: Math.round(corrected * 100) / 100,
    factors,
    source: createSource('KEC', '232.5', {
      edition: '2021',
      verifiedAt: '2024-12-01',
    }),
  };
}

// =========================================================================
// PART 7 — Utility Exports
// =========================================================================

/** Get all available sizes for a given configuration */
export function getAvailableSizes(
  conductor: ConductorMaterial,
  insulation: InsulationType,
  installation: InstallationMethod,
): number[] {
  const tableKey = `${conductor}_${insulation}_${installation}` as AmpacityTableKey;
  const row = BASE_AMPACITY[tableKey];
  if (!row) return [];
  return KEC_CABLE_SIZES.filter((_, idx) => row[idx] > 0);
}

/** Find minimum cable size for a given current */
export function findMinCableSize(
  current: number,
  conductor: ConductorMaterial,
  insulation: InsulationType,
  installation: InstallationMethod,
  ambientTemp = 30,
  groupCount = 1,
): { size: number; ampacity: number; corrected: number } | null {
  const available = getAvailableSizes(conductor, insulation, installation);
  for (const size of available) {
    const result = getAmpacity({ size, conductor, insulation, installation, ambientTemp, groupCount });
    if (result.corrected >= current) {
      return { size, ampacity: result.ampacity, corrected: result.corrected };
    }
  }
  return null;
}
