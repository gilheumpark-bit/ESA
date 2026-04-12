/**
 * Unified Loading Skeletons
 *
 * PART 1: Base Skeleton
 * PART 2: SearchResultSkeleton
 * PART 3: CalculatorFormSkeleton
 * PART 4: ReceiptSkeleton
 * PART 5: DashboardSkeleton
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Base Skeleton
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ width, height, className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--bg-tertiary)] ${className}`}
      style={{ width, height }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Search Result Skeleton (SERP loading state, 3 cards)
// ═══════════════════════════════════════════════════════════════════════════════

function SearchResultCard() {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      {/* URL line */}
      <Skeleton className="mb-2 h-3 w-48" />
      {/* Title */}
      <Skeleton className="mb-3 h-5 w-3/4" />
      {/* Description lines */}
      <Skeleton className="mb-1.5 h-3 w-full" />
      <Skeleton className="mb-1.5 h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function SearchResultSkeleton() {
  return (
    <div className="space-y-3">
      <SearchResultCard />
      <SearchResultCard />
      <SearchResultCard />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Calculator Form Skeleton (5 input fields)
// ═══════════════════════════════════════════════════════════════════════════════

export function CalculatorFormSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <Skeleton className="mb-4 h-5 w-24" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="mb-4">
          <Skeleton className="mb-1.5 h-3 w-32" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="mt-2 h-10 w-full rounded-lg" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Receipt Skeleton
// ═══════════════════════════════════════════════════════════════════════════════

export function ReceiptSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Skeleton className="mb-2 h-6 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      {/* Result box */}
      <div className="mb-6 rounded-lg bg-[var(--bg-secondary)] p-4 text-center">
        <Skeleton className="mx-auto mb-2 h-3 w-16" />
        <Skeleton className="mx-auto mb-1 h-10 w-36" />
        <Skeleton className="mx-auto h-4 w-12" />
      </div>
      {/* Formula */}
      <Skeleton className="mb-4 h-12 w-full rounded-lg" />
      {/* Table rows */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mb-2 flex justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Dashboard Skeleton (chart + list)
// ═══════════════════════════════════════════════════════════════════════════════

export function DashboardSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Chart area */}
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
        <Skeleton className="mb-4 h-5 w-32" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
      {/* List area */}
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
        <Skeleton className="mb-4 h-5 w-28" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-3 flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="mb-1 h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Skeleton;
