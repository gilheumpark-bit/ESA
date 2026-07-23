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

/** NEC/IEC registry lookup. A lookup alone never produces a compliance PASS. */
async function queryForeignArticle(standard: 'NEC' | 'IEC', clause: string) {
  try {
    const article = standard === 'NEC'
      ? (await import('@/engine/standards/nec')).getNECArticleFull(clause)
      : (await import('@/engine/standards/iec')).getIECArticle(clause);
    if (!article) return null;

    return {
      standard: article.standard,
      clause: article.article,
      title: article.title,
      judgment: 'HOLD' as StandardEntry['judgment'],
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

// PART 2 (legacy `lookupUnitPrices`) was removed in R-cleanup — never invoked.
//   Re-add via dynamic import + call from PART 4 if cost estimation is needed.

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Cross-Standard Comparison
// ═══════════════════════════════════════════════════════════════════════════════

async function compareStandards(
  _topic: string,
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
        if (intent.standard && intent.clause) {
          const result = intent.standard === 'KEC'
            ? await queryKECArticle(intent.clause, input.params as Record<string, unknown>)
            : await queryForeignArticle(intent.standard as 'NEC' | 'IEC', intent.clause);

          if (!result) {
            return {
              teamId: 'TEAM-STD',
              success: false,
              calculations,
              standards,
              violations,
              recommendations,
              confidence: 0,
              durationMs: Date.now() - start,
              error: `${intent.standard} ${intent.clause} 조항을 내장 기준 데이터에서 찾을 수 없습니다. 공식 원문을 확인하세요.`,
            };
          }

          standards.push({
            standard: result.standard,
            clause: result.clause,
            title: result.title,
            judgment: result.judgment,
          });

          // KEC registry has executable related-article evaluation. Foreign
          // references remain metadata until an equivalent evaluator exists.
          if (intent.standard === 'KEC' && result.relatedClauses) {
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
          const vdVerdict = vdResult?.judgment ?? 'HOLD';
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
            // 추천 정격 산출 ≠ 현장 적합 확정. 부하·허용전류·차단용량 교차검증 전 HOLD.
            calculations.push({
              id: 'calc-breaker',
              calculatorId: 'breaker-sizing',
              label: '차단기 정격 (표 조회 추천)',
              value: brResult.recommended,
              unit: 'A',
              compliant: null,
              note: `부하 ${loadCurrent}A 기준 추천 ${brResult.recommended}A — 전선 허용전류·차단용량 교차검증 전 HOLD.`,
              standardRef: 'KEC 212.3',
            });
            standards.push({
              standard: 'KEC',
              clause: '212.3',
              title: '차단기 정격',
              judgment: 'HOLD',
              note: `추천 ${brResult.recommended}A (부하 ${loadCurrent}A) — 교차검증 필요`,
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
