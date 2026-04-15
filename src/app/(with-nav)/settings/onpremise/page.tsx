'use client';

/**
 * ESVA On-Premise 설정 페이지
 *
 * DGX Spark 또는 자체 AI 서버 연동 설정
 * 망 분리 환경에서 프라이빗 LLM 사용 시 구성
 *
 * PART 1: 타입 및 상수
 * PART 2: 연결 테스트 훅
 * PART 3: UI 섹션 컴포넌트
 * PART 4: 메인 페이지
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 타입 및 상수
// ═══════════════════════════════════════════════════════════════════════════════

type ApiType = 'ollama' | 'vllm' | 'localai' | 'openai-compat';
type ConnectionStatus = 'idle' | 'testing' | 'success' | 'failed';

interface OnPremiseConfig {
  serverUrl: string;
  apiType: ApiType;
  modelName: string;
  apiKey: string;          // 로컬 서버 인증키 (없으면 빈 문자열)
  contextLength: number;
  timeout: number;         // 초
  enabled: boolean;
}

const DEFAULT_CONFIG: OnPremiseConfig = {
  serverUrl: 'http://192.168.1.100:11434',
  apiType: 'ollama',
  modelName: 'qwen2.5:32b',
  apiKey: '',
  contextLength: 32768,
  timeout: 60,
  enabled: false,
};

const API_TYPE_OPTIONS: { value: ApiType; label: string; placeholder: string; defaultPort: string }[] = [
  { value: 'ollama',        label: 'Ollama',          placeholder: 'http://HOST:11434',   defaultPort: '11434' },
  { value: 'vllm',          label: 'vLLM',            placeholder: 'http://HOST:8000',    defaultPort: '8000'  },
  { value: 'localai',       label: 'LocalAI',         placeholder: 'http://HOST:8080',    defaultPort: '8080'  },
  { value: 'openai-compat', label: 'OpenAI-compat',   placeholder: 'http://HOST:PORT/v1', defaultPort: '8080'  },
];

const RECOMMENDED_MODELS = [
  { name: 'qwen2.5:32b',            desc: 'Qwen 2.5 32B — KEC 한국어 처리 최적', vram: '20GB+' },
  { name: 'llama4:scout',           desc: 'Llama 4 Scout — 빠른 추론',             vram: '8GB+' },
  { name: 'mistral-small3.1:latest', desc: 'Mistral Small 3.1 — 균형형',           vram: '12GB+' },
  { name: 'gemma3:27b',             desc: 'Gemma 3 27B — 다국어 강점',             vram: '16GB+' },
];

const SECURITY_FEATURES = [
  { icon: '🔒', title: '망 분리 (Air-gap)', desc: '외부 인터넷 연결 없이 내부망에서만 동작' },
  { icon: '🏢', title: '데이터 미유출', desc: '도면·현장 데이터가 외부 서버로 전송되지 않음' },
  { icon: '💰', title: 'API 비용 0원', desc: '토큰 종량제 비용 없음. 고정비 구조로 마진 최대화' },
  { icon: '⚡', title: '응답 지연 최소', desc: '내부 네트워크로 클라우드 대비 지연 감소' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 연결 테스트
// ═══════════════════════════════════════════════════════════════════════════════

function useConnectionTest() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [detail, setDetail] = useState('');

  const test = useCallback(async (config: OnPremiseConfig) => {
    setStatus('testing');
    setDetail('서버에 연결 시도 중...');
    try {
      // 내부망 → 직접 fetch 불가. 서버사이드 프록시로 테스트.
      const res = await fetch('/api/settings/onpremise-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: config.serverUrl,
          apiType: config.apiType,
          modelName: config.modelName,
          apiKey: config.apiKey,
          timeout: config.timeout,
        }),
        signal: AbortSignal.timeout(config.timeout * 1000 + 5000),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
        setDetail(`연결 성공. 모델: ${data.data?.model ?? config.modelName} · 응답: ${data.data?.latencyMs ?? '?'}ms`);
      } else {
        setStatus('failed');
        setDetail(data.error?.message ?? '연결 실패');
      }
    } catch (e) {
      setStatus('failed');
      setDetail(e instanceof Error ? e.message : '연결 실패 — 서버 URL과 포트를 확인하세요');
    }
  }, []);

  return { status, detail, test };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — UI 섹션 컴포넌트
// ═══════════════════════════════════════════════════════════════════════════════

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="text-sm font-bold text-[var(--color-text-primary)] mb-4">{title}</h2>
      {children}
    </section>
  );
}

function FieldRow({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4">
      <div className="sm:w-36 flex-shrink-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{label}</p>
        {note && <p className="text-[10px] text-[var(--color-text-muted)]">{note}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors font-mono';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — 메인 페이지
// ═══════════════════════════════════════════════════════════════════════════════

export default function OnPremisePage() {
  const [config, setConfig] = useState<OnPremiseConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const { status, detail, test } = useConnectionTest();

  const update = <K extends keyof OnPremiseConfig>(key: K, val: OnPremiseConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const save = () => {
    // 클라이언트 세션에 저장 (BYOK 방식과 동일)
    try {
      sessionStorage.setItem('esva-onpremise', JSON.stringify(config));
    } catch { /* noop */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const statusColors: Record<ConnectionStatus, string> = {
    idle:    'text-[var(--color-text-muted)]',
    testing: 'text-yellow-400',
    success: 'text-green-400',
    failed:  'text-[var(--color-error)]',
  };
  const statusIcons: Record<ConnectionStatus, string> = {
    idle: '○', testing: '⏳', success: '✅', failed: '❌',
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/settings" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]">
            ← 설정
          </Link>
        </div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <span>🖥</span> On-Premise AI 서버
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          DGX Spark 또는 자체 GPU 서버의 LLM을 연동합니다. 도면·현장 데이터가 외부로 전송되지 않습니다.
        </p>
      </div>

      {/* 보안 장점 카드 */}
      <div className="grid grid-cols-2 gap-3">
        {SECURITY_FEATURES.map(f => (
          <div key={f.title} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="text-xl mb-1">{f.icon}</div>
            <p className="text-xs font-semibold text-[var(--color-text-primary)]">{f.title}</p>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* 활성화 토글 */}
      <SectionCard title="On-Premise 모드">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--color-text-primary)]">
              {config.enabled ? '✅ On-Premise 모드 활성' : '클라우드 API(BYOK) 사용 중'}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              활성화 시 아래 서버로 모든 AI 요청을 라우팅합니다.
            </p>
          </div>
          <button
            onClick={() => update('enabled', !config.enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              config.enabled ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </SectionCard>

      {/* 서버 설정 */}
      <SectionCard title="서버 설정">
        <div className="space-y-4">
          <FieldRow label="API 타입" note="서버 소프트웨어">
            <div className="grid grid-cols-2 gap-2">
              {API_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => update('apiType', opt.value)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    config.apiType === opt.value
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/40'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="서버 URL" note="내부망 IP/포트">
            <input
              type="url"
              value={config.serverUrl}
              onChange={e => update('serverUrl', e.target.value)}
              placeholder={API_TYPE_OPTIONS.find(o => o.value === config.apiType)?.placeholder}
              className={inputCls}
            />
          </FieldRow>

          <FieldRow label="모델명">
            <input
              type="text"
              value={config.modelName}
              onChange={e => update('modelName', e.target.value)}
              placeholder="예: qwen2.5:32b"
              className={inputCls}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {RECOMMENDED_MODELS.map(m => (
                <button
                  key={m.name}
                  onClick={() => update('modelName', m.name)}
                  title={`${m.desc} · VRAM ${m.vram}`}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  {m.name}
                </button>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="인증 키" note="없으면 비워두기">
            <input
              type="password"
              value={config.apiKey}
              onChange={e => update('apiKey', e.target.value)}
              placeholder="서버 인증 키 (없으면 빈 칸)"
              className={inputCls}
            />
          </FieldRow>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="컨텍스트 길이" note="토큰">
              <input
                type="number"
                value={config.contextLength}
                onChange={e => update('contextLength', parseInt(e.target.value, 10) || 8192)}
                min={2048} max={128000} step={1024}
                className={inputCls}
              />
            </FieldRow>
            <FieldRow label="타임아웃" note="초">
              <input
                type="number"
                value={config.timeout}
                onChange={e => update('timeout', parseInt(e.target.value, 10) || 60)}
                min={10} max={300}
                className={inputCls}
              />
            </FieldRow>
          </div>
        </div>
      </SectionCard>

      {/* 연결 테스트 */}
      <SectionCard title="연결 테스트">
        <div className="space-y-3">
          <button
            onClick={() => test(config)}
            disabled={status === 'testing' || !config.serverUrl}
            className="w-full py-3 rounded-xl font-semibold text-sm border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {status === 'testing' ? '⏳ 연결 테스트 중...' : '🔌 연결 테스트'}
          </button>
          {status !== 'idle' && (
            <div className={`text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] ${statusColors[status]}`}>
              <span className="mr-2">{statusIcons[status]}</span>
              {detail}
            </div>
          )}
          <p className="text-[10px] text-[var(--color-text-muted)]">
            ※ 테스트는 서버사이드 프록시를 통해 실행됩니다. 방화벽 정책에 따라 Vercel 서버→내부망 접근이 차단될 수 있습니다.
            완전한 망 분리 환경에서는 ESVA를 내부망에 직접 배포하세요.
          </p>
        </div>
      </SectionCard>

      {/* 저장 */}
      <div className="flex gap-3">
        <button
          onClick={save}
          className="flex-1 py-3 rounded-xl font-semibold text-sm bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white transition-all active:scale-95"
        >
          {saved ? '✅ 저장 완료' : '설정 저장'}
        </button>
        <button
          onClick={() => { setConfig(DEFAULT_CONFIG); setSaved(false); }}
          className="px-4 py-3 rounded-xl text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-all"
        >
          초기화
        </button>
      </div>

      {/* 설치 가이드 링크 */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">⚙️ 서버 설치 가이드</p>
        <div className="space-y-1">
          {[
            { label: 'Ollama 설치 (권장)',           href: 'https://ollama.com' },
            { label: 'NVIDIA DGX Spark 설정',        href: 'https://www.nvidia.com/en-us/products/workstations/dgx-spark/' },
            { label: 'vLLM 설치 문서',               href: 'https://docs.vllm.ai' },
          ].map(l => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between text-xs text-[var(--color-primary)] hover:underline py-0.5"
            >
              {l.label} <span>↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
