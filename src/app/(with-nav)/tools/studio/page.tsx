'use client';

/**
 * ESVA Engineer Studio — Split-view
 *
 * 왼쪽: 도면/견적서 뷰어 (PDF·이미지·DXF 업로드)
 * 오른쪽: AI 챗봇 + 계산 결과
 *
 * PART 1: 타입 및 상수
 * PART 2: 뷰어 패널
 * PART 3: AI 채팅 패널
 * PART 4: 메인 레이아웃
 */

import { useState, useRef, useCallback, useId, useEffect, type PointerEvent } from 'react';
import {
  Bot,
  DraftingCompass,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Microscope,
} from 'lucide-react';
import { getFirstAvailableVisionKey } from '@/lib/vision-byok';
import { requestElectricalChat } from '@/lib/electrical-chat-client';
import { readStoredLanguage } from '@/hooks/useSettings';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 타입 및 상수
// ═══════════════════════════════════════════════════════════════════════════════

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface UploadedFile {
  name: string;
  type: string;
  url: string;       // object URL
  size: number;
  source: File;
}

const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg,.webp,.dxf';
const MAX_FILE_MB = 20;
const ACCEPTED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'dxf']);

function formatTime(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

const QUICK_PROMPTS = [
  '케이블 트레이 충전율 확인해줘',
  '이 도면에서 차단기 용량 검토해줘',
  '전압강하 계산해줘',
  '접지 방식 적합한지 확인',
  '분기회로 전선 굵기 맞는지 확인해줘',
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 뷰어 패널
// ═══════════════════════════════════════════════════════════════════════════════

interface ViewerPanelProps {
  file: UploadedFile | null;
  onUpload: (file: UploadedFile) => void;
}

function ViewerPanel({ file, onUpload }: ViewerPanelProps) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    const extension = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      alert('PDF, PNG, JPG, WebP, DXF 파일만 열 수 있습니다.');
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`파일 크기는 ${MAX_FILE_MB}MB 이하여야 합니다.`);
      return;
    }
    const url = URL.createObjectURL(f);
    onUpload({ name: f.name, type: f.type, url, size: f.size, source: f });
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // 파일 없을 때 드롭존
  if (!file) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
          dragOver
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
            : 'border-[var(--color-border)] bg-[var(--color-surface)]'
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="text-center px-6">
          <DraftingCompass aria-hidden="true" className="mx-auto mb-4 h-12 w-12 text-[var(--color-primary)]" />
          <p className="text-[var(--color-text-primary)] font-semibold mb-1">
            도면 / 견적서 업로드
          </p>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            PDF, PNG, JPG, WebP, DXF 지원 · 최대 {MAX_FILE_MB}MB
          </p>
          <label
            htmlFor={inputId}
            className="cursor-pointer inline-block px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-[var(--drawing-on-primary)] text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-all"
          >
            파일 선택
          </label>
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_TYPES}
            className="sr-only"
            onChange={handleChange}
          />
          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
            또는 파일을 여기로 드래그하세요
          </p>
        </div>
      </div>
    );
  }

  // PDF 뷰어
  if (file.type === 'application/pdf') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <span className="text-sm text-[var(--color-text-secondary)] truncate max-w-[70%]">
            <FileText aria-hidden="true" className="mr-1 inline h-4 w-4" /> {file.name}
          </span>
          <label htmlFor={inputId} className="cursor-pointer text-xs text-[var(--color-primary)] hover:underline">
            교체
            <input id={inputId} type="file" accept={ACCEPTED_TYPES} className="sr-only" onChange={handleChange} />
          </label>
        </div>
        <iframe
          src={`${file.url}#toolbar=0`}
          className="flex-1 w-full"
          title="PDF 뷰어"
        />
      </div>
    );
  }

  // 이미지 뷰어 (PNG, JPG, WebP)
  if (file.type.startsWith('image/')) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <span className="text-sm text-[var(--color-text-secondary)] truncate max-w-[70%]">
            <ImageIcon aria-hidden="true" className="mr-1 inline h-4 w-4" /> {file.name}
          </span>
          <label htmlFor={inputId} className="cursor-pointer text-xs text-[var(--color-primary)] hover:underline">
            교체
            <input id={inputId} type="file" accept={ACCEPTED_TYPES} className="sr-only" onChange={handleChange} />
          </label>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-start justify-center bg-[var(--color-surface-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.url}
            alt={file.name}
            className="max-w-full object-contain"
          />
        </div>
      </div>
    );
  }

  // DXF 등 텍스트 기반 (미리보기 제한)
  return (
    <div className="flex h-full flex-col items-center justify-center bg-[var(--color-surface)] rounded-xl">
      <FolderOpen aria-hidden="true" className="mb-3 h-10 w-10 text-[var(--color-primary)]" />
      <p className="text-[var(--color-text-primary)] font-semibold">{file.name}</p>
      <p className="text-sm text-[var(--color-text-muted)] mt-1">
        DXF 파일 — AI 채팅에서 분석 요청하세요
      </p>
      <label htmlFor={inputId} className="mt-4 cursor-pointer text-xs text-[var(--color-primary)] hover:underline">
        다른 파일 열기
        <input id={inputId} type="file" accept={ACCEPTED_TYPES} className="sr-only" onChange={handleChange} />
      </label>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — AI 채팅 패널
// ═══════════════════════════════════════════════════════════════════════════════

interface ChatPanelProps {
  file: UploadedFile | null;
}

function ChatPanel({ file }: ChatPanelProps) {
  const inputId = useId();
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      role: 'assistant',
      content: file
        ? `${file.name} 파일을 열었습니다. 질문을 전송하면 파일 원문을 포함한 전문팀 검토를 시작합니다.`
        : '안녕하세요. 도면이나 견적서를 왼쪽에 업로드하면 함께 검토해드립니다. 또는 바로 질문하셔도 됩니다.',
      // SSR과 첫 클라이언트 렌더가 반드시 같아야 하므로 초기 시각은 비워 둔다.
      timestamp: '',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: formatTime(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      let answer: string;
      if (file) {
        const formData = new FormData();
        formData.append('file', file.source);
        formData.append('query', text);
        formData.append('projectName', file.name);
        formData.append('projectType', 'Engineer Studio 파일 검토');
        if (file.type.startsWith('image/')) {
          const visionKey = await getFirstAvailableVisionKey();
          if (!visionKey) {
            throw new Error('이미지 전문팀 검토에는 로컬 ChatGPT 계정 또는 Vision API 키가 필요합니다.');
          }
          formData.append('provider', visionKey.provider);
          formData.append('model', visionKey.model);
          if (visionKey.key) formData.append('apiKey', visionKey.key);
        }
        const { getIdToken } = await import('@/lib/firebase');
        const token = await getIdToken().catch(() => null);
        const res = await fetch('/api/team-review', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formData,
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error?.message ?? `파일 검토 실패 (${res.status})`);
        }
        const full = data.data?.reportFull;
        if (full?.reportId) {
          sessionStorage.setItem(`esva-report-${full.reportId}`, JSON.stringify(full));
          const summary = full.summary?.textKo || '전문팀 검토가 완료되었습니다.';
          answer = `${summary}\n\n판정 ${full.verdict} · 등급 ${full.grade} · 점수 ${full.compositeScore}\n보고서: /report/${full.reportId}`;
        } else {
          const teams = (data.data?.teamSummary ?? [])
            .filter((team: { success?: boolean }) => team.success)
            .map((team: { teamId: string }) => team.teamId)
            .join(', ');
          answer = `파일 검토는 실행됐지만 다중팀 합의 보고서는 생성되지 않았습니다.${teams ? ` 성공 팀: ${teams}.` : ''} 입력 종류와 팀별 오류를 확인해 주세요.`;
        }
      } else {
        const conversation = messages.slice(1).map(({ role, content }) => ({ role, content }));
        const result = await requestElectricalChat(
          [...conversation, { role: 'user', content: text.trim() }],
          readStoredLanguage(),
        );
        answer = result.calculation
          ? `[ESA 계산기 실행 · ${result.calculation.calculatorName}]\n\n${result.text}`
          : result.text;
      }
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: answer, timestamp: formatTime() },
      ]);
    } catch (error) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: error instanceof Error ? error.message : '요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [file, isLoading, messages]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-[var(--color-surface)]">
      {/* 헤더 */}
      <div className="min-w-0 shrink-0 px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
        <Bot aria-hidden="true" className="h-4 w-4 text-[var(--color-primary)]" />
        <span className="shrink-0 text-sm font-semibold text-[var(--color-text-primary)]">ESA 전문 검토</span>
        {file && (
          <span title={file.name} className="min-w-0 truncate text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20">
            {file.name}
          </span>
        )}
      </div>

      {/* 빠른 질문 버튼 */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] flex gap-2 overflow-x-auto scrollbar-none">
        {QUICK_PROMPTS.map(p => (
          <button
            key={p}
            onClick={() => sendMessage(p)}
            className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/50 hover:text-[var(--color-text-primary)] transition-colors whitespace-nowrap"
          >
            {p}
          </button>
        ))}
      </div>

      {/* 메시지 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl [overflow-wrap:anywhere] px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-[var(--color-primary)] text-[var(--drawing-on-primary)]'
                : 'bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-primary)]'
            }`}>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              {msg.timestamp && (
                <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-current opacity-70' : 'text-[var(--color-text-muted)]'}`}>
                  {msg.timestamp}
                </p>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-4 py-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-[var(--color-primary)]/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력 */}
      <div className="px-3 py-3 border-t border-[var(--color-border)]">
        <div className="flex min-w-0 gap-2">
          <label htmlFor={inputId} className="sr-only">메시지 입력</label>
          <input
            id={inputId}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
            placeholder="도면 검토 요청 또는 규정 질의..."
            className="min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
          />
          <button
            onClick={() => void sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="shrink-0 px-3 sm:px-4 rounded-xl bg-[var(--color-primary)] text-[var(--drawing-on-primary)] font-semibold text-sm hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            전송
          </button>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5 px-1">
          Enter로 전송 · AI 연결 설정 시 답변 활성화
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — 메인 레이아웃 (Split-view)
// ═══════════════════════════════════════════════════════════════════════════════

export default function StudioPage() {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [leftWidth, setLeftWidth] = useState(50); // % 기준
  const resizePointer = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleUpload = useCallback((nextFile: UploadedFile) => {
    setFile(previous => {
      if (previous) URL.revokeObjectURL(previous.url);
      return nextFile;
    });
  }, []);

  useEffect(() => () => {
    if (file) URL.revokeObjectURL(file.url);
  }, [file]);

  // Capture the active pointer instead of leaving window listeners after a drag.
  const resizeFromPointer = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 8) return;
    const pct = ((clientX - rect.left - 4) / (rect.width - 8)) * 100;
    setLeftWidth(Math.min(75, Math.max(25, pct)));
  }, []);
  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    resizePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeFromPointer(event.clientX);
  }, [resizeFromPointer]);
  const handlePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (resizePointer.current !== event.pointerId) return;
    resizePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div className="studio-workspace flex min-w-0 flex-col">
      {/* 상단 툴바 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0">
        <h1 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <Microscope aria-hidden="true" className="h-4 w-4" /> Engineer Studio
          <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20">
            Split-view
          </span>
        </h1>
        <p className="hidden text-xs text-[var(--color-text-muted)] md:block">
          구분선을 드래그하거나 방향키로 크기 조정
        </p>
      </div>

      {/* Split 영역 */}
      <div ref={containerRef}
        style={{ gridTemplateColumns: `minmax(0, ${leftWidth}fr) 8px minmax(0, ${100 - leftWidth}fr)` }}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto md:grid md:overflow-hidden">
        {/* 왼쪽: 도면 뷰어 */}
        <div
          id="studio-viewer"
          className="h-[42vh] min-w-0 flex-shrink-0 overflow-hidden border-b border-[var(--color-border)] md:h-full md:border-b-0"
        >
          <ViewerPanel file={file} onUpload={handleUpload} />
        </div>

        {/* 리사이즈 핸들 */}
        <div
          role="separator"
          aria-label="도면과 검토 패널 너비 조절"
          aria-orientation="vertical"
          aria-valuemin={25}
          aria-valuemax={75}
          aria-valuenow={Math.round(leftWidth)}
          aria-valuetext={`도면 ${Math.round(leftWidth)}%, 검토 ${100 - Math.round(leftWidth)}%`}
          aria-controls="studio-viewer studio-chat"
          tabIndex={0}
          className="hidden cursor-col-resize touch-none select-none bg-[var(--color-border)] transition-colors hover:bg-[var(--color-primary)]/50 focus-visible:outline-offset-[-2px] md:block"
          onPointerDown={handlePointerDown}
          onPointerMove={event => {
            if (resizePointer.current === event.pointerId) resizeFromPointer(event.clientX);
          }}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={() => { resizePointer.current = null; }}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            if (event.key === 'Home') setLeftWidth(25);
            else if (event.key === 'End') setLeftWidth(75);
            else setLeftWidth(width => Math.min(75, Math.max(25, width + (event.key === 'ArrowRight' ? 5 : -5))));
          }}
        />

        {/* 오른쪽: AI 채팅 */}
        <div id="studio-chat" className="min-h-[50vh] min-w-0 flex-1 overflow-hidden md:min-h-0">
          <ChatPanel key={file?.url ?? 'no-file'} file={file} />
        </div>
      </div>

    </div>
  );
}
