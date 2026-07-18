// ============================================================
// /preview/concept-v2 — ESA Concept v2 design preview (Home Terminal A)
// ============================================================
// Source: Claude Design handoff bundle (screens-home.jsx · HomeTerminal).
// Standalone route (no shared nav) — full-bleed design canvas.
// Scope: visual reference only, not wired to live calculators yet.
// ============================================================

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  I, Logo, Signal, Hash, Verdict, StdBadge, Dotted, Flag, Spark, Kbd, Tabs,
  Seal, LockBand,
  type IconName, type RegionCode,
} from '@/components/design-system/v2';
import { CALCULATOR_COUNT } from '@/engine/calculators/count';

export default function ConceptV2Preview() {
  const [accent, setAccent] = React.useState<'iron' | 'copper' | 'voltage' | 'kelvin'>('iron');
  const [theme, setTheme] = React.useState<'dark' | 'light'>('dark');

  return (
    <div
      className="esa-v2"
      data-accent={accent}
      data-theme={theme}
      style={{ minHeight: '100vh', width: '100%' }}
    >
      <HomeTerminal />
      <TweakDock accent={accent} setAccent={setAccent} theme={theme} setTheme={setTheme} />
    </div>
  );
}

// ============================================================
// PART 1 — Home Terminal layout (top bar · 3-col main · footer)
// ============================================================

function HomeTerminal() {
  const [region, setRegion] = React.useState<RegionCode>('KR');
  return (
    <div className="v2-grid" style={{
      width: '100%', minHeight: '100vh',
      background: 'var(--v2-ink-1)',
      display: 'flex', flexDirection: 'column',
    }}>
      <TopBar />
      <LockBand active={region} drift="US" onChange={setRegion} />
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '260px 1fr 280px',
        minHeight: 0,
      }}>
        <LeftRail />
        <CenterTerminal />
        <RightRail />
      </div>
      <FootBar />
    </div>
  );
}

const NAV_ITEMS: Array<{ label: string; href: string; active?: boolean }> = [
  { label: 'Search',      href: '/search',    active: true },
  { label: 'Calculators', href: '/calc' },
  { label: 'Standards',   href: '/standards' },
  { label: 'Projects',    href: '/projects' },
  { label: 'Field',       href: '/field' },
];

function TopBar() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 24px', borderBottom: '1px solid var(--v2-line)',
      background: 'var(--v2-ink-0)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Logo size={22}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {NAV_ITEMS.map(({ label, href, active }) => (
            <Link key={label} href={href} style={{
              padding: '6px 10px', fontSize: 12,
              color: active ? 'var(--v2-fg-1)' : 'var(--v2-fg-3)',
              background: active ? 'var(--v2-ink-3)' : 'transparent',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontFamily: 'inherit', textDecoration: 'none',
            }}>{label}</Link>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Signal label="ALL SYSTEMS OPERATIONAL"/>
        <Dotted vertical/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Flag code="KR"/>
          <span className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-3)' }}>KR · KEC 2021</span>
        </div>
        <Link href="/settings/byok" className="v2-btn" style={{ textDecoration: 'none' }}>
          <I.Key s={12}/> BYOK
        </Link>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--v2-ink-4)', border: '1px solid var(--v2-line-2)' }}/>
      </div>
    </div>
  );
}

// ============================================================
// PART 2 — Left rail (pinned + recent activity)
// ============================================================

const PINNED: Array<{ i: IconName; t: string; href: string }> = [
  { i: 'Calc', t: '전압강하 — 변전실 → 동력반',  href: '/search?q=' + encodeURIComponent('전압강하 변전실 동력반') },
  { i: 'File', t: '수변전 100kVA Project',         href: '/projects' },
  { i: 'Book', t: 'KEC 232.3 (허용전류)',          href: '/standards' },
  { i: 'Calc', t: 'Arc Flash · IEEE 1584',         href: '/search?q=' + encodeURIComponent('Arc Flash IEEE 1584') },
];

const RECENT: Array<{ code: string; t: string; time: string }> = [
  { code: 'CALC',   t: 'IZ — 95mm² CU XLPE',     time: '14:22' },
  { code: 'STD',    t: 'NEC 310.16',             time: '14:08' },
  { code: 'SEARCH', t: 'TR 22.9kV→380V 100A',    time: '13:51' },
  { code: 'COMP',   t: 'NEC vs KEC ampacity',    time: '11:30' },
];

