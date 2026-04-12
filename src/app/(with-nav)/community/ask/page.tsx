'use client';

/**
 * Community Ask Question — /community/ask
 *
 * PART 1: Constants & types
 * PART 2: Page component
 */

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { HelpCircle, Send, Loader2 } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Constants & Types
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORIES = [
  { value: 'power', label: '전력' },
  { value: 'cable', label: '케이블' },
  { value: 'transformer', label: '변압기' },
  { value: 'protection', label: '보호' },
  { value: 'grounding', label: '접지' },
  { value: 'motor', label: '전동기' },
  { value: 'renewable', label: '신재생' },
  { value: 'other', label: '기타' },
];

type SubmitStatus = 'idle' | 'submitting' | 'error';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Page Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function CommunityAskPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, category }),
      });

      if (!res.ok) throw new Error('질문 등록에 실패했습니다');
      router.push('/community');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <HelpCircle size={28} className="text-[var(--color-primary)]" />
            질문하기
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            전기공학 커뮤니티에 질문을 남겨보세요
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              제목
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="질문을 요약해 주세요"
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              카테고리
            </label>
            <select
              id="category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">선택하세요</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Body */}
          <div>
            <label htmlFor="body" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              내용
            </label>
            <textarea
              id="body"
              required
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="질문의 배경, 조건, 시도한 내용 등을 상세히 작성해 주세요"
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Error */}
          {status === 'error' && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {status === 'submitting' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              {status === 'submitting' ? '등록 중...' : '질문 등록'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/community')}
              className="rounded-lg border border-[var(--border-default)] px-6 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              취소
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
