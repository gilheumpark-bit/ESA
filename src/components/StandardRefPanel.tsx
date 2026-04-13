'use client';

/**
 * StandardRefPanel — 계산 결과에서 참조된 기준서 조문 표시 패널
 *
 * 조문 번호 + 제목 + 요약을 카드 형태로 사이드 패널에 고정
 */

import { BookOpen, ExternalLink } from 'lucide-react';

interface StandardRef {
  /** 기준서 조문 번호 (e.g., "KEC 232.3") */
  clause: string;
  /** 조문 제목 */
  title?: string;
  /** 요약 또는 적용 내용 */
  summary?: string;
  /** 외부 링크 (해당되는 경우) */
  url?: string;
}

interface StandardRefPanelProps {
  /** 참조된 기준서 목록 */
  refs: StandardRef[];
  /** 적용된 기준서 코드 (e.g., "KEC 2021") */
  standardName?: string;
}

export default function StandardRefPanel({ refs, standardName }: StandardRefPanelProps) {
  if (refs.length === 0) return null;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          참조 기준서
        </h3>
        {standardName && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-mono">
            {standardName}
          </span>
        )}
      </div>

      {/* 조문 목록 */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[400px] overflow-y-auto">
        {refs.map((ref, i) => (
          <div key={i} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/50 px-1.5 py-0.5 rounded">
                  {ref.clause}
                </span>
                {ref.title && (
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {ref.title}
                  </span>
                )}
              </div>
              {ref.url && (
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            {ref.summary && (
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {ref.summary}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 푸터 */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <p className="text-[10px] text-gray-400">
          총 {refs.length}개 조문 참조 | PE 검토 필요
        </p>
      </div>
    </div>
  );
}
