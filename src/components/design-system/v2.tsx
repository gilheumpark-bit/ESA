// ============================================================
// ESA Concept v2 — Design System Atoms
// ============================================================
// Source: Claude Design handoff bundle `esva/project/shared.jsx`.
// Ported to TypeScript/React 19 with strict typing.
// Scope: rendered only inside an ancestor with className="esa-v2"
//        (CSS tokens scoped via globals.css `.esa-v2`).
// ============================================================

import * as React from 'react';

// ============================================================
// PART 1 — Icon glyphs (inline SVG, single-stroke)
// ============================================================

export type IconName =
  | 'Search' | 'Bolt' | 'Calc' | 'Book' | 'Globe' | 'Camera' | 'Hash'
  | 'Check' | 'X' | 'Down' | 'Right' | 'Arrow' | 'Warn' | 'Spark' | 'Plus'
  | 'File' | 'Copy' | 'Eye' | 'Shield' | 'Folder' | 'Clock' | 'Mic'
  | 'Key' | 'Layers';

type IconProps = { s?: number; style?: React.CSSProperties };
const Sw = 1.6;

const Icons: Record<IconName, React.FC<IconProps>> = {
  Search: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
    </svg>
  ),
  Bolt: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={style}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>
    </svg>
  ),
  Calc: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <rect x="4" y="3" width="16" height="18" rx="2"/>
      <path d="M8 7h8M8 11h2m3 0h3M8 15h2m3 0h3M8 19h2"/>
    </svg>
  ),
  Book: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4Z"/><path d="M4 16a4 4 0 0 1 4-4h12"/>
    </svg>
  ),
  Globe: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>
    </svg>
  ),
  Camera: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>
    </svg>
  ),
  Hash: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>
    </svg>
  ),
  Check: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={style}>
      <path d="m4 12 5 5L20 6"/>
    </svg>
  ),
  X: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={style}>
      <path d="M6 6l12 12M18 6 6 18"/>
    </svg>
  ),
  Down: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={style}>
      <path d="m6 9 6 6 6-6"/>
    </svg>
  ),
  Right: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={style}>
      <path d="m9 6 6 6-6 6"/>
    </svg>
  ),
  Arrow: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={style}>
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  ),
  Warn: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18v.5"/>
    </svg>
  ),
  Spark: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l4 4M14 14l4 4M18 6l-4 4M10 14l-4 4"/>
    </svg>
  ),
  Plus: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={style}>
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  File: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="M6 3h9l5 5v13H6Z"/><path d="M15 3v5h5"/>
    </svg>
  ),
  Copy: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>
    </svg>
  ),
  Eye: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Shield: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/>
    </svg>
  ),
  Folder: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>
    </svg>
  ),
  Clock: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  ),
  Mic: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
    </svg>
  ),
  Key: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 8l3 3"/>
    </svg>
  ),
  Layers: ({ s = 14, style }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={Sw} style={style}>
      <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 18l9 5 9-5"/>
    </svg>
  ),
};

/** Typed icon lookup. Use `<Icon name="Bolt" s={16} />` or `<Icons.Bolt s={16}/>`. */
export const I = Icons;
export function Icon({ name, s = 14, style }: { name: IconName } & IconProps) {
  const C = Icons[name];
  return <C s={s} style={style} />;
}

// ============================================================
// PART 2 — Brand atoms (Logo, Signal, Hash, Verdict, StdBadge)
// ============================================================

/**
 * ESA logotype — engineering doc style.
 *
 * `version` defaults to undefined: do NOT show a version badge unless the
 * caller explicitly passes one. The design canvas mock used a hardcoded "v10"
 * — that string had no upstream meaning. Now version comes from package.json
 * or a explicit prop, never a magic string baked into the component.
 */
