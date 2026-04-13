/** Settings loading — 설정 페이지 skeleton */
export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8" role="status" aria-label="설정 로딩 중">
      <div className="mb-6 h-8 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-5 border-gray-200 dark:border-gray-700">
            <div className="mb-3 h-5 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
