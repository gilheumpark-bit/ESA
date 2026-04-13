/** Dashboard loading — 통계 카드 + 차트 skeleton */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8" role="status" aria-label="대시보드 로딩 중">
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-5 border-gray-200 dark:border-gray-700">
            <div className="mb-2 h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      </div>
    </div>
  );
}