export function Logo({
  size = 22,
  variant = 'mono' as 'mono' | 'brand',
  version,
}: { size?: number; variant?: 'mono' | 'brand'; version?: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, lineHeight: 1 }}>
      <div style={{
        width: size, height: size, borderRadius: 5,
        background: variant === 'brand'
          ? 'linear-gradient(135deg, var(--v2-brand) 0%, var(--v2-brand-3) 100%)'
          : 'var(--v2-ink-3)',
        border: variant === 'mono' ? '1px solid var(--v2-line-2)' : 'none',
        display: 'grid', placeItems: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none">
          <path d="M14 3 5 14h6l-1 7 9-12h-6l1-6Z"
            fill={variant === 'brand' ? '#fff' : 'var(--v2-brand)'}/>
        </svg>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontWeight: 700, letterSpacing: '-0.02em', fontSize: size * 0.66 }}>ESA</span>
        {version && (
          <span className="mono" style={{ color: 'var(--v2-fg-4)', fontSize: size * 0.42, letterSpacing: '0.05em' }}>
            {version}
          </span>
        )}
      </div>
    </div>
  );
}

/** Operational signal indicator (pulsing dot + label). */
export function Signal({ label = 'OPERATIONAL', tone = 'pass' as 'pass' | 'warn' | 'fail' }) {
  const toneCls = tone === 'pass' ? '' : tone;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className={`v2-signal-dot ${toneCls}`} />
      <span className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--v2-fg-3)' }}>{label}</span>
    </div>
  );
}

/** Hash signature (tx-style mono). */
export function Hash({ value = '0xa7c4f9e2b8d1', tone = 'default' as 'default' | 'brand' }) {
  return (
    <span className="mono" style={{
      fontSize: 11,
      color: tone === 'brand' ? 'var(--v2-brand-2)' : 'var(--v2-fg-3)',
      letterSpacing: '0.02em',
    }}>{value}</span>
  );
}

/** Verdict pill — PASS/WARN/FAIL with chip coloring. */
export function Verdict({ kind = 'pass' as 'pass' | 'warn' | 'fail' }) {
  const map = {
    pass: { cls: 'v2-chip-pass', label: 'PASS' },
    warn: { cls: 'v2-chip-warn', label: 'WARN' },
    fail: { cls: 'v2-chip-fail', label: 'FAIL' },
  };
  const v = map[kind];
  return <span className={`v2-chip ${v.cls}`} style={{ fontWeight: 700, letterSpacing: '0.1em' }}>{v.label}</span>;
}

/** Standards badge — country/standard color-coded. */
export type StdCode = 'KEC' | 'NEC' | 'IEC' | 'JIS' | 'GB' | 'VDE';
export function StdBadge({ code = 'KEC' as StdCode, section = '232.3', version = '2021' }: {
  code?: StdCode; section?: string; version?: string;
}) {
  const clsMap: Record<StdCode, string> = {
    KEC: 'v2-chip-kec', NEC: 'v2-chip-nec', IEC: 'v2-chip-iec',
    JIS: 'v2-chip-jis', GB: 'v2-chip-kec', VDE: 'v2-chip-pass',
  };
  return (
    <span className={`v2-chip ${clsMap[code]}`}>
      <strong style={{ fontWeight: 700 }}>{code}</strong>
      {section && <span style={{ opacity: 0.6 }}>·</span>}
      {section && <span>{section}</span>}
      {version && <span style={{ opacity: 0.5, fontSize: 10 }}>{version}</span>}
    </span>
  );
}

// ============================================================
// PART 3 — Layout primitives (Dotted, Flag, Spark, Kbd, Tabs, SectHead, Placeholder)
// ============================================================

/** Dotted hairline divider — horizontal by default. */
export function Dotted({ vertical = false, color = 'var(--v2-fg-5)' }: { vertical?: boolean; color?: string }) {
  return vertical
    ? <div style={{ width: 1, alignSelf: 'stretch', backgroundImage: `linear-gradient(${color} 50%, transparent 0)`, backgroundSize: '1px 6px' }} />
    : <div style={{ height: 1, width: '100%', backgroundImage: `linear-gradient(to right, ${color} 50%, transparent 0)`, backgroundSize: '6px 1px' }} />;
}

