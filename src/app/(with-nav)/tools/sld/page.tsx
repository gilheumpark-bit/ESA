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

import { useState, useRef, useCallback, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Square,
} from 'lucide-react';
import Link from 'next/link';
import { getFirstAvailableVisionKey } from '@/lib/vision-byok';
import Image from 'next/image';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { DrawingDocumentV3Report } from '@/components/DrawingDocumentV3Report';
import { DrawingSourcePreview } from '@/components/DrawingSourcePreview';
import ReviewReportPanel, { type ReviewLike } from '@/components/ReviewReportPanel';
import {
  labelDocumentReadStatus,
  labelJobStatus,
  labelPageStatus,
} from '@/components/drawing-v3-labels';
import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';

const V3_JOB_SESSION_KEY = 'esva-sld-v3-active-job';

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
  transformer: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800',
  breaker: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800',
  cable: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800/60 dark:text-gray-200 dark:border-gray-700',
  bus: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800',
  generator: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800',
  motor: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800',
  capacitor: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-800',
  load: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800',
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
              COMPONENT_COLORS[comp.type] ?? 'bg-gray-50 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/60 text-xs font-bold dark:bg-black/30">
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
  const [review, setReview] = useState<ReviewLike | null>(null);
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
  // V3 전체 문서 판독 작업 (다중 페이지 · COMPLETE/PARTIAL)
  const [v3Doc, setV3Doc] = useState<DrawingDocumentV3 | null>(null);
  const [v3JobId, setV3JobId] = useState<string | null>(null);
  const [v3Loading, setV3Loading] = useState(false);
  const [v3Error, setV3Error] = useState<string | null>(null);
  const [v3ResumeAvailable, setV3ResumeAvailable] = useState(false);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | undefined>();
  const [v3SourceFile, setV3SourceFile] = useState<File | null>(null);
  const [v3PageIndex, setV3PageIndex] = useState(0);
  const [v3Cancelling, setV3Cancelling] = useState(false);
  const [v3JobStatus, setV3JobStatus] = useState<string | null>(null);
  const [v3CorrectionTarget, setV3CorrectionTarget] = useState<string | null>(null);
  const v3CorrectionInFlightRef = useRef<Set<string>>(new Set());
  const fullDocInputRef = useRef<HTMLInputElement>(null);
  const canResumeV3 = Boolean(
    v3ResumeAvailable
    && v3Doc?.jobStatus === 'PARTIAL'
    && !v3Loading
    && !v3CorrectionTarget,
  );

  const handleImageSelect = useCallback((file: File) => {
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setAnalysis(null);
    setCalcChain([]);
    setReview(null);
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
        formData.append('model', visionKey.model);
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
      const drawingHash = full.drawingIntelligence?.drawingHash
        ?? full.drawingSynthesis?.drawingHash
        ?? full.teamResults?.find((result: { drawingReview?: { snapshot?: { drawingHash?: string } } }) => (
          result.drawingReview?.snapshot?.drawingHash
        ))?.drawingReview?.snapshot?.drawingHash;
      if (typeof drawingHash === 'string') {
        const { storeDrawingAsset } = await import('@/lib/drawing-asset-store');
        await storeDrawingAsset(drawingFile, drawingHash, drawingFile.name);
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
    setReview(null);
    setError(null);
    setV3Doc(null);
    setV3JobId(null);
    setV3Error(null);
    setV3ResumeAvailable(false);
    setSelectedDisplayId(undefined);
    setV3SourceFile(null);
    setV3PageIndex(0);
    setV3Cancelling(false);
    setV3JobStatus(null);
    setV3CorrectionTarget(null);
    v3CorrectionInFlightRef.current.clear();
    sessionStorage.removeItem(V3_JOB_SESSION_KEY);
  }, [preview]);

  const handleFullDocumentAnalyze = useCallback(async (file: File) => {
    setV3Loading(true);
    setV3Error(null);
    setV3Doc(null);
    setV3JobId(null);
    setV3JobStatus(null);
    setV3ResumeAvailable(false);
    setV3CorrectionTarget(null);
    v3CorrectionInFlightRef.current.clear();
    setV3SourceFile(file);
    setV3PageIndex(0);
    setSelectedDisplayId(undefined);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pages', 'all');
      formData.append('leaseSource', '1');
      formData.append('deferred', '1');
      const { getIdToken } = await import('@/lib/firebase');
      const token = await getIdToken().catch(() => null);
      const createResponse = await fetch('/api/drawing-jobs', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const created = await createResponse.json();
      if (!createResponse.ok || !created?.success) {
        throw new Error(created?.error?.message ?? `전체 문서 작업 생성 실패 (${createResponse.status})`);
      }
      const jobId = String(created.data.jobId);
      setV3JobId(jobId);
      setV3JobStatus(String(created.data.status));
      sessionStorage.setItem(V3_JOB_SESSION_KEY, jobId);

      const runForm = new FormData();
      const visionKey = await getFirstAvailableVisionKey();
      if (visionKey) {
        runForm.append('provider', visionKey.provider);
        runForm.append('model', visionKey.model);
        runForm.append('apiKey', visionKey.key);
      }
      const runResponse = await fetch(`/api/drawing-jobs/${jobId}/run`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: runForm,
      });
      const result = await runResponse.json();
      if (!runResponse.ok || !result?.success) {
        throw new Error(result?.error?.message ?? `전체 문서 분석 실패 (${runResponse.status})`);
      }
      const completed = result.data.document as DrawingDocumentV3;
      setV3Doc(completed);
      setV3JobStatus(String(result.data.status));
      setV3ResumeAvailable(Boolean(result.data.resumeAvailable) && completed.jobStatus === 'PARTIAL');
    } catch (err) {
      setV3Error(err instanceof Error ? err.message : '전체 문서 분석 오류');
    } finally {
      setV3Loading(false);
    }
  }, []);

  useEffect(() => {
    if (v3JobId) return;
    const savedJobId = sessionStorage.getItem(V3_JOB_SESSION_KEY);
    if (!savedJobId) return;
    let disposed = false;
    void (async () => {
      const { getIdToken } = await import('@/lib/firebase');
      const token = await getIdToken().catch(() => null);
      const response = await fetch(`/api/drawing-jobs?jobId=${encodeURIComponent(savedJobId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const json = await response.json().catch(() => null);
      if (disposed) return;
      if (!response.ok || !json?.success) {
        sessionStorage.removeItem(V3_JOB_SESSION_KEY);
        return;
      }
      setV3JobId(savedJobId);
      setV3JobStatus(String(json.data.status));
      if (json.data.document) {
        const restored = json.data.document as DrawingDocumentV3;
        setV3Doc(restored);
        setV3ResumeAvailable(restored.jobStatus === 'PARTIAL');
      }
      if (!['COMPLETE', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(String(json.data.status))) setV3Loading(true);
    })();
    return () => { disposed = true; };
  }, [v3JobId]);

  useEffect(() => {
    if (!v3Loading || !v3JobId) return;
    let disposed = false;
    const poll = async () => {
      const { getIdToken } = await import('@/lib/firebase');
      const token = await getIdToken().catch(() => null);
      const response = await fetch(`/api/drawing-jobs?jobId=${encodeURIComponent(v3JobId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const json = await response.json().catch(() => null);
      if (disposed || !response.ok || !json?.success) return;
      setV3JobStatus(String(json.data.status));
      if (json.data.document) {
        const polled = json.data.document as DrawingDocumentV3;
        setV3Doc(polled);
        setV3ResumeAvailable(polled.jobStatus === 'PARTIAL');
      }
      if (['COMPLETE', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(String(json.data.status))) setV3Loading(false);
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 1_500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [v3JobId, v3Loading]);

  const handleV3Cancel = useCallback(async () => {
    if (!v3JobId || v3Cancelling) return;
    setV3Cancelling(true);
    setV3Error(null);
    try {
      const { getIdToken } = await import('@/lib/firebase');
      const token = await getIdToken().catch(() => null);
      const response = await fetch(`/api/drawing-jobs?jobId=${encodeURIComponent(v3JobId)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error?.message ?? '취소 요청을 처리하지 못했습니다.');
      setV3ResumeAvailable(false);
      setV3JobStatus('CANCELLED');
      sessionStorage.removeItem(V3_JOB_SESSION_KEY);
      setV3Error('분석을 취소했습니다. 보안을 위해 서버의 임시 원본도 삭제했습니다.');
    } catch (err) {
      setV3Error(err instanceof Error ? err.message : '분석 취소 오류');
    } finally {
      setV3Cancelling(false);
    }
  }, [v3Cancelling, v3JobId]);

  const handleV3Resume = useCallback(async () => {
    if (!v3JobId || !canResumeV3) return;
    setV3Loading(true);
    setV3Error(null);
    try {
      const formData = new FormData();
      const visionKey = await getFirstAvailableVisionKey();
      if (visionKey) {
        formData.append('provider', visionKey.provider);
        formData.append('model', visionKey.model);
        formData.append('apiKey', visionKey.key);
      }
      const { getIdToken } = await import('@/lib/firebase');
      const token = await getIdToken().catch(() => null);
      const response = await fetch(`/api/drawing-jobs/${v3JobId}/resume`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error?.message ?? '분석 재개에 실패했습니다.');
      const resumed = json.data.document as DrawingDocumentV3;
      setV3Doc(resumed);
      setV3JobStatus(String(json.data.status));
      setV3ResumeAvailable(Boolean(json.data.resumeAvailable) && resumed.jobStatus === 'PARTIAL');
    } catch (err) {
      setV3Error(err instanceof Error ? err.message : '전체 문서 분석 재개 오류');
    } finally {
      setV3Loading(false);
    }
  }, [canResumeV3, v3JobId]);

  const handleV3Correct = useCallback(async (
    targetDisplayId: string,
    selectedValue: string,
    candidates: string[],
  ) => {
    if (!v3JobId || v3CorrectionInFlightRef.current.has(targetDisplayId) || v3CorrectionInFlightRef.current.size > 0) return;
    v3CorrectionInFlightRef.current.add(targetDisplayId);
    setV3CorrectionTarget(targetDisplayId);
    setV3Error(null);
    try {
      const { getIdToken } = await import('@/lib/firebase');
      const token = await getIdToken().catch(() => null);
      const res = await fetch(`/api/drawing-jobs/${v3JobId}/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          targetDisplayId,
          selectedValue,
          correctionKind: targetDisplayId.includes('-T') ? 'text' : 'type',
          expectedUpdatedAt: v3Doc?.updatedAt,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.document) {
        throw new Error(json?.error?.message ?? `수정값을 반영하지 못했습니다. (${res.status})`);
      }
      const corrected = json.data.document as DrawingDocumentV3;
      setV3Doc(corrected);
      setV3JobStatus(corrected.jobStatus);
      setV3ResumeAvailable(Boolean(json.data.resumeAvailable) && corrected.jobStatus === 'PARTIAL');
    } catch (err) {
      setV3Error(err instanceof Error ? err.message : '수정값 반영 중 오류가 발생했습니다.');
    } finally {
      v3CorrectionInFlightRef.current.delete(targetDisplayId);
      setV3CorrectionTarget((current) => current === targetDisplayId ? null : current);
    }
  }, [v3Doc, v3JobId]);

  const handleV3Select = useCallback((displayId: string) => {
    setSelectedDisplayId(displayId);
    if (!v3Doc) return;
    const entity = [
      ...v3Doc.evidenceGraph.symbols,
      ...v3Doc.evidenceGraph.lines,
      ...v3Doc.evidenceGraph.texts,
      ...v3Doc.evidenceGraph.relations,
    ].find((item) => item.displayId === displayId);
    const pageIndex = entity?.evidence[0]?.pageIndex;
    if (pageIndex !== undefined) setV3PageIndex(pageIndex);
  }, [v3Doc]);

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
      formData.append('model', visionKey.model);
      formData.append('apiKey', visionKey.key);

      const res = await fetch('/api/sld', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'SLD 분석에 실패했습니다');
      }

      setAnalysis(data.data);
      setCalcChain(data.calcChain ?? []);
      setReview(data.review ?? null);
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
    setReview(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/dxf', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? data.message ?? 'DXF 파싱 실패');
      setAnalysis(data.data);
      setCalcChain(data.calcChain ?? []);
      setReview(data.review ?? null);
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
    setReview(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/pdf-drawing', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? data.message ?? 'PDF 파싱 실패');
      setAnalysis(data.data);
      setCalcChain(data.calcChain ?? []);
      setReview(data.review ?? null);
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

      {/* V3 전체 문서 완전 판독 */}
      <section className="mt-8 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
        <h2 className="text-base font-bold text-[var(--text-primary)]">전체 문서 판독 (V3)</h2>
        <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
          모든 페이지 조사 · 역할 분리 심사 · 수량 분리 · 근거 기반 제안. 단일 페이지 `/api/pdf-drawing`과 별도 작업 API입니다.
        </p>
        {v3JobStatus && <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]" role="status">작업 상태: {labelJobStatus(v3JobStatus)}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fullDocInputRef.current?.click()}
            disabled={v3Loading}
            className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {v3Loading ? '전체 분석 중…' : 'PDF/DXF/이미지 전체 분석'}
          </button>
          {canResumeV3 && (
            <button
              type="button"
              onClick={() => void handleV3Resume()}
              disabled={v3Loading}
              className="min-h-11 rounded-xl border border-[var(--color-primary)] px-4 text-xs font-semibold text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              미완료 페이지만 이어서 분석
            </button>
          )}
          {v3Loading && v3JobId && (
            <button
              type="button"
              onClick={() => void handleV3Cancel()}
              disabled={v3Cancelling}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--color-error)] px-4 text-xs font-semibold text-[var(--color-error)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square size={13} aria-hidden="true" />
              {v3Cancelling ? '취소 처리 중' : '분석 중단'}
            </button>
          )}
          <input
            ref={fullDocInputRef}
            type="file"
            accept=".pdf,.dxf,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFullDocumentAnalyze(file);
            }}
          />
        </div>
        {v3Error && (
          <p className="mt-2 text-sm text-[var(--color-error)]" role="alert">{v3Error}</p>
        )}
        {v3Loading && (
          <div className="mt-3 flex min-h-11 items-center gap-2 border-y border-[var(--border-default)] py-2 text-sm text-[var(--text-secondary)]" role="status" aria-live="polite">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            전체 조사 후 구획별 기호·선로·문자를 독립 판독하고 있습니다.
          </div>
        )}
        {v3Doc && (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-y border-[var(--border-default)] py-2">
              <p className="text-xs text-[var(--text-secondary)]">
                상태 <strong className="text-[var(--text-primary)]">{labelDocumentReadStatus(v3Doc.verification.documentStatus)}</strong>
                {' · '}완료 {v3Doc.pages.filter((page) => page.status === 'complete' || page.status === 'skipped-empty').length}/{v3Doc.pages.length}페이지
              </p>
              <div className="flex items-center gap-1" aria-label="도면 페이지 이동">
                <button type="button" aria-label="이전 페이지" disabled={v3Doc.pages.findIndex((page) => page.pageIndex === v3PageIndex) <= 0} onClick={() => {
                  const position = v3Doc.pages.findIndex((page) => page.pageIndex === v3PageIndex);
                  if (position > 0) setV3PageIndex(v3Doc.pages[position - 1].pageIndex);
                }} className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--border-default)] disabled:opacity-40"><ChevronLeft size={16} aria-hidden="true" /></button>
                <label htmlFor="v3-page" className="sr-only">표시할 페이지</label>
                <select id="v3-page" value={v3PageIndex} onChange={(event) => setV3PageIndex(Number(event.target.value))} className="min-h-11 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm tabular-nums">
                  {v3Doc.pages.map((page) => <option key={page.pageIndex} value={page.pageIndex}>{page.pageIndex + 1}페이지 · {labelPageStatus(page.status)}</option>)}
                </select>
                <button type="button" aria-label="다음 페이지" disabled={v3Doc.pages.findIndex((page) => page.pageIndex === v3PageIndex) >= v3Doc.pages.length - 1} onClick={() => {
                  const position = v3Doc.pages.findIndex((page) => page.pageIndex === v3PageIndex);
                  if (position >= 0 && position < v3Doc.pages.length - 1) setV3PageIndex(v3Doc.pages[position + 1].pageIndex);
                }} className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--border-default)] disabled:opacity-40"><ChevronRight size={16} aria-hidden="true" /></button>
              </div>
            </div>
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
              {v3SourceFile ? (
                <DrawingSourcePreview document={v3Doc} file={v3SourceFile} pageIndex={v3PageIndex} selectedDisplayId={selectedDisplayId} onSelectDisplayId={handleV3Select} />
              ) : (
                <div className="flex min-h-72 items-center justify-center rounded-[10px] border border-[var(--border-default)] text-sm text-[var(--text-secondary)]">원본 미리보기는 이 브라우저 세션에서만 표시됩니다.</div>
              )}
              <DrawingDocumentV3Report
                document={v3Doc}
                selectedDisplayId={selectedDisplayId}
                onSelectDisplayId={handleV3Select}
                onCorrect={handleV3Correct}
                correctingDisplayId={v3CorrectionTarget ?? undefined}
              />
            </div>
          </div>
        )}
      </section>

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
          <ReviewReportPanel review={review} />
        </div>
      )}
    </div>
  );
}
