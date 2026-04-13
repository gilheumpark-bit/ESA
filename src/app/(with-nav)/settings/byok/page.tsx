'use client';

/**
 * ESVA BYOK Key Management Page
 * -----------------------------
 * 7-provider API key management with encrypted localStorage storage.
 *
 * PART 1: Types & constants
 * PART 2: Provider key card component
 * PART 3: Quick start guide & FAQ
 * PART 4: Main page component
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import {
  PROVIDERS,
  encryptKey,
  decryptKey,
  isLocalProvider,
  type AIProvider,
} from '@/lib/ai-providers';

// =============================================================================
// PART 1 — Types & Constants
// =============================================================================

type KeyStatus = 'empty' | 'saved' | 'testing' | 'valid' | 'invalid';

interface ProviderKeyState {
  maskedKey: string;
  status: KeyStatus;
  rawInput: string;
}

const STORAGE_PREFIX = 'esa-byok-';

const PROVIDER_ORDER: string[] = [
  'openai',
  'claude',
  'gemini',
  'groq',
  'mistral',
  'ollama',
  'lmstudio',
];

const STATUS_ICON: Record<KeyStatus, string> = {
  empty: '',
  saved: '\u2705',
  testing: '\u23F3',
  valid: '\u2705',
  invalid: '\u274C',
};

const STATUS_LABEL: Record<KeyStatus, string> = {
  empty: '',
  saved: 'Saved',
  testing: 'Testing...',
  valid: 'Valid',
  invalid: 'Invalid',
};

/** 마지막 4자 마스킹 */
function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return '****' + key.slice(-4);
}

/** localStorage에서 암호화된 키 로드 */
async function loadStoredKey(providerId: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + providerId);
    if (!stored) return null;
    return await decryptKey(stored);
  } catch {
    return null;
  }
}

/** localStorage에 암호화하여 저장 */
async function saveStoredKey(providerId: string, raw: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const encrypted = await encryptKey(raw);
  localStorage.setItem(STORAGE_PREFIX + providerId, encrypted);
}

/** localStorage에서 키 삭제 */
function deleteStoredKey(providerId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_PREFIX + providerId);
}

// =============================================================================
// PART 2 — Provider Key Card Component
// =============================================================================

