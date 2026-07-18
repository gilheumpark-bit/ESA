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

import { useState, useRef, useCallback, useId } from 'react';

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
}

const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg,.svg,.dxf';
const MAX_FILE_MB = 20;

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
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`파일 크기는 ${MAX_FILE_MB}MB 이하여야 합니다.`);
      return;
    }
    const url = URL.createObjectURL(f);
    onUpload({ name: f.name, type: f.type, url, size: f.size });
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
          <div className="text-5xl mb-4">📐</div>
          <p className="text-[var(--color-text-primary)] font-semibold mb-1">
            도면 / 견적서 업로드
          </p>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            PDF, PNG, JPG, SVG, DXF 지원 · 최대 {MAX_FILE_MB}MB
          </p>
          <label
            htmlFor={inputId}
            className="cursor-pointer inline-block px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-all"
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
            📄 {file.name}
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

  // 이미지 뷰어 (PNG, JPG, SVG)
  if (file.type.startsWith('image/') || file.name.endsWith('.svg')) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <span className="text-sm text-[var(--color-text-secondary)] truncate max-w-[70%]">
            🖼 {file.name}
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
      <div className="text-4xl mb-3">📁</div>
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: file
        ? `도면 **${file.name}** 을 확인했습니다. 검토할 항목을 말씀해 주세요.`
        : '안녕하세요. 도면이나 견적서를 왼쪽에 업로드하면 함께 검토해드립니다. 또는 바로 질문하셔도 됩니다.',
      timestamp: new Date().toLocaleTimeString('ko-KR'),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 파일 변경 시 안내 메시지 추가
  const prevFileName = useRef<string | null>(null);
  if (file && file.name !== prevFileName.current) {
    prevFileName.current = file.name;
    if (messages[messages.length - 1]?.content !== `도면 **${file.name}** 을 확인했습니다. 검토할 항목을 말씀해 주세요.`) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `도면 **${file.name}** 이 업로드되었습니다. 검토 요청사항을 입력해 주세요.`,
          timestamp: new Date().toLocaleTimeString('ko-KR'),
        },
      ]);
    }
  }

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString('ko-KR'),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: file ? `[도면: ${file.name}] ${text}` : text,
          mode: 'studio',
        }),
      });
      const data = await res.json();
      // search API: studio mode → data.answer (요약) 또는 data.data.documents 상위 항목 사용
      const docs: Array<{ title: string; excerpt: string }> = data.data?.documents ?? [];
      const answer: string =
        data.answer ??
        data.data?.answer ??
        (docs.length > 0
          ? docs.slice(0, 3).map(d => `**${d.title}**\n${d.excerpt}`).join('\n\n')
          : '검색 결과를 불러오지 못했습니다. API 키(BYOK)를 확인하거나 잠시 후 다시 시도해 주세요.');
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: answer, timestamp: new Date().toLocaleTimeString('ko-KR') },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          timestamp: new Date().toLocaleTimeString('ko-KR'),
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [file, isLoading]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">⚡ ESA AI 검토</span>
        {file && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20">
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
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-primary)]'
            }`}>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-white/60' : 'text-[var(--color-text-muted)]'}`}>
                {msg.timestamp}
              </p>
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
        <div className="flex gap-2">
          <label htmlFor={inputId} className="sr-only">메시지 입력</label>
          <input
            id={inputId}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }}
            placeholder="도면 검토 요청 또는 규정 질의..."
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] px-3 py-2.5 text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
          />
          <button
            onClick={() => void sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="px-4 rounded-xl bg-[var(--color-primary)] text-white font-semibold text-sm hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            전송
          </button>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5 px-1">
          Enter로 전송 · BYOK 키 설정 시 AI 답변 활성화
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
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 드래그 리사이즈
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(75, Math.max(25, pct)));
    };
    const onUp = () => { isDragging.current = false; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex-shrink-0">
        <h1 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <span>🔬</span> Engineer Studio
          <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20">
            Split-view
          </span>
        </h1>
        <p className="text-xs text-[var(--color-text-muted)]">
          왼쪽 패널을 드래그하여 크기 조정
        </p>
      </div>

      {/* Split 영역 */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* 왼쪽: 도면 뷰어 */}
        <div style={{ width: `${leftWidth}%` }} className="flex-shrink-0 overflow-hidden border-r border-[var(--color-border)]">
          <ViewerPanel file={file} onUpload={setFile} />
        </div>

        {/* 리사이즈 핸들 */}
        <div
          className="w-1 cursor-col-resize bg-[var(--color-border)] hover:bg-[var(--color-primary)]/50 transition-colors flex-shrink-0"
          onMouseDown={handleMouseDown}
        />

        {/* 오른쪽: AI 채팅 */}
        <div className="flex-1 overflow-hidden">
          <ChatPanel file={file} />
        </div>
      </div>

      {/* 모바일 안내 */}
      <div className="md:hidden px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] text-center">
        <p className="text-xs text-[var(--color-text-muted)]">
          최적 사용 환경: 데스크탑 (1280px 이상)
        </p>
      </div>
    </div>
  );
}
