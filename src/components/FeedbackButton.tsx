/**
 * FeedbackButton — "도움이 됐나요?" feedback widget
 * ──────────────────────────────────────────────────
 * Thumbs up/down below calculation results.
 * Optional comment textarea on thumbs down.
 * Saves feedback to Supabase via /api/feedback, falls back to localStorage.
 */

'use client';

import { useState, useCallback } from 'react';

// ─── PART 1: Types ─────────────────────────────────────────────

interface FeedbackButtonProps {
  /** 'calculation' | 'search' */
  type: 'calculation' | 'search';
  /** Target ID (calculator ID or search query hash) */
  targetId: string;
}

type Rating = 'up' | 'down' | null;

// ─── PART 2: API Call ──────────────────────────────────────────

async function submitFeedback(payload: {
  type: string;
  targetId: string;
  rating: 'up' | 'down';
  comment?: string;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) return true;

    // Fallback: save to localStorage
    saveFeedbackLocally(payload);
    return true;
  } catch {
    // Offline or network error — save locally
    saveFeedbackLocally(payload);
    return true;
  }
}

function saveFeedbackLocally(payload: {
  type: string;
  targetId: string;
  rating: string;
  comment?: string;
}): void {
  try {
    const existing = JSON.parse(localStorage.getItem('esa-feedback') ?? '[]');
    existing.push({ ...payload, timestamp: new Date().toISOString() });
    localStorage.setItem('esa-feedback', JSON.stringify(existing));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

// ─── PART 3: Component ─────────────────────────────────────────

export default function FeedbackButton({ type, targetId }: FeedbackButtonProps) {
  const [rating, setRating] = useState<Rating>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [animating, setAnimating] = useState(false);

  const handleRating = useCallback(
    async (value: 'up' | 'down') => {
      setRating(value);

      if (value === 'down') {
        setShowComment(true);
        return;
      }

      // Thumbs up — submit immediately
      setAnimating(true);
      await submitFeedback({ type, targetId, rating: value });
      setTimeout(() => {
        setAnimating(false);
        setSubmitted(true);
      }, 600);
    },
    [type, targetId],
  );

  const handleSubmitComment = useCallback(async () => {
    if (!rating) return;

    setAnimating(true);
    await submitFeedback({
      type,
      targetId,
      rating,
      comment: comment.trim() || undefined,
    });
    setTimeout(() => {
      setAnimating(false);
      setSubmitted(true);
      setShowComment(false);
    }, 600);
  }, [type, targetId, rating, comment]);

  // Thank-you state
  if (submitted) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-green-600 dark:text-green-400 animate-fade-in">
        <span aria-hidden="true">&#10003;</span>
        <span>피드백 감사합니다!</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {/* Question + buttons */}
      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        <span>도움이 됐나요?</span>

        <button
          onClick={() => handleRating('up')}
          disabled={animating}
          className={`
            p-1.5 rounded-lg transition-all duration-200
            hover:bg-green-50 dark:hover:bg-green-950
            ${rating === 'up' ? 'bg-green-100 dark:bg-green-900 scale-110' : ''}
            ${animating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          aria-label="도움이 됐어요"
          title="도움이 됐어요"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={rating === 'up' ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={rating === 'up' ? 'text-green-600' : 'text-gray-400'}
          >
            <path d="M7 10v12" />
            <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
          </svg>
        </button>

        <button
          onClick={() => handleRating('down')}
          disabled={animating}
          className={`
            p-1.5 rounded-lg transition-all duration-200
            hover:bg-red-50 dark:hover:bg-red-950
            ${rating === 'down' ? 'bg-red-100 dark:bg-red-900 scale-110' : ''}
            ${animating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          aria-label="도움이 안 됐어요"
          title="도움이 안 됐어요"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={rating === 'down' ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={rating === 'down' ? 'text-red-500' : 'text-gray-400'}
          >
            <path d="M17 14V2" />
            <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
          </svg>
        </button>
      </div>

      {/* Optional comment on thumbs down */}
      {showComment && (
        <div className="flex flex-col gap-2 mt-1 animate-fade-in">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="어떤 점이 아쉬웠나요? (선택사항)"
            className="w-full p-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg
                       bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300
                       placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400
                       resize-none"
            rows={2}
            maxLength={500}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmitComment}
              disabled={animating}
              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md
                         hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              제출
            </button>
            <button
              onClick={() => {
                setShowComment(false);
                setRating(null);
              }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