function ProviderKeyCard({
  provider,
  state,
  onSave,
  onTest,
  onDelete,
  onInputChange,
}: {
  provider: AIProvider;
  state: ProviderKeyState;
  onSave: () => void;
  onTest: () => void;
  onDelete: () => void;
  onInputChange: (value: string) => void;
}) {
  const isLocal = isLocalProvider(provider.id);
  const hasSavedKey = state.status !== 'empty';
  const showInput = !hasSavedKey;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {provider.name}
          </h3>
          {isLocal && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Local -- no API key required
            </span>
          )}
        </div>
        {state.status !== 'empty' && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {STATUS_ICON[state.status]} {STATUS_LABEL[state.status]}
          </span>
        )}
      </div>

      {/* 저장된 키가 있으면 마스크 표시 */}
      {hasSavedKey && (
        <div className="mb-3 flex items-center gap-2">
          <code className="rounded bg-zinc-100 px-2 py-1 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {state.maskedKey}
          </code>
        </div>
      )}

      {/* 입력 필드: 키 미저장 시 */}
      {showInput && !isLocal && (
        <div className="mb-3">
          <input
            type="password"
            value={state.rawInput}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={`Enter ${provider.name} API key`}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500"
          />
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        {showInput && !isLocal && (
          <button
            onClick={onSave}
            disabled={!state.rawInput.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        )}
        <button
          onClick={onTest}
          disabled={state.status === 'testing' || (state.status === 'empty' && !isLocal)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Test
        </button>
        {hasSavedKey && (
          <button
            onClick={onDelete}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PART 3 — Quick Start Guide & FAQ
// =============================================================================

function QuickStartGuide() {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
      <h2 className="mb-3 text-lg font-semibold text-amber-900 dark:text-amber-200">
        API key issuance 3 min guide
      </h2>
      <ol className="list-inside list-decimal space-y-2 text-sm text-amber-800 dark:text-amber-300">
        <li>
          <strong>OpenAI</strong> -- platform.openai.com &rarr; API Keys &rarr;
          Create new secret key
        </li>
        <li>
          <strong>Anthropic</strong> -- console.anthropic.com &rarr; API Keys
          &rarr; Create Key
        </li>
        <li>
          <strong>Google Gemini</strong> -- aistudio.google.com &rarr; Get API
          key
        </li>
        <li>
          <strong>Groq</strong> -- console.groq.com &rarr; API Keys &rarr;
          Create
        </li>
        <li>
          <strong>Mistral</strong> -- console.mistral.ai &rarr; API Keys
        </li>
        <li>
          <strong>Ollama / LM Studio</strong> -- Install locally, no key
          needed
        </li>
      </ol>
    </section>
  );
}

function FAQ() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        BYOK FAQ
      </h2>
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <div>
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            What is BYOK?
          </p>
          <p>
            Bring Your Own Key. You provide your own API keys for AI
            providers. ESVA encrypts them in your browser and never sends them
            to our servers.
          </p>
        </div>
        <div>
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            Are my keys safe?
          </p>
          <p>
            Keys are encrypted with AES-256-GCM and stored only in your
            browser&apos;s localStorage. They never leave your device except
            when making direct API calls.
          </p>
        </div>
        <div>
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            Which provider should I use?
          </p>
          <p>
            Google Gemini Flash is the best value. Claude and GPT-4.1 are
            premium options. Groq is fast and affordable. Ollama is free and
            local.
          </p>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// PART 4 — Main Page Component
// =============================================================================

export default function BYOKPage() {
  const { user, loading: authLoading } = useAuth();

  const [states, setStates] = useState<Record<string, ProviderKeyState>>({});
  const [loaded, setLoaded] = useState(false);

  // BYOK keys are client-side localStorage only — auth is NOT required.
  // If logged in, cloud sync is available; otherwise local-only is fine.

  // localStorage에서 저장된 키 로드
  useEffect(() => {
    async function loadAll() {
      const initial: Record<string, ProviderKeyState> = {};
      for (const id of PROVIDER_ORDER) {
        const raw = await loadStoredKey(id);
        initial[id] = {
          maskedKey: raw ? maskKey(raw) : '',
          status: raw ? 'saved' : 'empty',
          rawInput: '',
        };
      }
      setStates(initial);
      setLoaded(true);
    }
    loadAll();
  }, []);

  const updateState = useCallback(
    (id: string, patch: Partial<ProviderKeyState>) => {
      setStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...patch },
      }));
    },
    [],
  );

  const handleSave = useCallback(
    async (id: string) => {
      const raw = states[id]?.rawInput?.trim();
      if (!raw) return;
      await saveStoredKey(id, raw);
      updateState(id, {
        maskedKey: maskKey(raw),
        status: 'saved',
        rawInput: '',
      });
    },
    [states, updateState],
  );

  const handleTest = useCallback(
    async (id: string) => {
      updateState(id, { status: 'testing' });

      // 로컬 프로바이더: endpoint 연결 확인
      if (isLocalProvider(id)) {
        try {
          const baseUrl =
            PROVIDERS[id]?.baseUrl ?? 'http://localhost:11434';
          const res = await fetch(baseUrl, { method: 'GET' });
          updateState(id, { status: res.ok ? 'valid' : 'invalid' });
        } catch {
          updateState(id, { status: 'invalid' });
        }
        return;
      }

      // 클라우드 프로바이더: 저장된 키로 간단한 요청 테스트
      const raw = await loadStoredKey(id);
      if (!raw) {
        updateState(id, { status: 'invalid' });
        return;
      }

      try {
        // 각 프로바이더별 최소 API 호출로 키 유효성 검증
        let testUrl = '';
        const headers: Record<string, string> = {};

        switch (id) {
          case 'openai':
            testUrl = 'https://api.openai.com/v1/models';
            headers['Authorization'] = `Bearer ${raw}`;
            break;
          case 'claude':
            testUrl = 'https://api.anthropic.com/v1/messages';
            headers['x-api-key'] = raw;
            headers['anthropic-version'] = '2023-06-01';
            headers['Content-Type'] = 'application/json';
            break;
          case 'gemini':
            testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${raw}`;
            break;
          case 'groq':
            testUrl = 'https://api.groq.com/openai/v1/models';
            headers['Authorization'] = `Bearer ${raw}`;
            break;
          case 'mistral':
            testUrl = 'https://api.mistral.ai/v1/models';
            headers['Authorization'] = `Bearer ${raw}`;
            break;
        }

        if (!testUrl) {
          updateState(id, { status: 'saved' });
          return;
        }

        const res = await fetch(testUrl, { method: 'GET', headers });
        // Claude /messages returns 405 on GET but 401 on bad key
        const ok = res.ok || (id === 'claude' && res.status === 405);
        updateState(id, { status: ok ? 'valid' : 'invalid' });
      } catch {
        updateState(id, { status: 'invalid' });
      }
    },
    [updateState],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteStoredKey(id);
      updateState(id, { maskedKey: '', status: 'empty', rawInput: '' });
    },
    [updateState],
  );

  // 로딩 상태
  if (!loaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/settings"
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          &larr; Settings
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        API Key Management
      </h1>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Keys are AES-256 encrypted and stored only in your browser.
      </p>

      {/* Cloud sync note for unauthenticated users */}
      {!authLoading && !user && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <Link href="/login" className="font-medium underline hover:no-underline">
            로그인
          </Link>
          하면 클라우드 동기화 가능
        </div>
      )}

      {/* Provider cards */}
      <div className="mb-8 flex flex-col gap-4">
        {PROVIDER_ORDER.map((id) => {
          const provider = PROVIDERS[id];
          if (!provider) return null;
          const state = states[id] ?? {
            maskedKey: '',
            status: 'empty' as KeyStatus,
            rawInput: '',
          };
          return (
            <ProviderKeyCard
              key={id}
              provider={provider}
              state={state}
              onSave={() => handleSave(id)}
              onTest={() => handleTest(id)}
              onDelete={() => handleDelete(id)}
              onInputChange={(v) => updateState(id, { rawInput: v })}
            />
          );
        })}
      </div>

      {/* Team Sharing Guide */}
      <div className="mb-8 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
        <h3 className="mb-3 text-base font-semibold text-[var(--text-primary)]">팀 공유 방법</h3>
        <div className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p><strong>1. 공용 API 키 발급:</strong> OpenAI/Claude 대시보드에서 팀 전용 키를 생성합니다.</p>
          <p><strong>2. 안전한 전달:</strong> 사내 메신저(Slack, Teams)로 키를 팀원에게 전달합니다.</p>
          <p><strong>3. 각 브라우저에서 등록:</strong> 팀원 각자 이 페이지에서 키를 등록합니다.</p>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            키는 각 브라우저에 AES-256 암호화 저장되며, 서버에 전송되지 않습니다.
            팀 전체가 동일한 키를 사용하면 비용을 중앙 관리할 수 있습니다.
          </p>
        </div>
      </div>

      {/* Guide & FAQ */}
      <div className="flex flex-col gap-6">
        <QuickStartGuide />
        <FAQ />
      </div>
    </main>
  );
}
