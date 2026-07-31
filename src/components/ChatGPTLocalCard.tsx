'use client';

import { useCallback, useEffect, useState } from 'react';

import type { ChatGPTLocalStatus } from '@/lib/chatgpt-local-contract';
import {
  loadChatGPTLocalSelection,
  resolveChatGPTLocalModel,
  saveChatGPTLocalSelection,
} from '@/lib/chatgpt-local-selection';

const EMPTY_STATUS: ChatGPTLocalStatus = {
  available: false,
  connected: false,
  models: [],
  reason: 'PROTOCOL_ERROR',
};

function statusMessage(status: ChatGPTLocalStatus): string {
  if (status.connected) return '연결됨';
  if (status.reason === 'CODEX_NOT_FOUND') return 'Codex 설치 필요';
  if (status.reason === 'NOT_LOGGED_IN') return 'ChatGPT 로그인 필요';
  return '로컬 연결 확인 필요';
}

export function ChatGPTLocalCard() {
  const [status, setStatus] = useState<ChatGPTLocalStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [loginId, setLoginId] = useState<string | null>(null);
  const [selection, setSelection] = useState(() => loadChatGPTLocalSelection());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/chatgpt-local', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('status unavailable');
      const body = await response.json() as { data?: ChatGPTLocalStatus };
      if (!body.data) throw new Error('invalid status');
      setStatus(body.data);
      setError(null);
      if (body.data.connected && loginId) {
        const model = resolveChatGPTLocalModel(
          { enabled: true, model: selection.model },
          body.data.models,
          'text',
        );
        if (model) {
          const next = { enabled: true, model };
          saveChatGPTLocalSelection(next);
          setSelection(next);
        }
        setLoginId(null);
      }
    } catch {
      setStatus(EMPTY_STATUS);
      setError('로컬 ChatGPT 상태를 확인하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [loginId, selection.model]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!loginId) return;
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [loginId, refresh]);

  const postAction = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/settings/chatgpt-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null) as {
      data?: Record<string, unknown>;
      error?: { message?: string };
    } | null;
    if (!response.ok) throw new Error(body?.error?.message || '연결 작업을 완료하지 못했습니다.');
    return body?.data ?? {};
  }, []);

  const connect = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const data = await postAction({ action: 'login' });
      if (typeof data.authUrl !== 'string' || typeof data.loginId !== 'string') {
        throw new Error('로그인 주소를 받지 못했습니다.');
      }
      window.open(data.authUrl, '_blank', 'noopener,noreferrer');
      setLoginId(data.loginId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ChatGPT 연결을 시작하지 못했습니다.');
    } finally {
      setWorking(false);
    }
  }, [postAction]);

  const useAccount = useCallback(() => {
    const model = resolveChatGPTLocalModel(
      { enabled: true, model: selection.model },
      status.models,
      'text',
    );
    if (!model) {
      setError('이 계정에서 사용할 수 있는 텍스트 모델이 없습니다.');
      return;
    }
    const next = { enabled: true, model };
    saveChatGPTLocalSelection(next);
    setSelection(next);
    setError(null);
  }, [selection.model, status.models]);

  const changeModel = useCallback((model: string) => {
    const next = { enabled: true, model };
    saveChatGPTLocalSelection(next);
    setSelection(next);
  }, []);

  const disconnect = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      await postAction({ action: 'logout' });
      saveChatGPTLocalSelection({ enabled: false, model: '' });
      setSelection({ enabled: false, model: '' });
      setLoginId(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ChatGPT 연결을 해제하지 못했습니다.');
    } finally {
      setWorking(false);
    }
  }, [postAction, refresh]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            ChatGPT 계정
          </h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            이 PC의 공식 Codex 로그인을 사용합니다. API 키는 필요하지 않습니다.
          </p>
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-300" aria-live="polite">
          {loading ? '확인 중…' : statusMessage(status)}
        </span>
      </div>

      {status.connected && (
        <div className="mt-4 space-y-3">
          <div className="text-sm text-zinc-700 dark:text-zinc-200">
            <span>{status.account?.email ?? '이메일 비공개'}</span>
            <span className="mx-2 text-zinc-400">·</span>
            <span>{status.account?.planType ?? 'unknown'}</span>
          </div>
          <div>
            <label
              htmlFor="chatgpt-local-model"
              className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              사용할 모델
            </label>
            <select
              id="chatgpt-local-model"
              value={selection.model}
              onChange={(event) => changeModel(event.target.value)}
              disabled={!selection.enabled}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {status.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}{model.inputModalities.includes('image') ? ' · 이미지' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!status.connected && (
          <button
            type="button"
            onClick={connect}
            disabled={working || loginId !== null}
            className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loginId ? '로그인 확인 중…' : 'ChatGPT 연결'}
          </button>
        )}
        {status.connected && !selection.enabled && (
          <button
            type="button"
            onClick={useAccount}
            disabled={working}
            className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            이 계정 사용
          </button>
        )}
        {status.connected && selection.enabled && (
          <span className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300 px-3 text-sm font-medium text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
            ESA AI에 사용 중
          </span>
        )}
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={working || loading}
          className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          다시 확인
        </button>
        {status.connected && (
          <button
            type="button"
            onClick={disconnect}
            disabled={working}
            className="min-h-11 rounded-lg border border-red-300 px-3 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            연결 해제
          </button>
        )}
      </div>
    </section>
  );
}