function LeftRail() {
  return (
    <aside style={{ borderRight: '1px solid var(--v2-line)', padding: 20, overflow: 'auto' }}>
      <div className="v2-sect-title" style={{ marginBottom: 12 }}>Pinned</div>
      {PINNED.map((r, i) => (
        <RowPinned key={i} icon={r.i} title={r.t} href={r.href}/>
      ))}
      <div className="v2-sect-title" style={{ marginTop: 24, marginBottom: 12 }}>Recent</div>
      {RECENT.map((r, i) => (
        <div key={i} style={{ padding: '8px 4px', borderBottom: '1px dashed var(--v2-line)', fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span className="mono" style={{ color: 'var(--v2-brand-2)', fontSize: 10 }}>{r.code}</span>
            <span className="mono" style={{ color: 'var(--v2-fg-4)', fontSize: 10 }}>{r.time}</span>
          </div>
          <div style={{ color: 'var(--v2-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t}</div>
        </div>
      ))}
    </aside>
  );
}

function RowPinned({ icon, title, href }: { icon: IconName; title: string; href: string }) {
  const [hover, setHover] = React.useState(false);
  const C = I[icon];
  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 8px', borderRadius: 6,
        color: 'var(--v2-fg-2)', fontSize: 12, cursor: 'pointer',
        background: hover ? 'var(--v2-ink-3)' : 'transparent',
        textDecoration: 'none',
      }}
    >
      <span style={{ color: 'var(--v2-fg-4)' }}><C s={13}/></span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
    </Link>
  );
}

// ============================================================
// PART 3 — Center terminal (search prompt + calc chain + categories)
// ============================================================

function CenterTerminal() {
  return (
    <main style={{ padding: '40px 32px', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ maxWidth: 720, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Greeting/>
        <TerminalPrompt/>
        <CalcChain/>
        <CategoryTable/>
      </div>
    </main>
  );
}

function Greeting() {
  return (
    <div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-4)', letterSpacing: '0.1em' }}>
        2026-05-12 · TUE · KST 14:33
      </div>
      <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--v2-fg-1)' }}>
        The Engineer&apos;s Search Engine
      </h1>
      <p style={{ margin: '4px 0 0', color: 'var(--v2-fg-3)', fontSize: 13 }}>
        AI는 추정하지 않습니다. 모든 수치는 결정론적 엔진이 계산하고, 기준서가 검증합니다.
      </p>
    </div>
  );
}

function TerminalPrompt() {
  const router = useRouter();
  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = e.currentTarget.value.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };
  return (
    <div className="v2-card" style={{ padding: 0, overflow: 'hidden', borderColor: 'var(--v2-line-2)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px',
        borderBottom: '1px solid var(--v2-line)',
        background: 'linear-gradient(180deg, var(--v2-ink-3) 0%, var(--v2-ink-2) 100%)',
      }}>
        <span className="mono" style={{ color: 'var(--v2-brand-2)' }}>esa</span>
        <span className="mono" style={{ color: 'var(--v2-fg-4)' }}>:~$</span>
        <input
          onKeyDown={handleEnter}
          aria-label="ESA terminal search"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--v2-fg-1)', fontSize: 14, fontFamily: 'var(--v2-font-mono)',
          }}
          defaultValue="22.9kV 100A 변압기에서 380V 부하단까지 전압강하 95mm² CU XLPE 50m"
        />
        <span className="mono" style={{ color: 'var(--v2-fg-4)', fontSize: 10 }}>auto-route</span>
        <Kbd>⏎</Kbd>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
        <span className="v2-label">Detected</span>
        <span className="v2-chip v2-chip-kec"><strong>CALC</strong>·voltage-drop</span>
        <Dotted vertical/>
        <span className="mono" style={{ color: 'var(--v2-fg-3)' }}>params:</span>
        <span className="mono" style={{ color: 'var(--v2-fg-2)' }}>V=22900</span>
        <span className="mono" style={{ color: 'var(--v2-fg-2)' }}>I=100</span>
        <span className="mono" style={{ color: 'var(--v2-fg-2)' }}>A=95mm²</span>
        <span className="mono" style={{ color: 'var(--v2-fg-2)' }}>L=50m</span>
        <span style={{ marginLeft: 'auto' }}><Signal label="READY"/></span>
      </div>
    </div>
  );
}