/** Country flag (inline SVG, no emoji — print-safe). */
export type FlagCode = 'KR' | 'US' | 'JP' | 'EU' | 'CN' | 'DE';
export function Flag({ code = 'KR' as FlagCode, size = 14 }: { code?: FlagCode; size?: number }) {
  const flags: Record<FlagCode, React.ReactNode> = {
    KR: (
      <>
        <rect width="20" height="14" fill="#fff"/>
        <circle cx="10" cy="7" r="3" fill="#cd2e3a"/>
        <path d="M10 7a3 3 0 0 1-3 0 1.5 1.5 0 1 1 3 0Z" fill="#0047a0"/>
      </>
    ),
    US: (
      <>
        <rect width="20" height="14" fill="#fff"/>
        {[0,2,4,6,8,10,12].map(y=><rect key={y} y={y} width="20" height="1" fill="#b22234"/>)}
        <rect width="9" height="7" fill="#3c3b6e"/>
      </>
    ),
    JP: (
      <>
        <rect width="20" height="14" fill="#fff"/>
        <circle cx="10" cy="7" r="3.5" fill="#bc002d"/>
      </>
    ),
    EU: (
      <>
        <rect width="20" height="14" fill="#003399"/>
        {Array.from({length:12}).map((_,i)=>{
          const a=i*30*Math.PI/180;
          return <circle key={i} cx={10+4*Math.sin(a)} cy={7-3*Math.cos(a)} r="0.6" fill="#ffcc00"/>;
        })}
      </>
    ),
    CN: (
      <>
        <rect width="20" height="14" fill="#de2910"/>
        <path d="M3 2l.4 1.2H4.6l-1 .8.4 1.2-1-.7-1 .7.4-1.2-1-.8h1.2Z" fill="#ffde00"/>
      </>
    ),
    DE: (
      <>
        <rect width="20" height="4.6" fill="#000"/>
        <rect y="4.6" width="20" height="4.6" fill="#dd0000"/>
        <rect y="9.3" width="20" height="4.6" fill="#ffce00"/>
      </>
    ),
  };
  return (
    <svg width={size * 1.4} height={size} viewBox="0 0 20 14" style={{ borderRadius: 2, border: '1px solid var(--v2-line)' }}>
      {flags[code]}
    </svg>
  );
}

/** Sparkline — small SVG line chart. */
export function Spark({
  data = [3,5,4,8,7,12,10,15,14,18,17,22],
  w = 80, h = 24, color = 'var(--v2-brand-2)',
}: { data?: number[]; w?: number; h?: number; color?: string }) {
  if (data.length === 0) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const xs = (i: number) => (i / Math.max(1, data.length - 1)) * w;
  const ys = (v: number) => h - ((v - min) / span) * h;
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5}/>
      <circle cx={xs(data.length - 1)} cy={ys(data[data.length - 1])} r={2} fill={color}/>
    </svg>
  );
}

/** Image placeholder — striped, monospace caption. */
export function Placeholder({ label = 'image', w = '100%' as number | string, h = 160 }: {
  label?: string; w?: number | string; h?: number | string;
}) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 8,
      background: 'repeating-linear-gradient(135deg, var(--v2-ink-3) 0 8px, var(--v2-ink-2) 8px 16px)',
      border: '1px solid var(--v2-line)',
      display: 'grid', placeItems: 'center',
      color: 'var(--v2-fg-4)',
    }}>
      <span className="mono" style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

/** Keyboard keycap. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mono" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, padding: '0 5px',
      background: 'var(--v2-ink-3)', border: '1px solid var(--v2-line-2)',
      borderRadius: 4, fontSize: 10, color: 'var(--v2-fg-3)',
      boxShadow: '0 1px 0 var(--v2-line-2)',
    }}>{children}</kbd>
  );
}

/** Tab strip — single-line underline indicator. */
export function Tabs({ items, active = 0, size = 'md' as 'sm' | 'md', onChange }: {
  items: string[]; active?: number; size?: 'sm' | 'md'; onChange?: (idx: number) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0, borderBottom: '1px solid var(--v2-line)' }}>
      {items.map((label, i) => (
        <button key={i} onClick={() => onChange?.(i)} className="v2-btn-ghost" style={{
          padding: size === 'sm' ? '6px 10px' : '8px 14px',
          fontSize: size === 'sm' ? 11 : 12,
          fontWeight: 500,
          color: i === active ? 'var(--v2-fg-1)' : 'var(--v2-fg-3)',
          background: 'transparent', border: 'none', borderRadius: 0,
          borderBottom: i === active ? '2px solid var(--v2-brand)' : '2px solid transparent',
          marginBottom: -1, cursor: 'pointer', fontFamily: 'inherit',
        }}>{label}</button>
      ))}
    </div>
  );
}

