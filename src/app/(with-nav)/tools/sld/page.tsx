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
import { useRouter } from 'next/navigation';
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
import { getFirstAvailableVisionKey } from '@/lib/vision-byok';
import Image from 'next/image';
import { isFeatureEnabled } from '@/lib/feature-flags';

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
  const router = useRouter();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SLDAnalysisResult | null>(null);
  const [calcChain, setCalcChain] = useState<CalcChainStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 사내 규정(선택) — JSON 룰셋. 서버가 린트하고 무효면 400으로 거절한다.
  const [rulesFile, setRulesFile] = useState<File | null>(null);
  // 정밀 검증(3개 전문팀 + 합의 단계)용 — 마지막 업로드 원본 파일과 진행 상태.
  // 배선 전엔 /api/team-review·/report/[id]가 UI에서 영구 미도달이었다(Batch C1).
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  // DXF를 기본탭으로 — API 키 없이 즉시 분석 가능 (BYOK 장벽 제거)
  const [activeTab, setActiveTab] = useState<'image' | 'dxf' | 'pdf'>('dxf');

  const handleImageSelect = useCallback((file: File) => {
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setAnalysis(null);
    setCalcChain([]);
    setError(null);
  }, []);

  // 정밀 검토: 파싱 결과를 전문팀 리뷰와 별도 합의 단계로 전달한다.
  const handleTeamReview = useCallback(async () => {
    if (!drawingFile) {
      setReviewError('원본 도면 파일이 없습니다 — 파일을 다시 업로드해 주세요.');
      return;
    }
    setReviewLoading(true);
    setReviewError(null);
    try {
      const formData = new FormData();
      formData.append('file', drawingFile);
      formData.append('projectName', 'SLD 정밀 검증');
      formData.append('projectType', '전기 설비');
      if (rulesFile) formData.append('rules', rulesFile);
      if (drawingFile.type.startsWith('image/')) {
        const visionKey = await getFirstAvailableVisionKey();
        if (!visionKey) {
          throw new Error('이미지 전문팀 검토에는 OpenAI, Claude 또는 Gemini BYOK 키가 필요합니다.');
        }
        formData.append('provider', visionKey.provider);
        formData.append('apiKey', visionKey.key);
      }
      const { getIdToken } = await import('@/lib/firebase');
      const token = await getIdToken().catch(() => null);
      const res = await fetch('/api/team-review', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? `팀 리뷰 실패 (${res.status})`);
      }
      const full = json.data?.reportFull;
      if (!full?.reportId) {
        throw new Error('리포트가 생성되지 않았습니다 (팀 실행 실패 — 도면 인식 결과를 확인하세요).');
      }
      sessionStorage.setItem(`esva-report-${full.reportId}`, JSON.stringify(full));
      router.push(`/report/${full.reportId}`);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : '정밀 검증 오류');
    } finally {
      setReviewLoading(false);
    }
  }, [drawingFile, rulesFile, router]);

  const handleReset = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setImageFile(null);
    setPreview(null);
    setDrawingFile(null);
    setReviewError(null);
    setAnalysis(null);
    setCalcChain([]);
    setError(null);
  }, [preview]);

  const handleAnalyze = useCallback(async () => {
    if (!imageFile) return;

    if (imageFile) setDrawingFile(imageFile);
    setLoading(true);
    setError(null);

    try {
      const visionKey = await getFirstAvailableVisionKey();
      if (!visionKey) {
        setError('API 키가 설정되지 않았습니다. BYOK 설정 페이지에서 Vision API 키를 등록하세요. → /settings/byok');
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

  // DXF 벡터 파싱 (DRAWING_PARSER 플래그 필수)
  const handleDxfUpload = useCallback(async (file: File) => {
    if (!isFeatureEnabled('DRAWING_PARSER')) {
      setError('DXF 파싱이 비활성입니다 (DRAWING_PARSER=false). 이미지 AI 분석을 사용하거나 플래그를 켜세요.');
      return;
    }
    setDrawingFile(file);
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setCalcChain([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/dxf', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? data.message ?? 'DXF 파싱 실패');
      setAnalysis(data.data);
      setCalcChain(data.calcChain ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DXF 파싱 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  // PDF 벡터 파싱 (DRAWING_PARSER 플래그 필수)
  const handlePdfUpload = useCallback(async (file: File) => {
    if (!isFeatureEnabled('DRAWING_PARSER')) {
      setError('PDF 파싱이 비활성입니다 (DRAWING_PARSER=false). 이미지 AI 분석을 사용하거나 플래그를 켜세요.');
      return;
    }
    setDrawingFile(file);
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setCalcChain([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/pdf-drawing', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? data.message ?? 'PDF 파싱 실패');
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
          형식에 맞는 분석기로 기기·연결 후보를 추출하고, 확인이 필요한 계산 항목과 HOLD 근거를 정리합니다.
        </p>

        {/* 분석 모드 탭 — DXF/PDF는 DRAWING_PARSER 플래그 없으면 비활성 */}
        <div className="mt-4 flex gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
          {([
            { id: 'image' as const, label: '이미지 AI 분석', enabled: true },
            { id: 'dxf' as const, label: 'DXF 벡터 파싱', enabled: isFeatureEnabled('DRAWING_PARSER') },
            { id: 'pdf' as const, label: 'PDF 벡터 파싱', enabled: isFeatureEnabled('DRAWING_PARSER') },
          ]).map(tab => (
            <button
              key={tab.id}
              type="button"
              disabled={!tab.enabled}
              onClick={() => {
                if (!tab.enabled) {
                  setError(`${tab.label}은 DRAWING_PARSER 플래그가 꺼져 있습니다.`);
                  return;
                }
                setActiveTab(tab.id);
                setError(null);
              }}
              aria-label={`${tab.label} 탭 선택`}
              aria-pressed={activeTab === tab.id}
              aria-disabled={!tab.enabled}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                !tab.enabled
                  ? 'cursor-not-allowed text-[var(--text-tertiary)] opacity-50'
                  : activeTab === tab.id
                    ? 'bg-[var(--bg-primary)] text-[var(--color-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}{!tab.enabled ? ' (OFF)' : ''}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          {activeTab === 'image'
            ? 'Vision AI로 도면 이미지를 분석합니다 (BYOK API 키 필요). 인식 값은 미검증(HOLD)일 수 있습니다.'
            : isFeatureEnabled('DRAWING_PARSER')
              ? 'AI 없이 벡터 좌표에서 직접 추출합니다 (API 키 불필요).'
              : 'DXF/PDF 파서는 현재 비활성(DRAWING_PARSER=false)입니다. 이미지 AI 분석을 사용하세요.'}
        </p>
      </div>

      {/* Upload area — 탭별 분기 */}
      {activeTab === 'image' && (
        <>
          {preview ? (
            <div className="relative mb-4">
              <Image src={preview} alt="단선도" width={1400} height={900} unoptimized className="w-full rounded-xl border border-[var(--border-default)] object-contain" style={{ maxHeight: 500 }} />
              <button type="button" onClick={handleReset} aria-label="도면 삭제" className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()}
              aria-label="단선도 이미지 업로드"
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
          <button type="button" onClick={() => dxfInputRef.current?.click()}
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
          <button type="button" onClick={() => pdfInputRef.current?.click()}
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
          type="button"
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
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-[var(--color-error)]" />
          <div>
            <p className="text-sm text-[var(--color-error)]">{error}</p>
            {error.includes('API 키') && (
              <a href="/settings/byok" className="mt-1 inline-block text-sm font-medium text-blue-600 hover:underline">
                BYOK 설정 페이지로 이동 →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Analysis results */}
      {analysis && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              분석 결과
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTeamReview}
                disabled={reviewLoading || !drawingFile}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reviewLoading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    전문팀 검증 중… (수십 초)
                  </>
                ) : (
                  <>
                    <GitBranch size={12} />
                    정밀 검증 (3개 전문팀 + 합의)
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
              >
                <RefreshCw size={12} />
                다시 분석
              </button>
            </div>
          </div>

          {/* 사내 규정 첨부(선택) — 정밀 검증 시 KEC와 나란히 대조된다 */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-2.5">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              사내 규정 (선택, JSON)
            </span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => setRulesFile(e.target.files?.[0] ?? null)}
              className="text-xs text-[var(--text-secondary)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--bg-primary)] file:px-2 file:py-1 file:text-xs file:text-[var(--text-primary)]"
            />
            {rulesFile && (
              <span className="text-xs text-[var(--text-tertiary)]">
                {rulesFile.name} — 정밀 검증 시 함께 대조
              </span>
            )}
          </div>

          {reviewError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-[var(--color-error)]" />
              <p className="text-sm text-[var(--color-error)]">{reviewError}</p>
            </div>
          )}

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
