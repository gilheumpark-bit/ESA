/** Community loading — Q&A 목록 skeleton */
export default function CommunityLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8" role="status" aria-label="커뮤니티 로딩 중">
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mb-4 h-10 w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 border-gray-200 dark:border-gray-700">
            <div className="mb-2 h-5 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
