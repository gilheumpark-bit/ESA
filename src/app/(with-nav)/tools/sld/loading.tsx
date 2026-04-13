/** SLD Analysis loading — 도면 분석 도구 skeleton */
export default function SLDLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8" role="status" aria-label="도면 분석 로딩 중">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-20 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800 mb-4" />
      <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}
