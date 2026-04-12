'use client';

/**
 * SplitView — 리사이즈 가능한 분할 뷰
 * ------------------------------------
 * 좌/우 (또는 상/하) 패널을 드래그로 크기 조절.
 * 계산기 입력/결과, 기준서 목록/상세, 도면/마킹 등에 사용.
 *
 * Props:
 *   left/right: ReactNode — 좌우 패널 콘텐츠
 *   direction: 'horizontal' | 'vertical'
 *   defaultRatio: 초기 비율 (0~1, 기본 0.5)
 *   minRatio: 최소 비율 (기본 0.2)
 *   maxRatio: 최대 비율 (기본 0.8)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { GripVertical, GripHorizontal, Maximize2, Minimize2 } from 'lucide-react';

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  direction?: 'horizontal' | 'vertical';
  defaultRatio?: number;
  minRatio?: number;
  maxRatio?: number;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
  /** 모바일에서 탭 전환 모드 (기본: true) */
  mobileTabMode?: boolean;
}

export default function SplitView({
  left,
  right,
  direction = 'horizontal',
  defaultRatio = 0.5,
  minRatio = 0.2,
  maxRatio = 0.8,
  leftLabel = '패널 1',
  rightLabel = '패널 2',
  className = '',
  mobileTabMode = true,
}: Props) {
  const [ratio, setRatio] = useState(defaultRatio);
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<'none' | 'left' | 'right'>('none');
  const [mobileTab, setMobileTab] = useState<'left' | 'right'>('left');
  const containerRef = useRef<HTMLDivElement>(null);

  // 드래그 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newRatio: number;

      if (direction === 'horizontal') {
        newRatio = (e.clientX - rect.left) / rect.width;
      } else {
        newRatio = (e.clientY - rect.top) / rect.height;
      }

      setRatio(Math.max(minRatio, Math.min(maxRatio, newRatio)));
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, minRatio, maxRatio]);

  // 터치 지원
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (!containerRef.current || !e.touches[0]) return;
      const rect = containerRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      let newRatio: number;

      if (direction === 'horizontal') {
        newRatio = (touch.clientX - rect.left) / rect.width;
      } else {
        newRatio = (touch.clientY - rect.top) / rect.height;
      }

      setRatio(Math.max(minRatio, Math.min(maxRatio, newRatio)));
    };

    const handleTouchEnd = () => setIsDragging(false);

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, direction, minRatio, maxRatio]);

  // 접기/펼치기
  const toggleCollapse = useCallback((side: 'left' | 'right') => {
    setIsCollapsed(prev => prev === side ? 'none' : side);
  }, []);

  const effectiveRatio = isCollapsed === 'left' ? 0.02 : isCollapsed === 'right' ? 0.98 : ratio;

  const isHorizontal = direction === 'horizontal';
  const GripIcon = isHorizontal ? GripVertical : GripHorizontal;

  return (
    <div className={`flex flex-col ${className}`}>
      {/* 모바일: 탭 전환 모드 */}
      {mobileTabMode && (
        <div className="flex border-b border-[var(--border-default)] md:hidden">
          <button
            onClick={() => setMobileTab('left')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === 'left'
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            {leftLabel}
          </button>
          <button
            onClick={() => setMobileTab('right')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === 'right'
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'text-[var(--text-tertiary)]'
            }`}
          >
            {rightLabel}
          </button>
        </div>
      )}

      {/* 모바일: 탭 콘텐츠 */}
      {mobileTabMode && (
        <div className="md:hidden">
          <div className={mobileTab === 'left' ? '' : 'hidden'}>{left}</div>
          <div className={mobileTab === 'right' ? '' : 'hidden'}>{right}</div>
        </div>
      )}

      {/* 데스크톱: 분할 뷰 */}
      <div
        ref={containerRef}
        className={`hidden md:flex ${isHorizontal ? 'flex-row' : 'flex-col'} h-full min-h-0 overflow-hidden rounded-xl border border-[var(--border-default)]`}
        style={{ cursor: isDragging ? (isHorizontal ? 'col-resize' : 'row-resize') : undefined }}
      >
        {/* 좌측 패널 */}
        <div
          className="min-h-0 overflow-auto"
          style={{
            [isHorizontal ? 'width' : 'height']: `${effectiveRatio * 100}%`,
            transition: isDragging ? 'none' : 'all 0.2s ease',
          }}
        >
          {left}
        </div>

        {/* 드래그 핸들 */}
        <div
          className={`group relative flex shrink-0 items-center justify-center bg-[var(--bg-secondary)] ${
            isHorizontal
              ? 'w-2 cursor-col-resize hover:w-3 hover:bg-[var(--color-primary)]/10'
              : 'h-2 cursor-row-resize hover:h-3 hover:bg-[var(--color-primary)]/10'
          } transition-all`}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <GripIcon
            size={12}
            className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
          />
          {/* 접기 버튼 */}
          <div className={`absolute ${isHorizontal ? '-right-6 top-1' : '-bottom-6 left-1'} flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity`}>
            <button
              onClick={() => toggleCollapse('left')}
              className="rounded p-0.5 hover:bg-[var(--bg-tertiary)]"
              title={isCollapsed === 'left' ? '좌측 펼치기' : '좌측 접기'}
            >
              {isCollapsed === 'left' ? <Maximize2 size={10} /> : <Minimize2 size={10} />}
            </button>
          </div>
        </div>

        {/* 우측 패널 */}
        <div
          className="min-h-0 flex-1 overflow-auto"
          style={{
            transition: isDragging ? 'none' : 'all 0.2s ease',
          }}
        >
          {right}
        </div>
      </div>
    </div>
  );
}
