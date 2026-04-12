'use client';

/**
 * ESVA SLD Analysis Tool Page
 * ----------------------------
 * Upload/capture SLD image → AI analysis → component list → connection map → calc chain.
 *
 * PART 1: Types & state
 * PART 2: Component list display
 * PART 3: Connection map display
 * PART 4: Calculation chain display
 * PART 5: Main page component
 */

import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Loader2,
  Zap,
  RefreshCw,
  ArrowRight,
  X,
  AlertCircle,
  GitBranch,
  Box,
  Link2,
  PlayCircle,
} from 'lucide-react';
import Link from 'next/link';
import { decryptKey } from '@/lib/ai-providers';
import { isFeatureEnabled } from '@/lib/feature-flags';

const BYOK_PREFIX = 'esa-byok-';
const VISION_PROVIDERS = ['openai', 'claude', 'gemini'] as const;

async function getFirstAvailableVisionKey(): Promise<{ provider: string; key: string } | null> {
  if (typeof window === 'undefined') return null;
  for (const provider of VISION_PROVIDERS) {
    const stored = localStorage.getItem(BYOK_PREFIX + provider);
    if (stored) {
      try {
        const key = await decryptKey(stored);
        if (key) return { provider, key };
      } catch { /* skip */ }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

interface SLDComponent {
  id: string;
  type: string;
  label?: string;
  rating?: string;
  voltage?: string;
  current?: string;
  position: { x: number; y: number };
}

interface SLDConnection {
  id: string;
  from: string;
  to: string;
  cableType?: string;
  length?: string;
  conductorSize?: string;
}

interface CalcChainStep {
  step: number;
  calculatorId: string;
  inputs: Record<string, unknown>;
  dependsOn?: number[];
  description: string;
}

interface SLDAnalysisResult {
  components: SLDComponent[];
  connections: SLDConnection[];
  suggestedCalculations: Array<{
    calculatorId: string;
    inputs: Record<string, unknown>;
    reason: string;
    priority: number;
  }>;
  systemVoltage?: string;
  systemType?: string;
  confidence: number;
  rawDescription: string;
}

const CALC_CATEGORY_MAP: Record<string, string> = {
  'voltage-drop': 'voltage-drop',
  'cable-sizing': 'cable',
  'ground-resistance': 'grounding',
  'single-phase-power': 'power',
  'three-phase-power': 'power',
  'short-circuit': 'protection',
  'breaker-sizing': 'protection',
  'transformer-capacity': 'transformer',
  'solar-generation': 'renewable',
  'battery-capacity': 'renewable',
  'motor-capacity': 'motor',
};

const COMPONENT_ICONS: Record<string, string> = {
  transformer: 'TX',
  breaker: 'CB',
  cable: 'CA',
  bus: 'BUS',
  generator: 'GEN',
  motor: 'MOT',
  capacitor: 'CAP',
  load: 'LD',
  switch: 'SW',
  relay: 'RLY',
  meter: 'MTR',
  panel: 'PNL',
  ups: 'UPS',
  mcc: 'MCC',
};

const COMPONENT_COLORS: Record<string, string> = {
  transformer: 'bg-amber-100 text-amber-800 border-amber-300',
  breaker: 'bg-red-100 text-red-800 border-red-300',
  cable: 'bg-gray-100 text-gray-800 border-gray-300',
  bus: 'bg-blue-100 text-blue-800 border-blue-300',
  generator: 'bg-green-100 text-green-800 border-green-300',
  motor: 'bg-purple-100 text-purple-800 border-purple-300',
  capacitor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  load: 'bg-orange-100 text-orange-800 border-orange-300',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Component List
// ═══════════════════════════════════════════════════════════════════════════════

function ComponentList({ components }: { components: SLDComponent[] }) {
  if (!components.length) return null;

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Box size={16} className="text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          인식된 기기 ({components.length}개)
        </h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {components.map(comp => (
          <div
            key={comp.id}
            className={`flex items-center gap-3 rounded-lg border p-3 ${
              COMPONENT_COLORS[comp.type] ?? 'bg-gray-50 text-gray-800 border-gray-200'
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/60 text-xs font-bold">
              {COMPONENT_ICONS[comp.type] ?? comp.type.slice(0, 3).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {comp.label ?? comp.type}
              </p>
              <div className="flex flex-wrap gap-1.5 text-[10px] opacity-80">
                {comp.rating && <span>{comp.rating}</span>}
                {comp.voltage && <span>{comp.voltage}</span>}
                {comp.current && <span>{comp.current}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Connection Map
// ═══════════════════════════════════════════════════════════════════════════════

function ConnectionMap({
  connections,
  components,
}: {
  connections: SLDConnection[];
  components: SLDComponent[];
}) {
  if (!connections.length) return null;

  const getLabel = (id: string) => {
    const comp = components.find(c => c.id === id);
    return comp?.label ?? comp?.type ?? id;
  };

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link2 size={16} className="text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          연결 맵 ({connections.length}개)
        </h3>
      </div>
      <div className="space-y-2">
        {connections.map(conn => (
          <div
            key={conn.id}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-sm"
          >
            <span className="font-medium text-[var(--text-primary)]">
              {getLabel(conn.from)}
            </span>
            <ArrowRight size={14} className="shrink-0 text-[var(--text-tertiary)]" />
            <span className="font-medium text-[var(--text-primary)]">
              {getLabel(conn.to)}
            </span>
            {(conn.cableType || conn.length || conn.conductorSize) && (
              <span className="ml-auto text-xs text-[var(--text-tertiary)]">
                {[conn.cableType, conn.conductorSize, conn.length]
                  .filter(Boolean)
                  .join(' / ')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Calculation Chain
// ═══════════════════════════════════════════════════════════════════════════════

function CalcChain({ steps }: { steps: CalcChainStep[] }) {
  if (!steps.length) return null;

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <GitBranch size={16} className="text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          추천 계산 순서
        </h3>
      </div>
      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={step.step} className="flex items-start gap-3">
            {/* Step number */}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
              {step.step}
            </div>

            {/* Step content */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {step.description}
              </p>
              {step.dependsOn && step.dependsOn.length > 0 && (
                <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
                  Step {step.dependsOn.join(', ')} 완료 후 실행
                </p>
              )}
            </div>

            {/* Run button */}
            <Link
              href={`/calc/${CALC_CATEGORY_MAP[step.calculatorId] ?? 'power'}/${step.calculatorId}?source=sld`}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
            >
              <PlayCircle size={12} />
              실행
            </Link>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className="absolute left-[13px] top-7 h-6 w-0.5 bg-[var(--border-default)]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function SLDAnalysisPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SLDAnalysisResult | null>(null);
  const [calcChain, setCalcChain] = useState<CalcChainStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'image' | 'dxf' | 'pdf'>('image');

  const handleImageSelect = useCallback((file: File) => {
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setAnalysis(null);
    setCalcChain([]);
    setError(null);
  }, []);

  const handleReset = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setImageFile(null);
    setPreview(null);
    setAnalysis(null);
    setCalcChain([]);
    setError(null);
  }, [preview]);

  const handleAnalyze = useCallback(async () => {
    if (!imageFile) return;

    setLoading(true);
    setError(null);

    try {
      const visionKey = await getFirstAvailableVisionKey();
      if (!visionKey) {
        setError('API 키가 설정되지 않았습니다. 설정 > BYOK에서 OpenAI, Claude, 또는 Gemini API 키를 입력하세요.');
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('provider', visionKey.provider);
      formData.append('model', '');
      formData.append('apiKey', visionKey.key);

      const res = await fetch('/api/sld', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'SLD 분석에 실패했습니다');
      }

      setAnalysis(data.data);
      setCalcChain(data.calcChain ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SLD 분석 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }, [imageFile]);

  // DXF 벡터 파싱
  const handleDxfUpload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setCalcChain([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/dxf', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'DXF 파싱 실패');
      setAnalysis(data.data);
      setCalcChain(data.calcChain ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DXF 파싱 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  // PDF 벡터 파싱
  const handlePdfUpload = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setCalcChain([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/pdf-drawing', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'PDF 파싱 실패');
      setAnalysis(data.data);
      setCalcChain(data.calcChain ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 파싱 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          도면 분석
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          도면을 업로드하면 AI가 기기 구성을 분석하고 필요한 계산 순서를 자동으로 생성합니다.
        </p>

        {/* 분석 모드 탭 */}
        <div className="mt-4 flex gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
          {[
            { id: 'image' as const, label: '이미지 AI 분석' },
            { id: 'dxf' as const, label: 'DXF 벡터 파싱' },
            { id: 'pdf' as const, label: 'PDF 벡터 파싱' },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setError(null); }}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-primary)] text-[var(--color-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          {activeTab === 'image'
            ? 'Vision AI로 도면 이미지를 분석합니다 (BYOK API 키 필요)'
            : 'AI 없이 벡터 좌표에서 직접 추출하여 정확도가 높습니다 (API 키 불필요)'}
        </p>
      </div>

      {/* Upload area — 탭별 분기 */}
      {activeTab === 'image' && (
        <>
          {preview ? (
            <div className="relative mb-4">
              <img src={preview} alt="단선도" className="w-full rounded-xl border border-[var(--border-default)] object-contain" style={{ maxHeight: 500 }} />
              <button onClick={handleReset} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()}
              className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-16 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
              <Upload size={28} />
              <div className="text-center">
                <p className="font-semibold">단선도 이미지 업로드</p>
                <p className="mt-1 text-xs opacity-70">JPEG, PNG, WebP (최대 20MB)</p>
              </div>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => { const file = e.target.files?.[0]; if (file) handleImageSelect(file); }} />
        </>
      )}

      {activeTab === 'dxf' && (
        <>
          <button onClick={() => dxfInputRef.current?.click()}
            className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-16 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            <Upload size={28} />
            <div className="text-center">
              <p className="font-semibold">DXF 파일 업로드</p>
              <p className="mt-1 text-xs opacity-70">AutoCAD DXF 파일 (최대 50MB) — API 키 불필요</p>
            </div>
          </button>
          <input ref={dxfInputRef} type="file" accept=".dxf" className="hidden"
            onChange={e => { const file = e.target.files?.[0]; if (file) handleDxfUpload(file); }} />
        </>
      )}

      {activeTab === 'pdf' && (
        <>
          <button onClick={() => pdfInputRef.current?.click()}
            className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-16 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
            <Upload size={28} />
            <div className="text-center">
              <p className="font-semibold">PDF 도면 업로드</p>
              <p className="mt-1 text-xs opacity-70">CAD 출력 PDF 파일 (최대 100MB) — API 키 불필요</p>
            </div>
          </button>
          <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { const file = e.target.files?.[0]; if (file) handlePdfUpload(file); }} />
        </>
      )}

      {/* Analyze button */}
      {imageFile && !analysis && (
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              단선도 AI 분석 중... (10~30초 소요)
            </>
          ) : (
            <>
              <Zap size={18} />
              단선도 분석하기
            </>
          )}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Analysis results */}
      {analysis && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              분석 결과
            </h2>
            <button
              onClick={handleReset}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
            >
              <RefreshCw size={12} />
              다시 분석
            </button>
          </div>

          {/* System info */}
          {(analysis.systemVoltage || analysis.systemType) && (
            <div className="flex flex-wrap gap-3 rounded-xl bg-[var(--bg-secondary)] px-4 py-3 text-sm">
              {analysis.systemVoltage && (
                <span>
                  <span className="text-[var(--text-tertiary)]">계통전압: </span>
                  <span className="font-medium text-[var(--text-primary)]">{analysis.systemVoltage}</span>
                </span>
              )}
              {analysis.systemType && (
                <span>
                  <span className="text-[var(--text-tertiary)]">방식: </span>
                  <span className="font-medium text-[var(--text-primary)]">{analysis.systemType}</span>
                </span>
              )}
              <span>
                <span className="text-[var(--text-tertiary)]">정확도: </span>
                <span className="font-medium text-[var(--text-primary)]">
                  {Math.round(analysis.confidence * 100)}%
                </span>
              </span>
            </div>
          )}

          <ComponentList components={analysis.components} />
          <ConnectionMap connections={analysis.connections} components={analysis.components} />
          <CalcChain steps={calcChain} />
        </div>
      )}
    </div>
  );
}
