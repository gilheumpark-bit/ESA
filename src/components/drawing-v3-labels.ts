import type {
  Certainty,
  CountStatus,
  DocumentReadStatus,
  JobStatus,
  RecommendationStatus,
  ReadFailureCode,
} from '@/agent/drawing/types-v3';

type PageStatus = 'pending' | 'surveying' | 'analyzing' | 'complete' | 'failed' | 'skipped-empty';
type CrossPageStatus = 'confirmed' | 'candidate' | 'hold';
type LineKind = 'power' | 'control' | 'ground' | 'bus' | 'unknown';

function labelFrom<T extends string>(
  labels: Readonly<Record<T, string>>,
  value: string,
  fallback: string,
): string {
  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value as T] : fallback;
}

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  QUEUED: '분석 대기 중',
  ENUMERATING: '페이지 확인 중',
  SURVEYING: '전체 도면 조사 중',
  ANALYZING_PAGES: '페이지 분석 중',
  RESCANNING_GAPS: '미확정 구간 재검토 중',
  RECONCILING_PAGES: '페이지 관계 정리 중',
  SYNTHESIZING: '결과 정리 중',
  COMPLETE: '분석 완료',
  PARTIAL: '일부 분석 완료',
  FAILED: '분석 실패',
  CANCELLED: '분석 취소',
};

const DOCUMENT_STATUS_LABELS: Record<DocumentReadStatus, string> = {
  COMPLETE: '전체 분석 완료',
  PARTIAL: '일부 분석 완료',
  HOLD: '사용자 확인 필요',
  FAILED: '분석 실패',
  CANCELLED: '분석 취소',
};

const PAGE_STATUS_LABELS: Record<PageStatus, string> = {
  pending: '대기 중',
  surveying: '조사 중',
  analyzing: '분석 중',
  complete: '분석 완료',
  failed: '분석 미완료',
  'skipped-empty': '빈 페이지',
};

const CERTAINTY_LABELS: Record<Certainty, string> = {
  confirmed: '확정',
  ambiguous: '확인 필요',
  unread: '판독 불가',
};

const COUNT_STATUS_LABELS: Record<CountStatus, string> = {
  COMPLETE: '집계 완료',
  CONDITIONAL: '조건부 집계',
  HOLD: '집계 보류',
};

const RECOMMENDATION_STATUS_LABELS: Record<RecommendationStatus, string> = {
  SUPPORTED: '근거 확인',
  CONDITIONAL: '조건부 제안',
  HOLD: '제안 보류',
  REJECTED: '근거 불충분',
};

const CROSS_PAGE_STATUS_LABELS: Record<CrossPageStatus, string> = {
  confirmed: '연결 확정',
  candidate: '연결 후보',
  hold: '연결 확인 필요',
};

const LINE_KIND_LABELS: Record<LineKind, string> = {
  power: '전력선',
  control: '제어선',
  ground: '접지선',
  bus: '모선',
  unknown: '종류 확인 필요',
};

const READ_FAILURE_LABELS: Record<ReadFailureCode, string> = {
  UNREADABLE_TEXT: '문자 판독 불가',
  UNREADABLE_SYMBOL: '기호 판독 불가',
  UNREADABLE_LINE: '선로 판독 불가',
  LINE_CONTINUITY_UNCERTAIN: '선로 연속성 확인',
  AMBIGUOUS_OCR: '문자 판독 후보 확인',
  LOW_RESOLUTION_HOLD: '원본 해상도 부족',
  HOLD_RESCAN_UNRESOLVED: '재검토 후에도 미확정',
  BOUNDARY_CLIP: '구획 경계 잘림 확인',
  EMPTY_REGION_RESULT: '구획 판독 결과 없음',
  ROLE_CALL_FAILED: '분석 역할 실행 실패',
  PARTIAL_BUDGET_EXCEEDED: '분석 한도 도달',
  CORRECTION_REANALYSIS_REQUIRED: '수정 후 재분석 필요',
};

export function labelJobStatus(value: JobStatus | string): string {
  return labelFrom(JOB_STATUS_LABELS, value, '상태 확인 필요');
}

export function labelDocumentReadStatus(value: DocumentReadStatus | string): string {
  return labelFrom(DOCUMENT_STATUS_LABELS, value, '상태 확인 필요');
}

export function labelPageStatus(value: PageStatus | string): string {
  return labelFrom(PAGE_STATUS_LABELS, value, '상태 확인 필요');
}

export function labelCertainty(value: Certainty | string): string {
  return labelFrom(CERTAINTY_LABELS, value, '확인 필요');
}

export function labelCountStatus(value: CountStatus | string): string {
  return labelFrom(COUNT_STATUS_LABELS, value, '집계 확인 필요');
}

export function labelRecommendationStatus(value: RecommendationStatus | string): string {
  return labelFrom(RECOMMENDATION_STATUS_LABELS, value, '제안 확인 필요');
}

export function labelCrossPageStatus(value: CrossPageStatus | string): string {
  return labelFrom(CROSS_PAGE_STATUS_LABELS, value, '연결 확인 필요');
}

export function labelLineKind(value: LineKind | string): string {
  return labelFrom(LINE_KIND_LABELS, value, '종류 확인 필요');
}

export function labelReadFailureCode(value: ReadFailureCode | string): string {
  return labelFrom(READ_FAILURE_LABELS, value, '추가 확인 필요');
}
