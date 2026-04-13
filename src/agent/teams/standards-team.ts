/**
 * TEAM-STD: 규정질의팀 에이전트
 * -----------------------------
 * KEC/NEC/IEC 조문 검색, 대조, 판정, 단가표 대조
 *
 * PART 1: Standard query engine
 * PART 2: Unit price lookup
 * PART 3: Cross-standard comparison
 * PART 4: Team result assembly
 */

import { getExamFrequency } from '@/data/exam-frequency/exam-frequency';
import { getCertsByStandard } from '@/data/certifications/certification-db';
import { checkSelectivity, MCCB_TCC, ACB_TCC } from '@/data/protection/tcc-data';

import type {
  TeamInput,
  TeamResult,
  CalculationEntry,
  StandardEntry,
  ViolationEntry,
  RecommendationEntry,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Standard Query Engine
// ═══════════════════════════════════════════════════════════════════════════════

/** 질의 인텐트 파싱 */
interface StandardQueryIntent {
  type: 'article_lookup' | 'ampacity_query' | 'voltage_drop_check' | 'breaker_check' | 'comparison' | 'general';
  standard?: string;
  clause?: string;
  params?: Record<string, unknown>;
}

function parseStandardQuery(query: string): StandardQueryIntent {
  const q = query.toLowerCase();

  // KEC/NEC 조문 직접 참조
  const articleMatch = q.match(/(kec|nec|iec)\s*[-.]?\s*(\d+[\d.]*)/i);
  if (articleMatch) {
    return {
      type: 'article_lookup',
      standard: articleMatch[1].toUpperCase(),
      clause: articleMatch[2],
    };
  }

  // 허용전류 질의
  if (q.includes('허용전류') || q.includes('ampacity') || q.includes('전류용량')) {
    return { type: 'ampacity_query' };
  }

  // 전압강하 판정
  if (q.includes('전압강하') || q.includes('voltage drop') || q.includes('vd')) {
    return { type: 'voltage_drop_check' };
  }

  // 차단기 선정
  if (q.includes('차단기') || q.includes('breaker') || q.includes('mccb')) {
    return { type: 'breaker_check' };
  }

  // 비교
  if (q.includes('비교') || q.includes('compare') || q.includes('vs')) {
    return { type: 'comparison' };
  }

  return { type: 'general' };
}

/** KEC 조문 검색 + 판정 */
async function queryKECArticle(clause: string, params?: Record<string, unknown>) {
  try {
    const { getKECArticle, evaluateKEC } = await import('@/engine/standards/kec');
    const article = getKECArticle(`KEC-${clause}`);
    if (!article) return null;

    let judgment: StandardEntry['judgment'] = 'HOLD';
    if (params) {
      // Record<string, unknown> → Record<string, number> 안전 변환
      const numParams: Record<string, number> = {};
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === 'number') numParams[k] = v;
      }
      const result = evaluateKEC(`KEC-${clause}`, numParams);
      judgment = result?.judgment ?? 'HOLD';
    }

    return {
      standard: 'KEC',
      clause,
      title: article.title,
      judgment,
      conditions: article.conditions,
      relatedClauses: article.relatedClauses,
    };
  } catch {
    return null;
  }
}

