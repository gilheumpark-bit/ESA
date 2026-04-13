'use client';

/**
 * Contact Page — /contact
 *
 * PART 1: Form state & submission
 * PART 2: Page component
 */

import { useState, FormEvent } from 'react';
import { Mail, Send, Loader2, CheckCircle2 } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Form State & Submission
// ═══════════════════════════════════════════════════════════════════════════════

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

interface ContactForm {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const INITIAL_FORM: ContactForm = {
  name: '',
  email: '',
  subject: '',
  message: '',
};

const SUBJECT_OPTIONS = [
  '일반 문의',
  '버그 리포트',
  '기능 제안',
  '계산기 오류 신고',
  '계정 관련',
  '기타',
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Page Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function ContactPage() {
  const [form, setForm] = useState<ContactForm>(INITIAL_FORM);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error('전송에 실패했습니다');
      setStatus('success');
      setForm(INITIAL_FORM);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
    }
  };

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
          <CheckCircle2 size={48} className="mb-4 text-green-500" />
          <h1 className="text-xl font-bold text-[var(--text-primary)]">문의가 접수되었습니다</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            빠른 시일 내에 답변드리겠습니다.
          </p>
          <div className="mt-6 flex gap-3">
            <a
              href="/"
              className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-5 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)]"
            >
              홈으로
            </a>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            >
              추가 문의하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <Mail size={28} className="text-[var(--color-primary)]" />
            문의하기
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            버그 리포트, 기능 제안, 또는 일반 문의를 남겨주세요.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              이름
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={form.name}
              onChange={handleChange}
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              이메일
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="subject" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              문의 유형
            </label>
            <select
              id="subject"
              name="subject"
              required
              value={form.subject}
              onChange={handleChange}
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">선택하세요</option>
              {SUBJECT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label htmlFor="message" className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              내용
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={6}
              value={form.message}
              onChange={handleChange}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Error */}
          {status === 'error' && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}

          {/* Submit */}
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
            {status === 'submitting' ? '전송 중...' : '문의 보내기'}
          </button>
        </form>
      </main>
    </div>
  );
}
