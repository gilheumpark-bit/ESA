'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronUp, ChevronDown, Award, Check, Tag,
  MessageSquare, ArrowLeft, Calculator,
} from 'lucide-react';

/**
 * ESVA Community — Question Detail Page
 * ──────────────────────────────────────
 * Full question view, answer list, voting, answer form.
 *
 * PART 1: Types
 * PART 2: Data fetching
 * PART 3: Vote component
 * PART 4: Answer card
 * PART 5: Answer form
 * PART 6: Page layout
 */

// ─── PART 1: Types ────────────────────────────────────────────

interface QuestionDetail {
  id: string;
  title: string;
  body: string;
  tags: string[];
  authorId: string;
  authorName?: string;
  standardRefs: string[];
  calcRefs: string[];
  votes: number;
  answerCount: number;
  status: 'open' | 'resolved';
  createdAt: string;
}

interface AnswerDetail {
  id: string;
  questionId: string;
  body: string;
  authorId: string;
  authorName?: string;
  isExpert: boolean;
  standardRefs: string[];
  votes: number;
  isAccepted: boolean;
  createdAt: string;
}

// ─── PART 2: Data Fetching ────────────────────────────────────

function useQuestionDetail(id: string) {
  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [answers, setAnswers] = useState<AnswerDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/community/${id}`);
      const json = await res.json();
      if (json.success) {
        setQuestion(json.data.question);
        setAnswers(json.data.answers ?? []);
      } else {
        setError(json.error?.message ?? 'Failed to load question');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { question, answers, loading, error, refetch: fetchData };
}

// ─── PART 3: Vote Component ──────────────────────────────────

function VoteButtons({
  questionId,
  targetType,
  targetId,
  votes,
  onVoted,
}: {
  questionId: string;
  targetType: 'question' | 'answer';
  targetId: string;
  votes: number;
  onVoted: () => void;
}) {
  const [localVotes, setLocalVotes] = useState(votes);
  const [voting, setVoting] = useState(false);

  const handleVote = async (direction: 'up' | 'down') => {
    setVoting(true);
    try {
      const res = await fetch(`/api/community/${questionId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, targetType, targetId }),
      });

      const json = await res.json();
      if (json.success && typeof json.data?.votes === 'number') {
        setLocalVotes(json.data.votes);
      }
      onVoted();
    } catch {
      // Network error — ignore, vote not counted
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={() => handleVote('up')}
        disabled={voting}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600
                   disabled:opacity-40 dark:hover:bg-gray-700"
        aria-label="Upvote"
      >
        <ChevronUp className="h-5 w-5" />
      </button>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {localVotes}
      </span>
      <button
        onClick={() => handleVote('down')}
        disabled={voting}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500
                   disabled:opacity-40 dark:hover:bg-gray-700"
        aria-label="Downvote"
      >
        <ChevronDown className="h-5 w-5" />
      </button>
    </div>
  );
}

// ─── PART 4: Answer Card ──────────────────────────────────────

