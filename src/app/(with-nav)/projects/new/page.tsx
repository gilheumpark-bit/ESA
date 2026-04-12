'use client';

/**
 * New Project Page — /projects/new
 *
 * PART 1: Form state & submission
 * PART 2: Page component
 */

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus, Loader2 } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Form State & Submission
// ═══════════════════════════════════════════════════════════════════════════════

type SubmitStatus = 'idle' | 'submitting' | 'error';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Page Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });

      if (!res.ok) throw new Error('프로젝트 생성에 실패했습니다');
      const data = await res.json();
      router.push(data?.id ? `/projects/${data.id}` : '/projects');
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
            <FolderPlus size={28} className="text-[var(--color-primary)]" />
            새 프로젝트
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            프로젝트를 생성하여 계산을 그룹으로 관리하세요
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Project Name */}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              프로젝트 이름
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: OO빌딩 수변전설비"
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              설명 (선택)
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="프로젝트에 대한 간단한 설명"
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Error */}
          {status === 'error' && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {status === 'submitting' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FolderPlus size={16} />
              )}
              {status === 'submitting' ? '생성 중...' : '프로젝트 생성'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/projects')}
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