/**
 * Agent wax-seal — identity signature for 4-Team agents (borrowed from BareWrite §4.1).
 * Radial gradient + inset shadow + tiny mono label. Each team gets a distinct hue:
 *   - sld       = blue   (계통도 / KEC-aligned)
 *   - layout    = copper (평면도 / wiring path)
 *   - std       = purple (규정 / IEC-aligned)
 *   - consensus = green  (합의 / pass tone)
 */
export type SealKind = 'sld' | 'layout' | 'std' | 'consensus';
const SEAL_LABEL: Record<SealKind, string> = { sld: 'SLD', layout: 'LAY', std: 'STD', consensus: 'CON' };
export function Seal({ kind, size = 28 }: { kind: SealKind; size?: number }) {
  return (
    <span
      className={`v2-seal v2-seal-${kind}`}
      style={{ width: size, height: size }}
      aria-label={`Agent seal: ${SEAL_LABEL[kind]}`}
    >
      {SEAL_LABEL[kind]}
    </span>
  );
}

/**
 * Lock band — top-anchored region/standard selector (borrowed from BareWrite §4.2).
 * Persistent context for "which standard am I working under?"
 * Pass `drift` = true on a non-active chip to flag "project default differs" warning.
 */
export type RegionCode = 'KR' | 'US' | 'JP' | 'EU';
const REGION_LABEL: Record<RegionCode, string> = {
  KR: 'KEC 2021', US: 'NEC 2023', JP: 'JIS C 0364', EU: 'IEC 60364',
};
export function LockBand({
  active = 'KR' as RegionCode,
  drift,
  onChange,
}: {
  active?: RegionCode;
  drift?: RegionCode;
  onChange?: (r: RegionCode) => void;
}) {
  const regions: RegionCode[] = ['KR', 'US', 'JP', 'EU'];
  return (
    <div className="v2-lock-band" role="radiogroup" aria-label="Active jurisdiction">
      <span className="v2-lock-label">Locked to</span>
      {regions.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={active === r}
          aria-pressed={active === r}
          className={`v2-lock-chip ${r === drift && r !== active ? 'drift' : ''}`}
          onClick={() => onChange?.(r)}
        >
          {r} · {REGION_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

/**
 * Critical / warn row — single-line semantic-highlight (BareWrite Magic Moment §4.3).
 * Use to flag PE-review-required findings, threshold violations, or 안전 critical paths.
 */
export function CriticalRow({
  tone = 'warn' as 'warn' | 'fail',
  children,
}: {
  tone?: 'warn' | 'fail';
  children: React.ReactNode;
}) {
  return <div className={`v2-critical-row ${tone === 'fail' ? 'fail' : ''}`}>{children}</div>;
}

/**
 * Verification trace — 1-line receipt callout (borrowed from BareWrite §4.4).
 * Renders score · GATE state · sources as a left-bordered mono row.
 *
 * @example
 *   <Trace tone="pass">
 *     <span>SCORE 0.94</span> · <span>GATE pass</span> · <span>KEC 232.3 · IEC 60364-5-52</span>
 *   </Trace>
 */
export function Trace({
  tone = 'default' as 'default' | 'pass' | 'warn' | 'fail',
  children,
}: {
  tone?: 'default' | 'pass' | 'warn' | 'fail';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'pass' ? 'v2-trace v2-trace-pass'
    : tone === 'warn' ? 'v2-trace v2-trace-warn'
    : tone === 'fail' ? 'v2-trace v2-trace-fail'
    : 'v2-trace';
  return <div className={cls}>{children}</div>;
}

/** Section header — engineering-doc style §N. */
export function SectHead({ no, title, right }: { no?: string; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {no && <span className="mono" style={{ color: 'var(--v2-fg-4)', fontSize: 10, letterSpacing: '0.1em' }}>§{no}</span>}
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em' }}>{title}</h3>
      </div>
      {right}
    </div>
  );
}

// IDENTITY_SEAL: design-system/v2 | role=ESA-v2 design atoms | inputs=props | outputs=React nodes