function AnswerCard({
  answer,
  questionId,
  onVoted,
}: {
  answer: AnswerDetail;
  questionId: string;
  onVoted: () => void;
}) {
  return (
    <div
      className={`flex gap-4 rounded-lg border p-4
        ${answer.isAccepted
          ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
        }`}
    >
      <div className="flex flex-col items-center gap-2">
        <VoteButtons
          questionId={questionId}
          targetType="answer"
          targetId={answer.id}
          votes={answer.votes}
          onVoted={onVoted}
        />
        {answer.isAccepted && (
          <div className="rounded-full bg-green-500 p-1 text-white" title="Accepted answer">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Body — render as simple text with line breaks */}
        <div className="prose prose-sm max-w-none text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
          {answer.body}
        </div>

        {/* Standard refs */}
        {answer.standardRefs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {answer.standardRefs.map((ref) => (
              <span
                key={ref}
                className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700
                           dark:bg-amber-900 dark:text-amber-300"
              >
                {ref}
              </span>
            ))}
          </div>
        )}

        {/* Author & meta */}
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          {answer.isExpert && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700
                             dark:bg-amber-900 dark:text-amber-300">
              <Award className="h-3 w-3" />
              Expert
            </span>
          )}
          <span>{answer.authorName ?? 'Anonymous'}</span>
          <span>·</span>
          <span>{formatTimeAgo(answer.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── PART 5: Answer Form ──────────────────────────────────────

function AnswerForm({
  questionId,
  onSubmitted,
}: {
  questionId: string;
  onSubmitted: () => void;
}) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualityWarning, setQualityWarning] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!body.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/community/${questionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });

      const json = await res.json();

      if (json.success) {
        setBody('');
        setQualityWarning(json.data?.qualityWarning ?? null);
        onSubmitted();
      } else {
        setError(json.error?.message ?? 'Failed to submit answer');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        답변 작성
      </h3>

      {qualityWarning && (
        <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900 dark:text-amber-300">
          {qualityWarning}
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="답변을 작성하세요. 근거 조항(KEC, NEC, IEC 등)을 명시하면 신뢰도가 높아집니다."
        rows={6}
        className="mt-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm
                   focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
                   dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
      />

      {error && (
        <p className="mt-2 text-sm text-[var(--color-error)]">{error}</p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Markdown 기본 문법 지원 (줄바꿈, 코드블록)
        </p>
        <button
          onClick={handleSubmit}
          disabled={submitting || !body.trim()}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white
                     hover:bg-blue-700 disabled:opacity-40"
        >
          {submitting ? '제출 중...' : '답변 제출'}
        </button>
      </div>
    </div>
  );
}

// ─── PART 6: Page Layout ──────────────────────────────────────

export default function QuestionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { question, answers, loading, error, refetch } = useQuestionDetail(id);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          <div className="h-32 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        </div>
      </main>
    );
  }

  if (error || !question) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
          <p className="text-[var(--color-error)]">{error ?? 'Question not found'}</p>
          <Link href="/community" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            커뮤니티로 돌아가기
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Back link */}
      <Link
        href="/community"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        커뮤니티
      </Link>

      {/* Question */}
      <div className="flex gap-4">
        <VoteButtons
          questionId={question.id}
          targetType="question"
          targetId={question.id}
          votes={question.votes}
          onVoted={refetch}
        />

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {question.status === 'resolved' && (
              <span className="mr-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-normal text-green-700
                             dark:bg-green-900 dark:text-green-300">
                해결
              </span>
            )}
            {question.title}
          </h1>

          {/* Tags */}
          <div className="mt-3 flex flex-wrap gap-2">
            {question.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-600
                           dark:bg-blue-900 dark:text-blue-300"
              >
                <Tag className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>

          {/* Standard refs */}
          {question.standardRefs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {question.standardRefs.map((ref) => (
                <span
                  key={ref}
                  className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700
                             dark:bg-amber-900 dark:text-amber-300"
                >
                  {ref}
                </span>
              ))}
            </div>
          )}

          {/* Body */}
          <div className="mt-4 prose prose-sm max-w-none text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {question.body}
          </div>

          {/* Related calculators */}
          {question.calcRefs.length > 0 && (
            <div className="mt-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <p className="text-xs font-medium text-gray-500 mb-2">관련 계산기</p>
              <div className="flex flex-wrap gap-2">
                {question.calcRefs.map((calcId) => (
                  <Link
                    key={calcId}
                    href={`/calc/${calcId}`}
                    className="flex items-center gap-1 rounded bg-white px-2.5 py-1 text-xs text-blue-600
                               border border-gray-200 hover:bg-blue-50
                               dark:bg-gray-700 dark:border-gray-600 dark:text-blue-400"
                  >
                    <Calculator className="h-3 w-3" />
                    {calcId}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="mt-4 text-xs text-gray-400">
            {question.authorName ?? 'Anonymous'} · {formatTimeAgo(question.createdAt)}
          </div>
        </div>
      </div>

      {/* Answers */}
      <div className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
          <MessageSquare className="h-5 w-5" />
          답변 {answers.length}개
        </h2>

        <div className="mt-4 space-y-4">
          {answers.map((a) => (
            <AnswerCard key={a.id} answer={a} questionId={question.id} onVoted={refetch} />
          ))}
        </div>
      </div>

      {/* Answer form */}
      <AnswerForm questionId={question.id} onSubmitted={refetch} />
    </main>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;

  return `${Math.floor(months / 12)}년 전`;
}
