'use client';

/**
 * Mobile Field Mode — 현장 모드
 *
 * Touch-optimized interface for field engineers.
 * Large buttons, quick calculator access, offline support.
 *
 * PART 1: Types and constants
 * PART 2: Offline indicator
 * PART 3: Quick calculator grid
 * PART 4: Recent calculations
 * PART 5: Camera/Voice stubs
 * PART 6: Main page
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Zap,
  Calculator,
  Camera,
  Mic,
  WifiOff,
  Wifi,
  Clock,
  ChevronRight,
  ArrowLeft,
  Smartphone,
  History,
  AlertCircle,
  Shield,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types and Constants
// ═══════════════════════════════════════════════════════════════════════════════

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

interface QuickCalc {
  id: string;
  name: string;
  nameEn: string;
  icon: typeof Zap;
  color: string;
  bgColor: string;
  href: string;
  domain: string;
}

interface CachedResult {
  id: string;
  calculatorName: string;
  value: number | string;
  unit: string;
  timestamp: string;
}

const QUICK_CALCS: QuickCalc[] = [
  {
    id: 'voltage-drop',
    name: '전압강하',
    nameEn: 'Voltage Drop',
    icon: Zap,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 border-yellow-200',
    href: '/calc/voltage-drop/voltage-drop',
    domain: 'electrical',
  },
  {
    id: 'cable-sizing',
    name: '케이블 선정',
    nameEn: 'Cable Sizing',
    icon: Zap,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    href: '/calc/cable/cable-sizing',
    domain: 'electrical',
  },
  {
    id: 'short-circuit',
    name: '단락전류',
    nameEn: 'Short-Circuit',
    icon: Shield,
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200',
    href: '/calc/protection/short-circuit',
    domain: 'electrical',
  },
  {
    id: 'grounding',
    name: '접지 저항',
    nameEn: 'Grounding',
    icon: Zap,
    color: 'text-green-600',
    bgColor: 'bg-green-50 border-green-200',
    href: '/calc/grounding/ground-resistance',
    domain: 'electrical',
  },
  {
    id: 'single-phase-power',
    name: '단상 전력',
    nameEn: 'Single Phase',
    icon: Calculator,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 border-purple-200',
    href: '/calc/power/single-phase-power',
    domain: 'electrical',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Offline Indicator
// ═══════════════════════════════════════════════════════════════════════════════

function OfflineIndicator({ isOnline }: { isOnline: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        isOnline
          ? 'bg-green-50 text-green-700'
          : 'bg-red-50 text-red-700 animate-pulse'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="h-3.5 w-3.5" />
          온라인
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          오프라인
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Quick Calculator Grid
// ═══════════════════════════════════════════════════════════════════════════════

function QuickCalcGrid({ calcs }: { calcs: QuickCalc[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {calcs.map((calc) => {
        const Icon = calc.icon;
        return (
          <Link
            key={calc.id}
            href={calc.href}
            className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-5 transition-transform active:scale-95 ${calc.bgColor}`}
          >
            <Icon className={`h-8 w-8 ${calc.color}`} />
            <span className="text-sm font-semibold text-gray-900 text-center leading-tight">
              {calc.name}
            </span>
            <span className="text-[10px] text-gray-500">{calc.nameEn}</span>
          </Link>
        );
      })}

      {/* All calculators button */}
      <Link
        href="/calc"
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 p-5 transition-transform active:scale-95"
      >
        <Calculator className="h-8 w-8 text-gray-400" />
        <span className="text-sm font-medium text-gray-500 text-center">
          전체 보기
        </span>
      </Link>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Recent Calculations (Cached Locally)
// ═══════════════════════════════════════════════════════════════════════════════