/** 허용전류 테이블 조회 — 타입 안전 변환 */
async function queryAmpacity(params: Record<string, unknown>) {
  try {
    const { queryAmpacity: qa } = await import('@/engine/standards/kec/kec-table-query');
    // Record<string, unknown> → AmpacityOptions 안전 변환
    const safeParams = {
      size: Number(params.size ?? 0),
      conductor: String(params.conductor ?? 'Cu') as 'Cu' | 'Al',
      insulation: String(params.insulation ?? 'XLPE') as 'PVC' | 'XLPE' | 'MI',
      installation: String(params.installation ?? 'conduit') as 'conduit' | 'tray' | 'directBuried' | 'freeAir',
      ambientTemp: params.ambientTemp ? Number(params.ambientTemp) : undefined,
      groupCount: params.groupCount ? Number(params.groupCount) : undefined,
    };
    return qa(safeParams);
  } catch (err) {
    console.warn('[TEAM-STD] ampacity query failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Unit Price Lookup
// ═══════════════════════════════════════════════════════════════════════════════

async function lookupUnitPrices(components: string[]) {
  try {
    const { getUnitPrice, estimateProjectCost } = await import('@/data/unit-prices/unit-price-db');
    const prices = components
      .map(c => {
        const priceEntry = getUnitPrice(c);
        return priceEntry ? { item: c, price: priceEntry } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    if (prices.length === 0) return null;
    return { prices, totalEstimate: estimateProjectCost(prices) };
  } catch (err) {
    console.warn('[TEAM-STD] unit price lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Cross-Standard Comparison
// ═══════════════════════════════════════════════════════════════════════════════

async function compareStandards(
  topic: string,
  params: Record<string, unknown>,
) {
  try {
    const { compareDesign } = await import('@/engine/chain/standard-comparator');
    return compareDesign(params as unknown as Parameters<typeof compareDesign>[0]);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Team Result Assembly
// ═══════════════════════════════════════════════════════════════════════════════

export async function executeStandardsTeam(input: TeamInput): Promise<TeamResult> {
  const start = Date.now();
  const query = input.query ?? '';
  const intent = parseStandardQuery(query);

  const calculations: CalculationEntry[] = [];
  const standards: StandardEntry[] = [];
  const violations: ViolationEntry[] = [];
  const recommendations: RecommendationEntry[] = [];

  try {
    switch (intent.type) {
      case 'article_lookup': {
        if (intent.standard === 'KEC' && intent.clause) {
          const result = await queryKECArticle(intent.clause, input.params as Record<string, unknown>);
          if (result) {
            standards.push({
              standard: result.standard,
              clause: result.clause,
              title: result.title,
              judgment: result.judgment,
            });

            // 관련 조항도 함께 조회
            if (result.relatedClauses) {
              for (const rel of result.relatedClauses) {
                const related = await queryKECArticle(rel.articleId.replace('KEC-', ''));
                if (related) {
                  standards.push({
                    standard: related.standard,
                    clause: related.clause,
                    title: related.title,
                    judgment: 'HOLD',
                    note: `관련: ${rel.relation}`,
                  });
                }
              }
            }
          }
        }
        break;
      }

      case 'ampacity_query': {
        try {
          const ampResult = await queryAmpacity(input.params as unknown as Parameters<typeof queryAmpacity>[0] ?? {});
          if (ampResult && typeof ampResult === 'object') {
            const resultObj = ampResult as { data?: { ampacity?: number }; success?: boolean };
            const data = resultObj.data;
            const success = !!resultObj.success;
            calculations.push({
              id: 'calc-ampacity',
              calculatorId: 'ampacity',
              label: '허용전류',
              value: data?.ampacity ?? 0,
              unit: 'A',
              compliant: !!success,
              standardRef: 'KEC 232.3',
            });
            standards.push({
              standard: 'KEC',
              clause: '232.3',
              title: '허용전류 산정',
              judgment: success ? 'PASS' : 'FAIL',
            });
          }
        } catch { /* queryAmpacity 실패 시 무시 */ }
        break;
      }

      case 'voltage_drop_check': {
        const vdPercent = (input.params as Record<string, number>)?.voltageDropPercent;
        if (vdPercent !== undefined) {
          const { queryVoltageDrop } = await import('@/engine/standards/kec/kec-table-query');
          const vdResult = queryVoltageDrop(
            vdPercent,
            ((input.params as Record<string, string>)?.circuitType as 'main' | 'branch' | 'combined') ?? 'branch',
          );
          const vdSuccess = vdResult?.judgment === 'PASS';
          calculations.push({
            id: 'calc-vd-check',
            calculatorId: 'voltage-drop-judgment',
            label: '전압강하 판정',
            value: vdPercent,
            unit: '%',
            compliant: vdSuccess,
            standardRef: 'KEC 232.52',
          });
          const vdVerdict = vdResult?.notes?.[0]?.includes('적합') ? 'PASS' : vdResult?.judgment ?? 'HOLD';
          standards.push({
            standard: 'KEC',
            clause: '232.52',
            title: '전압강하 기준',
            judgment: vdVerdict,
          });

          if (!vdSuccess) {
            violations.push({
              id: 'vio-vd-std',
              severity: 'critical',
              title: '전압강하 기준 초과',
              description: `전압강하 ${vdPercent}% > 허용 기준`,
              standardRef: 'KEC 232.52',
              suggestedFix: '케이블 굵기 증가 또는 배전 경로 단축',
            });
          }
        }
        break;
      }

      case 'breaker_check': {
        const loadCurrent = (input.params as Record<string, number>)?.loadCurrent;
        if (loadCurrent !== undefined) {
          const { queryBreakerRating } = await import('@/engine/standards/kec/kec-table-query');
          const brResult = queryBreakerRating(loadCurrent);
          if (brResult && brResult.recommended > 0) {
            calculations.push({
              id: 'calc-breaker',
              calculatorId: 'breaker-sizing',
              label: '차단기 정격',
              value: brResult.recommended,
              unit: 'A',
              compliant: true,
              standardRef: 'KEC 212.3',
            });
          }
        }
        break;
      }

      case 'comparison': {
        const compResult = await compareStandards(query, input.params as Record<string, unknown> ?? {});
        if (compResult) {
          recommendations.push({
            id: 'rec-compare',
            category: 'safety',
            title: '다국가 기준 비교 결과',
            description: 'universallyCompliant' in compResult
              ? `${(compResult as { universallyCompliant: boolean }).universallyCompliant ? '전 기준 적합' : '일부 기준 부적합'}`
              : '비교 완료',
            impact: 'high',
          });
        }
        break;
      }

      default: {
        // 일반 검색: KEC + 용어 사전
        standards.push({
          standard: 'KEC',
          clause: '-',
          title: '일반 검색',
          judgment: 'HOLD',
          note: `"${query}" 키워드 검색`,
        });
      }
    }

    return {
      teamId: 'TEAM-STD',
      success: true,
      calculations,
      standards,
      violations,
      recommendations,
      confidence: standards.length > 0 ? 0.95 : 0.5,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      teamId: 'TEAM-STD',
      success: false,
      confidence: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