const CHAIN_STEPS: Array<{ i: IconName; label: string; sub: string; active?: boolean }> = [
  { i: 'Bolt',   label: 'Voltage drop', sub: '단일', active: true },
  { i: 'Calc',   label: 'Cable size',   sub: '검증' },
  { i: 'Shield', label: 'OCB rating',   sub: '연계' },
  { i: 'Layers', label: 'Receipt',      sub: '발행' },
];

function CalcChain() {
  return (
    <div>
      <div className="v2-sect-title" style={{ marginBottom: 10 }}>Calculation chain · auto-suggested</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflow: 'auto', padding: '4px 0' }}>
        {CHAIN_STEPS.map((s, i, arr) => {
          const Glyph = I[s.i];
          return (
            <React.Fragment key={i}>
              <div className="v2-card" style={{
                padding: '10px 12px', minWidth: 130,
                background: s.active ? 'var(--v2-brand-tint)' : 'var(--v2-ink-2)',
                borderColor: s.active ? 'var(--v2-brand)' : 'var(--v2-line)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ color: s.active ? 'var(--v2-brand-2)' : 'var(--v2-fg-3)' }}><Glyph s={13}/></span>
                  <span style={{ fontSize: 11, color: 'var(--v2-fg-4)' }} className="mono">0{i + 1}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--v2-fg-1)' }}>{s.label}</div>
                <div style={{ fontSize: 10, color: 'var(--v2-fg-4)' }} className="mono">{s.sub}</div>
              </div>
              {i < arr.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', color: 'var(--v2-fg-4)' }}>
                  <I.Right s={12}/>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

const CATEGORIES: Array<[string, string, string, number]> = [
  ['01', '전력 기초 (Power)',     '단상·3상·역률·고조파 분석',       8],
  ['02', '전압강하 (Vdrop)',      '단순·복합·임피던스 기반',         6],
  ['03', '케이블 (Cable)',        'AWG·허용전류·단락임피던스',       6],
  ['04', '변압기 (Transformer)',  '용량·임피던스·돌입전류',          6],
  ['05', '보호협조 (Protection)', '단락·지락·Arc Flash IEEE 1584',   7],
  ['06', '접지 (Ground)',         'IEEE 80·등전위·피뢰',             5],
  ['07', '신재생 (Renewable)',    '태양광·ESS·계통연계',             7],
];

function CategoryTable() {
  return (
    <div className="v2-card" style={{ padding: 0 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '60px 1fr auto',
        padding: '8px 14px', borderBottom: '1px solid var(--v2-line)',
        background: 'var(--v2-ink-3)',
      }}>
        <span className="v2-label">No</span>
        <span className="v2-label">Calculator categories · {CALCULATOR_COUNT} total</span>
        <span className="v2-label">Count</span>
      </div>
      {CATEGORIES.map(([no, name, sub, n], idx, arr) => (
        <div key={no} style={{
          display: 'grid', gridTemplateColumns: '60px 1fr auto',
          padding: '10px 14px',
          borderBottom: idx === arr.length - 1 ? 'none' : '1px dashed var(--v2-line)',
          alignItems: 'center',
        }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-4)' }}>{no}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--v2-fg-1)' }}>{name}</div>
            <div style={{ fontSize: 11, color: 'var(--v2-fg-3)' }}>{sub}</div>
          </div>
          <span className="num" style={{ fontSize: 14, color: 'var(--v2-brand-2)' }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// PART 4 — Right rail (live activity + receipt preview)
// ============================================================

function RightRail() {
  return (
    <aside style={{
      borderLeft: '1px solid var(--v2-line)',
      padding: 20, overflow: 'auto',
      display: 'flex', flexDirection: 'column', gap: 18,
      background: 'var(--v2-ink-0)',
    }}>
      <div>
        <div className="v2-sect-title" style={{ marginBottom: 10 }}>Live signal</div>
        <div className="v2-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-3)' }}>Receipts / hour</span>
            <Verdict kind="pass"/>
          </div>
          <div className="num" style={{ fontSize: 28, fontWeight: 300, color: 'var(--v2-fg-1)', lineHeight: 1 }}>1,247</div>
          <div style={{ marginTop: 10 }}>
            <Spark data={[12, 18, 14, 22, 19, 28, 31, 27, 34, 41, 38, 47]} w={220} h={32}/>
          </div>
        </div>
      </div>

      <div>
        <div className="v2-sect-title" style={{ marginBottom: 10 }}>Last receipt</div>
        <div className="v2-card" style={{ padding: 14, fontFamily: 'var(--v2-font-mono)', fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Hash value="0xa7c4f9e2b8d1" tone="brand"/>
            <span style={{ color: 'var(--v2-fg-4)' }}>14:33 KST</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <RKV k="engine"  v="voltage-drop@v3.2"/>
            <RKV k="model"   v="claude-mythos-04"/>
            <RKV k="tokens"  v="1,284 in · 412 out"/>
            <RKV k="ΔV"      v="8.92 V (2.34 %)"/>
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--v2-line)', display: 'flex', justifyContent: 'space-between' }}>
            <StdBadge code="KEC" section="232.3"/>
            <Verdict kind="pass"/>
          </div>
        </div>
      </div>

      <div>
        <div className="v2-sect-title" style={{ marginBottom: 10 }}>Standards</div>
        <Tabs items={['KEC', 'NEC', 'IEC', 'JIS']} active={0} size="sm"/>
      </div>

      <div>
        <div className="v2-sect-title" style={{ marginBottom: 10 }}>4-Team agents</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Seal kind="sld"/>
            <span className="mono" style={{ fontSize: 10, color: 'var(--v2-fg-3)' }}>계통도</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Seal kind="layout"/>
            <span className="mono" style={{ fontSize: 10, color: 'var(--v2-fg-3)' }}>평면도</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Seal kind="std"/>
            <span className="mono" style={{ fontSize: 10, color: 'var(--v2-fg-3)' }}>규정</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Seal kind="consensus"/>
            <span className="mono" style={{ fontSize: 10, color: 'var(--v2-fg-3)' }}>합의</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

function RKV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: 'var(--v2-fg-3)' }}>{k}</span>
      <span style={{ color: 'var(--v2-fg-1)' }}>{v}</span>
    </div>
  );
}

// ============================================================
// PART 5 — Footer + tweak dock
// ============================================================

function FootBar() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 24px', borderTop: '1px solid var(--v2-line)',
      background: 'var(--v2-ink-0)', fontSize: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="mono" style={{ color: 'var(--v2-fg-4)' }}>Receipt-grade engineering search</span>
        <Dotted vertical/>
        <Signal label="LLM ROUTER · 6/6 PROVIDERS"/>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="mono" style={{ color: 'var(--v2-fg-4)' }}>{CALCULATOR_COUNT} deterministic engines</span>
        <Dotted vertical/>
        <span className="mono" style={{ color: 'var(--v2-fg-4)' }}>4-Team v2</span>
      </div>
    </div>
  );
}

function TweakDock({ accent, setAccent, theme, setTheme }: {
  accent: 'iron' | 'copper' | 'voltage' | 'kelvin';
  setAccent: (a: 'iron' | 'copper' | 'voltage' | 'kelvin') => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
}) {
  const accents: Array<{ id: typeof accent; label: string }> = [
    { id: 'iron',    label: 'Iron' },
    { id: 'copper',  label: 'Copper' },
    { id: 'voltage', label: 'Voltage' },
    { id: 'kelvin',  label: 'Kelvin' },
  ];
  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 50,
      background: 'var(--v2-ink-2)', border: '1px solid var(--v2-line-2)',
      borderRadius: 'var(--v2-r-3)', padding: 12, minWidth: 220,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <div className="v2-label" style={{ marginBottom: 8 }}>Tweaks</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--v2-fg-4)', marginBottom: 4 }}>Theme</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['dark', 'light'] as const).map(t => (
              <button key={t} onClick={() => setTheme(t)} className="v2-btn" style={{
                background: theme === t ? 'var(--v2-brand-tint)' : 'var(--v2-ink-3)',
                borderColor: theme === t ? 'var(--v2-brand)' : 'var(--v2-line)',
                color: theme === t ? 'var(--v2-brand-2)' : 'var(--v2-fg-2)',
              }}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--v2-fg-4)', marginBottom: 4 }}>Accent</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {accents.map(a => (
              <button key={a.id} onClick={() => setAccent(a.id)} className="v2-btn" style={{
                background: accent === a.id ? 'var(--v2-brand-tint)' : 'var(--v2-ink-3)',
                borderColor: accent === a.id ? 'var(--v2-brand)' : 'var(--v2-line)',
                color: accent === a.id ? 'var(--v2-brand-2)' : 'var(--v2-fg-2)',
              }}>{a.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// IDENTITY_SEAL: preview/concept-v2 | role=design preview · Home Terminal A | inputs=user tweak | outputs=React UI