function RecentCalculations({ results }: { results: CachedResult[] }) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
        <History className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">
          최근 계산 내역이 없습니다
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {results.map((result) => (
        <li key={result.id}>
          <Link
            href={`/receipt/${result.id}`}
            className="flex items-center justify-between rounded-xl bg-white border border-gray-200 p-4 active:bg-gray-50"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {result.calculatorName}
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                {new Date(result.timestamp).toLocaleString('ko-KR', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-blue-700">
                {result.value} <span className="text-sm font-normal text-gray-500">{result.unit}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Camera OCR and Voice Input Stubs
// ═══════════════════════════════════════════════════════════════════════════════

interface NameplateResult {
  data: {
    manufacturer?: string;
    model?: string;
    voltage?: string;
    current?: string;
    power?: string;
    frequency?: string;
    phase?: string;
    rawText: string;
    confidence: number;
  };
  suggestedCalculators: { id: string; name: string }[];
}

function CameraButton() {
  const [status, setStatus] = useState<'idle' | 'capturing' | 'processing' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<NameplateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const captureFrame = useCallback(async (): Promise<Blob> => {
    const video = videoRef.current;
    if (!video) throw new Error('Video element not available');

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');
    ctx.drawImage(video, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to capture frame'))),
        'image/jpeg',
        0.9,
      );
    });
  }, []);

  const handleCapture = async () => {
    setStatus('capturing');
    setError(null);
    setResult(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;

      // Create a temporary video element to capture from
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      videoRef.current = video;
      await video.play();

      // Brief delay for camera to focus
      await new Promise((r) => setTimeout(r, 500));

      setStatus('processing');

      const imageBlob = await captureFrame();
      stopCamera();

      // Get user's BYOK API key from localStorage
      const apiKey = localStorage.getItem('esa-byok-openai-key') ?? '';
      if (!apiKey) {
        setError('OpenAI API 키가 필요합니다. BYOK 설정에서 등록하세요. → /settings/byok');
        setStatus('error');
        return;
      }

      const formData = new FormData();
      formData.append('image', imageBlob, 'nameplate.jpg');
      formData.append('provider', 'openai');
      formData.append('apiKey', apiKey);

      const res = await fetch('/api/ocr', { method: 'POST', body: formData });
      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error ?? 'OCR 처리에 실패했습니다.');
        setStatus('error');
        return;
      }

      setResult({ data: json.data, suggestedCalculators: json.suggestedCalculators ?? [] });
      setStatus('done');
    } catch {
      stopCamera();
      setError('카메라 접근 권한이 필요합니다.');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
  };

  // Show OCR results with calculator links
  if (status === 'done' && result) {
    const d = result.data;
    return (
      <div className="col-span-2 rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">네임플레이트 인식 결과</h3>
          <button onClick={handleReset} className="text-xs text-blue-600 hover:underline">다시 촬영</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {d.manufacturer && <div><span className="text-gray-500">제조사:</span> {d.manufacturer}</div>}
          {d.model && <div><span className="text-gray-500">모델:</span> {d.model}</div>}
          {d.voltage && <div><span className="text-gray-500">전압:</span> {d.voltage}</div>}
          {d.current && <div><span className="text-gray-500">전류:</span> {d.current}</div>}
          {d.power && <div><span className="text-gray-500">전력:</span> {d.power}</div>}
          {d.frequency && <div><span className="text-gray-500">주파수:</span> {d.frequency}</div>}
          {d.phase && <div><span className="text-gray-500">상:</span> {d.phase}</div>}
        </div>
        <p className="text-[10px] text-gray-400">신뢰도: {Math.round(d.confidence * 100)}%</p>
        {result.suggestedCalculators.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-600">이 데이터로 계산하기</p>
            <div className="flex flex-wrap gap-2">
              {result.suggestedCalculators.map((calc) => (
                <Link
                  key={calc.id}
                  href={`/calc/${CALC_CATEGORY_MAP[calc.id] ?? 'power'}/${calc.id}`}
                  className="flex items-center gap-1 rounded-lg bg-white border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 active:scale-95"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  {calc.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleCapture}
        disabled={status === 'capturing' || status === 'processing'}
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white p-5 w-full transition-transform active:scale-95 disabled:opacity-50"
      >
        <Camera className={`h-8 w-8 ${status === 'processing' ? 'animate-pulse text-blue-500' : 'text-gray-600'}`} />
        <span className="text-sm font-medium text-gray-700">
          {status === 'idle' && '네임플레이트 촬영'}
          {status === 'capturing' && '촬영 중...'}
          {status === 'processing' && '인식 중...'}
          {status === 'error' && '다시 시도'}
        </span>
        <span className="text-[10px] text-gray-400">OCR Nameplate</span>
      </button>
      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}

function VoiceButton() {
  const router = useRouter();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVoice = () => {
    setError(null);

    // Feature detection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor =
      (typeof window !== 'undefined' &&
        ((window as unknown as Record<string, unknown>).SpeechRecognition ??
         (window as unknown as Record<string, unknown>).webkitSpeechRecognition)) as
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (new () => any) | false;

    if (!SpeechRecognitionCtor) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.');
      return;
    }

    setListening(true);

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript as string | undefined;
      if (transcript) {
        router.push(`/search?q=${encodeURIComponent(transcript)}`);
      }
      setListening(false);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      setListening(false);
      if (event.error === 'not-allowed') {
        setError('마이크 접근 권한이 필요합니다.');
      } else if (event.error === 'no-speech') {
        setError('음성이 감지되지 않았습니다. 다시 시도해주세요.');
      } else {
        setError('음성 인식 오류가 발생했습니다.');
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
  };

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleVoice}
        disabled={listening}
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white p-5 w-full transition-transform active:scale-95 disabled:opacity-50"
      >
        <Mic className={`h-8 w-8 ${listening ? 'animate-pulse text-red-500' : 'text-gray-600'}`} />
        <span className="text-sm font-medium text-gray-700">
          {listening ? '듣는 중...' : '음성 입력'}
        </span>
        <span className="text-[10px] text-gray-400">Voice Input</span>
      </button>
      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function MobileFieldPage() {
  const [isOnline, setIsOnline] = useState(true);
  const [recentResults, setRecentResults] = useState<CachedResult[]>([]);

  // Track online/offline status
  useEffect(() => {
    const setOnline = () => setIsOnline(true);
    const setOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);

    return () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    };
  }, []);

  // Load recent calculations from localStorage (offline-friendly)
  const loadRecentCalcs = useCallback(() => {
    try {
      const stored = localStorage.getItem('esa-recent-calcs');
      if (stored) {
        const parsed = JSON.parse(stored) as CachedResult[];
        setRecentResults(parsed.slice(0, 10));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  useEffect(() => {
    loadRecentCalcs();
  }, [loadRecentCalcs]);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Non-critical
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg p-1.5 hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-blue-600" />
              <h1 className="text-lg font-bold text-gray-900">현장 모드</h1>
            </div>
          </div>
          <OfflineIndicator isOnline={isOnline} />
        </div>
      </header>

      <main className="px-4 py-5 space-y-6 max-w-lg mx-auto">
        {/* Offline Banner */}
        {!isOnline && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <p className="font-medium">오프라인 모드</p>
            <p className="mt-1 text-amber-600">
              캐시된 계산기와 최근 결과를 사용할 수 있습니다. 일부 기능은 온라인에서만 동작합니다.
            </p>
          </div>
        )}

        {/* Quick Calculators */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            빠른 계산
          </h2>
          <QuickCalcGrid calcs={QUICK_CALCS} />
        </section>

        {/* Field Tools */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            현장 도구
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <CameraButton />
            <VoiceButton />
          </div>
        </section>

        {/* Recent Calculations */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            최근 계산 (오프라인 캐시)
          </h2>
          <RecentCalculations results={recentResults} />
        </section>
      </main>
    </div>
  );
}
