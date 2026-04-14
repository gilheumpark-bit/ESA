'use client';

/**
 * ESVA OCR Nameplate Tool Page
 * -----------------------------
 * Camera capture or image upload → OCR → detected parameters → calculator links.
 *
 * PART 1: State & hooks
 * PART 2: Image upload/capture
 * PART 3: Results display
 * PART 4: Main page component
 */

import { useState, useRef, useCallback } from 'react';
import {
  Camera,
  Upload,
  Loader2,
  Zap,
  RefreshCw,
  ArrowRight,
  Edit3,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { decryptKey } from '@/lib/ai-providers';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & State
// ═══════════════════════════════════════════════════════════════════════════════

const BYOK_PREFIX = 'esa-byok-';
const DEFAULT_VISION_PROVIDERS = ['openai', 'claude', 'gemini'] as const;

/** Read first available vision API key from BYOK localStorage */
async function getFirstAvailableVisionKey(): Promise<{ provider: string; key: string } | null> {
  if (typeof window === 'undefined') return null;
  for (const provider of DEFAULT_VISION_PROVIDERS) {
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

interface NameplateResult {
  manufacturer?: string;
  model?: string;
  voltage?: string;
  current?: string;
  power?: string;
  frequency?: string;
  serialNumber?: string;
  phase?: string;
  rating?: string;
  efficiency?: string;
  powerFactor?: string;
  rpm?: string;
  insulation?: string;
  protection?: string;
  rawText: string;
  confidence: number;
  language: string;
}

interface OCRResponse {
  success: boolean;
  data: NameplateResult;
  suggestedCalculators: string[];
  error?: string;
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

const CALC_LABELS: Record<string, string> = {
  'voltage-drop': '전압강하 계산',
  'cable-sizing': '케이블 사이즈 선정',
  'breaker-sizing': '차단기 선정',
  'motor-starting': '모터 기동전류',
  'motor-load': '모터 부하 계산',
  'demand-factor': '수용률 계산',
  'load-calculation': '부하 계산',
  'transformer-sizing': '변압기 용량',
  'short-circuit': '단락전류 계산',
  'three-phase-power': '3상 전력 계산',
  'power-factor-correction': '역률 보상',
};

const PARAM_LABELS: Record<string, string> = {
  manufacturer: '제조사',
  model: '모델명',
  voltage: '전압',
  current: '전류',
  power: '전력',
  frequency: '주파수',
  serialNumber: '시리얼번호',
  phase: '상수',
  rating: '정격',
  efficiency: '효율',
  powerFactor: '역률',
  rpm: '회전속도',
  insulation: '절연등급',
  protection: '보호등급',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Image Handling
// ═══════════════════════════════════════════════════════════════════════════════

function ImageUploader({
  onImageSelect,
  preview,
  onReset,
}: {
  onImageSelect: (file: File) => void;
  preview: string | null;
  onReset: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="명판 이미지"
            className="w-full rounded-xl border border-[var(--border-default)] object-contain"
            style={{ maxHeight: 400 }}
          />
          <button
            onClick={onReset}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Camera capture */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-12 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            <Camera size={24} />
            카메라 촬영
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onImageSelect(file);
            }}
          />

          {/* File upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-secondary)] px-6 py-12 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            <Upload size={24} />
            이미지 업로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onImageSelect(file);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Results Display
// ═══════════════════════════════════════════════════════════════════════════════

function ParameterRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: (newValue: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-xs font-medium text-[var(--text-tertiary)]">
          {label}
        </span>
        <input
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          className="flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-sm"
          autoFocus
        />
        <button
          onClick={() => {
            onEdit(editValue);
            setEditing(false);
          }}
          className="rounded p-1 text-green-600 hover:bg-green-50"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => {
            setEditValue(value);
            setEditing(false);
          }}
          className="rounded p-1 text-red-500 hover:bg-red-50"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-medium text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
        {value}
      </span>
      <button
        onClick={() => setEditing(true)}
        className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
      >
        <Edit3 size={12} />
      </button>
    </div>
  );
}

function OCRResults({
  result,
  suggestedCalcs,
  onParamEdit,
}: {
  result: NameplateResult;
  suggestedCalcs: string[];
  onParamEdit: (key: string, value: string) => void;
}) {
  const params = Object.entries(PARAM_LABELS)
    .filter(([key]) => result[key as keyof NameplateResult])
    .map(([key, label]) => ({
      key,
      label,
      value: String(result[key as keyof NameplateResult]),
    }));

  return (
    <div className="space-y-6">
      {/* Confidence */}
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${Math.round(result.confidence * 100)}%` }}
          />
        </div>
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          인식 정확도 {Math.round(result.confidence * 100)}%
        </span>
      </div>

      {/* Parameters */}
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          인식된 파라미터
        </h3>
        <div className="space-y-2.5">
          {params.length > 0 ? (
            params.map(({ key, label, value }) => (
              <ParameterRow
                key={key}
                label={label}
                value={value}
                onEdit={newVal => onParamEdit(key, newVal)}
              />
            ))
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">
              인식된 파라미터가 없습니다. 이미지를 다시 촬영해 주세요.
            </p>
          )}
        </div>
      </div>

      {/* Raw text */}
      {result.rawText && (
        <details className="rounded-xl border border-[var(--border-default)]">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-[var(--text-secondary)]">
            원본 OCR 텍스트
          </summary>
          <pre className="whitespace-pre-wrap border-t border-[var(--border-default)] px-4 py-3 text-xs text-[var(--text-tertiary)]">
            {result.rawText}
          </pre>
        </details>
      )}

      {/* Suggested calculators */}
      {suggestedCalcs.length > 0 && (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            이 데이터로 계산하기
          </h3>
          <div className="flex flex-wrap gap-2">
            {suggestedCalcs.map(calcId => (
              <Link
                key={calcId}
                href={`/calc/${CALC_CATEGORY_MAP[calcId] ?? 'power'}/${calcId}?${buildCalcParams(result, calcId)}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)]/5 px-3 py-2 text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
              >
                <Zap size={12} />
                {CALC_LABELS[calcId] ?? calcId}
                <ArrowRight size={12} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function buildCalcParams(result: NameplateResult, calcId: string): string {
  const params = new URLSearchParams();
  if (result.voltage) params.set('voltage', result.voltage);
  if (result.current) params.set('current', result.current);
  if (result.power) params.set('power', result.power);
  if (result.powerFactor) params.set('powerFactor', result.powerFactor);
  if (result.phase) params.set('phase', result.phase);
  if (result.frequency) params.set('frequency', result.frequency);
  params.set('source', 'ocr');
  params.set('calc', calcId);
  return params.toString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function OCRNameplatePage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<NameplateResult | null>(null);
  const [suggestedCalcs, setSuggestedCalcs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageSelect = useCallback((file: File) => {
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setSuggestedCalcs([]);
    setError(null);
  }, []);

  const handleReset = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setImageFile(null);
    setPreview(null);
    setResult(null);
    setSuggestedCalcs([]);
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

      const res = await fetch('/api/ocr', { method: 'POST', body: formData });
      const data: OCRResponse = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'OCR 처리에 실패했습니다');
      }

      setResult(data.data);
      setSuggestedCalcs(data.suggestedCalculators);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR 처리 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }, [imageFile]);

  const handleParamEdit = useCallback((key: string, value: string) => {
    setResult(prev => (prev ? { ...prev, [key]: value } : null));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          명판 OCR 인식
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          장비 명판을 촬영하거나 업로드하면 AI가 전기 파라미터를 자동으로 추출합니다.
        </p>
      </div>

      {/* Image upload */}
      <ImageUploader
        onImageSelect={handleImageSelect}
        preview={preview}
        onReset={handleReset}
      />

      {/* Analyze button */}
      {imageFile && !result && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                AI 분석 중...
              </>
            ) : (
              <>
                <Zap size={18} />
                명판 분석하기
              </>
            )}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-[var(--color-error)]" />
          <p className="text-sm text-[var(--color-error)]">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-6">
          <div className="mb-4 flex items-center justify-between">
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
          <OCRResults
            result={result}
            suggestedCalcs={suggestedCalcs}
            onParamEdit={handleParamEdit}
          />
        </div>
      )}
    </div>
  );
}
