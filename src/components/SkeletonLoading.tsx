'use client';

/**
 * SkeletonLoading — 스켈레톤 로딩 컴포넌트
 * ------------------------------------------
 * 페이지/카드/목록별 스켈레톤.
 * 스피너 대신 콘텐츠 형태를 미리 보여줌.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Base Skeleton
// ═══════════════════════════════════════════════════════════════════════════════

function Bone({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--bg-tertiary)] ${className}`}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 계산기 결과 스켈레톤
// ═══════════════════════════════════════════════════════════════════════════════

export function CalcResultSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* 제목 */}
      <Bone className="h-6 w-48" />
      {/* 게이지 */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2].map(i => (
          <div key={i} className="rounded-xl border border-[var(--border-default)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <Bone className="h-4 w-32" />
              <Bone className="h-5 w-14 rounded-full" />
            </div>
            <Bone className="mb-2 h-8 w-24" />
            <Bone className="h-3 w-full rounded-full" />
            <div className="mt-2 flex justify-between">
              <Bone className="h-3 w-8" />
              <Bone className="h-3 w-16" />
              <Bone className="h-3 w-8" />
            </div>
          </div>
        ))}
      </div>
      {/* 단계별 풀이 */}
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="h-6 w-6 rounded-full" />
            <Bone className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 검색 결과 스켈레톤
// ═══════════════════════════════════════════════════════════════════════════════

export function SearchResultSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {/* 검색 헤더 */}
      <Bone className="h-5 w-36" />
      {/* 결과 카드들 */}
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-xl border border-[var(--border-default)] p-4">
          <Bone className="mb-2 h-5 w-3/4" />
          <Bone className="mb-1 h-3 w-full" />
          <Bone className="mb-3 h-3 w-2/3" />
          <div className="flex gap-2">
            <Bone className="h-5 w-16 rounded-full" />
            <Bone className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 보고서 스켈레톤
// ═══════════════════════════════════════════════════════════════════════════════

export function ReportSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      {/* 배지 + 요약 */}
      <div className="flex items-start gap-6 rounded-2xl border border-[var(--border-default)] p-6">
        <Bone className="h-28 w-28 shrink-0 rounded-full" />
        <div className="flex-1 space-y-3">
          <Bone className="h-6 w-48" />
          <Bone className="h-4 w-36" />
          <Bone className="h-4 w-full" />
          <div className="flex gap-2">
            <Bone className="h-6 w-16 rounded-full" />
            <Bone className="h-6 w-16 rounded-full" />
            <Bone className="h-6 w-16 rounded-full" />
          </div>
        </div>
      </div>
      {/* 마킹 목록 */}
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-lg border p-3">
          <div className="flex items-start gap-3">
            <Bone className="h-5 w-5 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1">
              <Bone className="h-4 w-3/4" />
              <Bone className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 카드 그리드 스켈레톤 (계산기 목록, 기준서 목록)
// ═══════════════════════════════════════════════════════════════════════════════

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--border-default)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bone className="h-8 w-8 rounded-lg" />
            <Bone className="h-4 w-24" />
          </div>
          <Bone className="mb-2 h-3 w-full" />
          <Bone className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 테이블 스켈레톤 (이력, 프로젝트)
// ═══════════════════════════════════════════════════════════════════════════════

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1">
      {/* 헤더 */}
      <div className="flex gap-4 border-b border-[var(--border-default)] pb-2">
        <Bone className="h-4 w-24" />
        <Bone className="h-4 w-32" />
        <Bone className="h-4 w-20" />
        <Bone className="h-4 w-16 ml-auto" />
      </div>
      {/* 행 */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <Bone className="h-4 w-24" />
          <Bone className="h-4 w-32" />
          <Bone className="h-4 w-20" />
          <Bone className="h-5 w-14 ml-auto rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 풀페이지 로딩
// ═══════════════════════════════════════════════════════════════════════════════

export function PageLoadingSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center gap-3">
        <Bone className="h-8 w-8 rounded-lg" />
        <div>
          <Bone className="h-6 w-48 mb-1" />
          <Bone className="h-3 w-72" />
        </div>
      </div>
      {/* 콘텐츠 */}
      <CardGridSkeleton count={4} />
    </div>
  );
}
