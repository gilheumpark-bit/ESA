/**
 * Global Loading UI — Next.js App Router instant loading state
 *
 * (with-nav) 그룹 내 모든 페이지 전환 시 즉시 표시.
 * Suspense boundary가 자동으로 이 컴포넌트를 렌더링.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Progress bar */}
        <div className="h-1 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div className="h-full w-1/3 animate-[loading-slide_1s_ease-in-out_infinite] rounded-full bg-blue-600" />
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">Loading...</p>
      </div>
    </div>
  );
}
