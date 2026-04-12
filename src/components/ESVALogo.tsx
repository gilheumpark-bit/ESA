/**
 * ESVA Custom Logo — 번개볼트가 통합된 전기 버티컬 로고
 */

interface ESVALogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
}

const SIZES = {
  sm: { icon: 20, text: 'text-lg', gap: 'gap-1.5' },
  md: { icon: 28, text: 'text-2xl', gap: 'gap-2' },
  lg: { icon: 36, text: 'text-4xl', gap: 'gap-2.5' },
  xl: { icon: 48, text: 'text-5xl', gap: 'gap-3' },
} as const;

function BoltIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 원형 배경 — 그래디언트 */}
      <defs>
        <linearGradient id="esva-bolt-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id="esva-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* 외곽 링 */}
      <circle cx="20" cy="20" r="18" stroke="url(#esva-ring-grad)" strokeWidth="2.5" fill="none" />
      {/* 번개 볼트 */}
      <path
        d="M22 6L12 22h7l-3 12 12-16h-7l3-12z"
        fill="url(#esva-bolt-grad)"
      />
    </svg>
  );
}

export default function ESVALogo({ size = 'md', className = '', showText = true }: ESVALogoProps) {
  const s = SIZES[size];

  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <BoltIcon size={s.icon} />
      {showText && (
        <span className={`${s.text} font-bold tracking-tight`}>
          <span className="bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-blue-300">
            ES
          </span>
          <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
            VA
          </span>
        </span>
      )}
    </span>
  );
}
