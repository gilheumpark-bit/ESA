/**
 * ESVA Design Review Workflow — 설계 검토 워크플로우 (HITL)
 * ──────────────────────────────────────────────────────────
 * AI가 도면/계산 결과를 분석하여 검토 의견(Review)을 생성하고,
 * 인간 엔지니어가 승인(Approve)/반려(Reject)/수정요청(Request Changes)한다.
 * 법적 책임은 승인한 인간 엔지니어에게 귀속.
 *
 * PART 1: Types
 * PART 2: Review Generator
 * PART 3: Approval Gate
 */

import { runAudit, type AuditReport, type Grade } from '@/engine/verification/audit-engine';
import { runMultiTeamReview, type MultiTeamReport } from '@/engine/verification/multi-team-review';
import { detectGoodPatterns, type GoodPatternReport } from '@/engine/verification/good-patterns';

// =========================================================================
// PART 1 — Types
// =========================================================================

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export interface ReviewItem {
  id: string;
  category: 'safety' | 'compliance' | 'efficiency' | 'reliability' | 'documentation';
  severity: 'critical' | 'major' | 'minor' | 'info';
  title: string;
  description: string;
  /** 관련 KEC/NEC 조항 */
  standardRef?: string;
  /** AI 판정 (PASS/FAIL) */
  aiJudgment: 'PASS' | 'FAIL' | 'WARN';
}

export interface DesignReview {
  /** 리뷰 ID */
  reviewId: string;
  /** 리뷰 생성 시각 */
  createdAt: string;
  /** AI 검토 등급 */
  grade: Grade;
  /** 검토 항목 */
  items: ReviewItem[];
  /** 감사 보고서 */
  auditReport: AuditReport;
  /** 멀티팀 리뷰 */
  multiTeamReport: MultiTeamReport;
  /** 우수 패턴 */
  goodPatterns: GoodPatternReport;
  /** 인간 승인 상태 */
  status: ReviewStatus;
  /** 승인/반려 사유 (인간 입력) */
  humanComment?: string;
  /** 승인자 정보 */
  approvedBy?: { uid: string; name: string; certification?: string };
  /** 승인 시각 */
  approvedAt?: string;
}

// =========================================================================
// PART 2 — Review Generator
// =========================================================================

let _reviewCounter = 0;

/**
 * 설계 파라미터를 기반으로 AI 검토 리뷰를 생성한다.
 * 이 리뷰는 인간 엔지니어의 승인(HITL)을 거쳐야 최종 확정된다.
 */
export async function generateDesignReview(
  params: Record<string, unknown>,
): Promise<DesignReview> {
  // 3중 검증 병렬 실행
  const [auditReport, multiTeamReport, goodPatterns] = await Promise.all([
    Promise.resolve(runAudit(params)),
    runMultiTeamReview(params),
    Promise.resolve(detectGoodPatterns(params)),
  ]);

  // 검토 항목 추출
  const items: ReviewItem[] = [];

  // 감사 결과에서 위반 항목 추출
  for (const area of auditReport.areas) {
    for (const finding of area.findings) {
      const severityMatch = finding.match(/^\[(\w+)\]/);
      const severity = severityMatch
        ? (severityMatch[1].toLowerCase() as ReviewItem['severity'])
        : 'major';

      items.push({
        id: `review-${++_reviewCounter}`,
        category: mapDomainToCategory(area.area.domain),
        severity,
        title: finding.replace(/^\[\w+\]\s*/, ''),
        description: `${area.area.name} 영역에서 발견`,
        aiJudgment: severity === 'critical' ? 'FAIL' : 'WARN',
      });
    }
  }

  // 우수 패턴을 info 항목으로 추가
  for (const pat of goodPatterns.detected.filter(p => p.detected)) {
    items.push({
      id: `review-${++_reviewCounter}`,
      category: mapPatternCategory(pat.category),
      severity: 'info',
      title: `우수 사례: ${pat.title}`,
      description: `가점 +${pat.bonus}`,
      aiJudgment: 'PASS',
    });
  }

  return {
    reviewId: `DR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    grade: auditReport.overallGrade,
    items,
    auditReport,
    multiTeamReport,
    goodPatterns,
    status: 'PENDING',
  };
}

// =========================================================================
// PART 3 — Approval Gate (Human-in-the-Loop)
// =========================================================================

/**
 * 인간 엔지니어가 리뷰를 승인/반려/수정요청한다.
 * 이 함수가 호출되어야만 리뷰가 최종 확정된다.
 */
export function approveReview(
  review: DesignReview,
  decision: {
    status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
    comment: string;
    approver: { uid: string; name: string; certification?: string };
  },
): DesignReview {
  return {
    ...review,
    status: decision.status,
    humanComment: decision.comment,
    approvedBy: decision.approver,
    approvedAt: new Date().toISOString(),
  };
}

/**
 * 리뷰가 승인 상태인지 확인 (보고서 출력/공증 전 게이트).
 */
export function isReviewApproved(review: DesignReview): boolean {
  return review.status === 'APPROVED' && review.approvedBy !== undefined;
}

/**
 * 리뷰 요약 (1줄)
 */
export function getReviewSummary(review: DesignReview): string {
  const criticals = review.items.filter(i => i.severity === 'critical' && i.aiJudgment === 'FAIL').length;
  const goods = review.items.filter(i => i.aiJudgment === 'PASS' && i.severity === 'info').length;

  if (review.status === 'APPROVED') {
    return `등급 ${review.grade} — 승인됨 (${review.approvedBy?.name}, ${review.approvedBy?.certification ?? '자격 미기재'})`;
  }
  if (review.status === 'REJECTED') {
    return `등급 ${review.grade} — 반려됨: ${review.humanComment}`;
  }
  return `등급 ${review.grade} — 검토 대기 (위반 ${criticals}건, 우수사례 ${goods}건)`;
}

// ── Helpers ──

function mapDomainToCategory(domain: string): ReviewItem['category'] {
  const map: Record<string, ReviewItem['category']> = {
    'electrical-safety': 'safety',
    'thermal': 'safety',
    'protection': 'safety',
    'code-compliance': 'compliance',
    'reliability': 'reliability',
  };
  return map[domain] ?? 'compliance';
}

function mapPatternCategory(cat: string): ReviewItem['category'] {
  const map: Record<string, ReviewItem['category']> = {
    safety: 'safety',
    efficiency: 'efficiency',
    reliability: 'reliability',
    standards: 'compliance',
    documentation: 'documentation',
  };
  return map[cat] ?? 'compliance';
}
