/** Search page loading — 검색 결과 대기 시 skeleton UI */
export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Search bar skeleton */}
      <div className="mb-6 h-12 w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />

      {/* Result skeletons */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="mb-3 h-5 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mb-2 h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
