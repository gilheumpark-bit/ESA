'use client';

/**
 * ESVA BYOK Key Management Page
 * -----------------------------
 * Cloud API keys are encrypted with a browser-bound key before ciphertext is
 * stored locally. Local providers are configured on the on-premise page.
 *
 * PART 1: Types & constants
 * PART 2: Provider key card component
 * PART 3: Quick start guide & FAQ
 * PART 4: Main page component
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  PROVIDERS,
  isLocalProvider,
  type AIProvider,
} from '@/lib/ai-providers';
import {
  deleteStoredProviderKey,
  loadStoredProviderKey,
  saveStoredProviderKey,
} from '@/lib/byok-storage';

// =============================================================================
// PART 1 — Types & Constants
// =============================================================================

type KeyStatus = 'empty' | 'saved' | 'testing' | 'valid' | 'invalid' | 'unavailable';

interface ProviderKeyState {
  maskedKey: string;
  status: KeyStatus;
  rawInput: string;
}

const PROVIDER_ORDER: string[] = [
  'openai',
  'claude',
  'gemini',
  'groq',
  'mistral',
  'ollama',
  'lmstudio',
];

const STATUS_LABEL: Record<KeyStatus, string> = {
  empty: '',
  saved: '저장됨',
  testing: '확인 중…',
  valid: '유효함',
  invalid: '유효하지 않음',
  unavailable: '확인 일시 실패',
};

/** 마지막 4자 마스킹 */
function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return '****' + key.slice(-4);
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
              로컬 서버 — API 키가 없을 수 있습니다
            </span>
          )}
        </div>
        {state.status !== 'empty' && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {STATUS_LABEL[state.status]}
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
          <label
            htmlFor={`provider-key-${provider.id}`}
            className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
          >
            {provider.name} API 키
          </label>
          <input
            id={`provider-key-${provider.id}`}
            type="password"
            value={state.rawInput}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={`${provider.name} API 키를 입력하세요`}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500"
          />
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        {showInput && !isLocal && (
          <button
            type="button"
            onClick={onSave}
            disabled={!state.rawInput.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            저장
          </button>
        )}
        {!isLocal && (
          <button
            type="button"
            onClick={onTest}
            disabled={state.status === 'testing' || state.status === 'empty'}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            키 확인
          </button>
        )}
        {isLocal && (
          <Link
            href="/settings/onpremise"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            로컬 서버 설정
          </Link>
        )}
        {hasSavedKey && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            삭제
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
        API 키 발급 빠른 안내
      </h2>
      <ol className="list-inside list-decimal space-y-2 text-sm text-amber-800 dark:text-amber-300">
        <li>
          <strong>OpenAI</strong> — platform.openai.com &rarr; API Keys &rarr;
          Create new secret key
        </li>
        <li>
          <strong>Anthropic</strong> — console.anthropic.com &rarr; API Keys
          &rarr; Create Key
        </li>
        <li>
          <strong>Google Gemini</strong> — aistudio.google.com &rarr; Get API
          key
        </li>
        <li>
          <strong>Groq</strong> — console.groq.com &rarr; API Keys &rarr;
          Create
        </li>
        <li>
          <strong>Mistral</strong> — console.mistral.ai &rarr; API Keys
        </li>
        <li>
          <strong>Ollama / LM Studio</strong> — 로컬 설치 후 On-Premise 설정에서 연결
        </li>
      </ol>
    </section>
  );
}

function FAQ() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        BYOK 자주 묻는 질문
      </h2>
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <div>
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            BYOK란 무엇인가요?
          </p>
          <p>
            Bring Your Own Key의 약자입니다. 사용자가 AI 공급자 키를 직접 등록하며,
            ESVA는 이 브라우저에 암호문만 저장합니다. 서버 대행 기능은 해당 요청에서만
            복호화된 키를 전달하고 저장하지 않습니다.
          </p>
        </div>
        <div>
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            키는 어떻게 보호되나요?
          </p>
          <p>
            내보낼 수 없는 브라우저 결합 키로 AES-256-GCM 암호화합니다. localStorage의
            암호문만 복사해서는 복호화할 수 없습니다. 다만 브라우저 세션이 침해되면 사용
            중인 키가 노출될 수 있으므로 공급자별 한도·만료·교체 정책을 함께 적용하세요.
          </p>
        </div>
        <div>
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            어떤 공급자를 선택해야 하나요?
          </p>
          <p>
            데이터 정책, 필요한 모델 능력, 지연시간, 예산을 기준으로 선택하세요. Ollama와
            LM Studio는 On-Premise 설정을 완료하면 로컬 엔드포인트에서 추론합니다.
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
  const [states, setStates] = useState<Record<string, ProviderKeyState>>({});
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  // localStorage에서 저장된 키 로드
  useEffect(() => {
    async function loadAll() {
      const initial: Record<string, ProviderKeyState> = {};
      for (const id of PROVIDER_ORDER) {
        let raw: string | null = null;
        try {
          raw = await loadStoredProviderKey(id);
        } catch {
          setStorageError('기존 키를 안전한 브라우저 저장소로 이전하지 못했습니다. HTTPS 환경의 최신 브라우저에서 키를 다시 등록하세요.');
        }
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
      try {
        await saveStoredProviderKey(id, raw);
        setStorageError(null);
        updateState(id, {
          maskedKey: maskKey(raw),
          status: 'saved',
          rawInput: '',
        });
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : 'API 키를 안전하게 저장하지 못했습니다.');
        updateState(id, { status: 'invalid' });
      }
    },
    [states, updateState],
  );

  const handleTest = useCallback(
    async (id: string) => {
      if (isLocalProvider(id)) return;
      updateState(id, { status: 'testing' });

      let raw: string | null = null;
      try {
        raw = await loadStoredProviderKey(id);
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : '저장된 API 키를 복호화하지 못했습니다.');
      }
      if (!raw) {
        updateState(id, { status: 'invalid' });
        return;
      }

      try {
        const response = await fetch('/api/settings/byok-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: id, apiKey: raw }),
        });
        if (!response.ok) {
          updateState(id, { status: 'unavailable' });
          return;
        }

        const body = await response.json() as { data?: { valid?: boolean } };
        updateState(id, { status: body.data?.valid ? 'valid' : 'invalid' });
      } catch {
        updateState(id, { status: 'unavailable' });
      }
    },
    [updateState],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const ok = window.confirm('이 API 키를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.');
      if (!ok) return;
      deleteStoredProviderKey(id);
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
          &larr; 설정
        </Link>
      </div>

      <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        API 키 관리
      </h1>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        API 키는 이 브라우저에 기기 결합 AES-256-GCM으로 저장됩니다.
      </p>

      {storageError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {storageError}
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
          <p><strong>1. 사용자를 구분한 키 발급:</strong> 가능하면 팀 공용 키 대신 구성원별 제한 키를 생성합니다.</p>
          <p><strong>2. 안전한 전달:</strong> 조직의 비밀 관리 도구나 만료되는 일회성 비밀 링크를 사용합니다.</p>
          <p><strong>3. 각 브라우저에서 등록:</strong> 팀원 각자 이 페이지에서 키를 등록합니다.</p>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            암호문은 각 브라우저에 저장됩니다. OCR·SLD·채팅처럼 ESA 서버가 공급자 호출을
            대행하는 기능에서는 해당 요청 동안 복호화된 키가 HTTPS로 전달되며 저장하지 않습니다.
            공급자 콘솔에서 사용 한도, 허용 모델, 만료일을 함께 설정하세요.
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
