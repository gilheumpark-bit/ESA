/** OCR loading — 명판 인식 도구 skeleton */
export default function OCRLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8" role="status" aria-label="OCR 로딩 중">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800 mb-4" />
      <div className="grid gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
    </div>
  );
}
