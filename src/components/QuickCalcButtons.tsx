'use client';

import { Zap, Cable, ArrowDownUp, Shield, Gauge } from 'lucide-react';

interface QuickCalcButtonsProps {
  onSelect: (calculatorId: string) => void;
}

const QUICK_CALCS = [
  { id: 'voltage-drop', label: '전압강하', icon: ArrowDownUp },
  { id: 'cable-sizing', label: '케이블 선정', icon: Cable },
  { id: 'transformer-capacity', label: '변압기 용량', icon: Zap },
  { id: 'breaker-sizing', label: '차단기 선정', icon: Shield },
  { id: 'short-circuit', label: '단락전류', icon: Gauge },
];

export default function QuickCalcButtons({ onSelect }: QuickCalcButtonsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {QUICK_CALCS.map(calc => (
        <button
          key={calc.id}
          onClick={() => onSelect(calc.id)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          <calc.icon size={14} />
          {calc.label}
        </button>
      ))}
    </div>
  );
}
