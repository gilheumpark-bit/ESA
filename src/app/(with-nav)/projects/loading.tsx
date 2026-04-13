/** Projects loading — 프로젝트 목록 skeleton */
export default function ProjectsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8" role="status" aria-label="프로젝트 로딩 중">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-5 border-gray-200 dark:border-gray-700">
            <div className="mb-3 h-5 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mb-2 h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
