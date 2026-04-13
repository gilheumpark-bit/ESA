/** Calculator hub loading — 계산기 목록 로딩 skeleton */
export default function CalcLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mb-6 h-10 w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="mb-3 h-10 w-10 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="mb-2 h-5 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
