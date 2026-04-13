/** History loading — 이력 페이지 skeleton */
export default function HistoryLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8" role="status" aria-label="이력 로딩 중">
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mb-4 flex gap-3">
        <div className="h-10 w-40 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-40 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    </div>
  );
}
