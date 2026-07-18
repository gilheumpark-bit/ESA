// ============================================================
// /preview/concept-v2/answer — ESA Concept v2 (Search + AI Answer · Tape)
// ============================================================
// Source: Claude Design handoff bundle (screens-answer.jsx · AnswerTape).
// The physical-receipt metaphor — ESA's primary differentiator.
// Standalone route (no shared nav); full-bleed canvas.
// ============================================================

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  I, Logo, Signal, Hash, Verdict, StdBadge, Dotted, Flag, Trace, CriticalRow,
  type StdCode,
} from '@/components/design-system/v2';
import { CALCULATOR_COUNT } from '@/engine/calculators/count';

export default function ConceptV2Answer() {
  return (
    <div className="esa-v2" data-accent="iron" data-theme="dark" style={{ minHeight: '100vh', width: '100%' }}>
      <AnswerTape/>
      <div style={{
        position: 'fixed', bottom: 12, left: 12, zIndex: 50,
        background: 'var(--v2-ink-2)', border: '1px solid var(--v2-line)',
        borderRadius: 8, padding: '6px 10px', fontSize: 11,
      }}>
        <Link href="/preview/concept-v2" style={{ color: 'var(--v2-fg-3)', textDecoration: 'none' }}>
          ← Home Terminal
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// PART 1 — Top bar (logo · search recap · region · PDF export)
// ============================================================

function AnswerTape() {
  return (
    <div style={{
      width: '100%', minHeight: '100vh', background: 'var(--v2-ink-1)',
      display: 'flex', flexDirection: 'column',
    }}>
      <TopBar/>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', overflow: 'hidden' }}>
        <AnswerColumn/>
        <ReceiptColumn/>
      </div>
    </div>
  );
}

function TopBar() {
  const handlePrint = React.useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 24px', borderBottom: '1px solid var(--v2-line)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Logo size={20}/>
        <Dotted vertical/>
        <div className="v2-card" style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <I.Search s={12} style={{ color: 'var(--v2-fg-3)' }}/>
          <span className="mono" style={{ fontSize: 12, color: 'var(--v2-fg-2)' }}>
            22.9kV 100A → 380V 부하단 95mm² 50m
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Flag code="KR"/>
        <span className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-3)' }}>KEC 2021</span>
        <button type="button" onClick={handlePrint} className="v2-btn" aria-label="Print receipt as PDF">
          <I.File s={11}/> PDF
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PART 2 — Answer column (route · headline · numbers · summary · steps · chain · citations)
// ============================================================

function AnswerColumn() {
  return (
    <div style={{ overflow: 'auto', padding: '24px 32px' }}>
      <div style={{ maxWidth: 720 }}>
        <RouteTrace/>
        <Headline/>
        <ResultCard/>
        <VerificationTrace/>
        <ContinueChain/>
        <Citations/>
      </div>
    </div>
  );
}

function RouteTrace() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 11 }}>
      <span className="v2-label">Route</span>
      <span className="v2-chip v2-chip-kec">KOREA</span>
      <I.Right s={10} style={{ color: 'var(--v2-fg-4)' }}/>
      <span className="v2-chip"><strong>SB</strong>·electrical-kr</span>
      <I.Right s={10} style={{ color: 'var(--v2-fg-4)' }}/>
      <span className="v2-chip"><strong>CALC</strong>·voltage-drop</span>
      <I.Right s={10} style={{ color: 'var(--v2-fg-4)' }}/>
      <span className="v2-chip v2-chip-pass">DETERMINISTIC</span>
      <span style={{ marginLeft: 'auto' }} className="mono">
        <span style={{ color: 'var(--v2-fg-4)' }}>247ms</span>
      </span>
    </div>
  );
}

function Headline() {
  return (
    <>
      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--v2-fg-1)' }}>
        전압강하 결과
      </h1>
      <p style={{ margin: '0 0 18px', color: 'var(--v2-fg-3)', fontSize: 13 }}>
        22.9kV 변압기 2차측에서 부하 100A를 95mm² CU XLPE 케이블 50m로 공급할 때
      </p>
    </>
  );
}

function ResultCard() {
  return (
    <div className="v2-card" style={{ padding: 0, overflow: 'hidden' }}>
      <ResultNumbers/>
      <AISummary/>
      <CalculationSteps/>
    </div>
  );
}

function ResultNumbers() {
  return (
    <div style={{
      padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
      borderBottom: '1px solid var(--v2-line)',
    }}>
      <div>
        <div className="v2-label" style={{ marginBottom: 6 }}>Voltage drop</div>
        <div className="num" style={{ fontSize: 36, fontWeight: 200, color: 'var(--v2-fg-1)', lineHeight: 1 }}>
          1.84<span style={{ fontSize: 16, color: 'var(--v2-fg-3)', marginLeft: 4 }}>V</span>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-3)', marginTop: 4 }}>0.48% of 380V</div>
      </div>
      <div>
        <div className="v2-label" style={{ marginBottom: 6 }}>Limit (KEC 232.3)</div>
        <div className="num" style={{ fontSize: 36, fontWeight: 200, color: 'var(--v2-fg-2)', lineHeight: 1 }}>
          3.00<span style={{ fontSize: 16, color: 'var(--v2-fg-3)', marginLeft: 4 }}>%</span>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-3)', marginTop: 4 }}>= 11.4 V</div>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        justifyContent: 'center', gap: 8,
      }}>
        <Verdict kind="pass"/>
        <span className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-3)' }}>margin: 2.52% headroom</span>
      </div>
    </div>
  );
}

function AISummary() {
  return (
    <div style={{
      padding: '14px 24px', display: 'flex', gap: 12, alignItems: 'flex-start',
      background: 'var(--v2-ink-2)',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6,
        background: 'var(--v2-brand-tint)', color: 'var(--v2-brand-2)',
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        <I.Spark s={12}/>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--v2-fg-2)', lineHeight: 1.7 }}>
        계산된 전압강하 <strong className="num" style={{ color: 'var(--v2-fg-1)' }}>1.84 V (0.48%)</strong>는 KEC 232.3의
        허용 한계 <strong className="num">3.0%</strong> 이내입니다. 동력 부하의 경우 5.0%까지 허용되므로 추가 여유가
        있습니다. <strong style={{ color: 'var(--v2-fg-1)' }}>현재 케이블 굵기는 적정</strong>합니다. 단, 주변온도가 40°C를
        초과하면 KEC 232.4의 온도 보정계수를 적용해 재검토를 권고합니다.
      </p>
    </div>
  );
}

const STEPS: Array<[string, string, string, string]> = [
  ['01', 'Lookup',  '95mm² CU XLPE → R=0.244 Ω/km, X=0.087 Ω/km @ 75°C', 'KEC 표 232.5-1'],
  ['02', 'Formula', 'ΔV = √3 · I · L · (R·cosφ + X·sinφ)',               'KEC 232.3-(1)'],
  ['03', 'Compute', '√3 · 100 · 0.050 · (0.244·0.9 + 0.087·0.436) = 1.84 V', '—'],
];

function CalculationSteps() {
  return (
    <div style={{ padding: '14px 24px', borderTop: '1px solid var(--v2-line)' }}>
      <div className="v2-sect-title" style={{ marginBottom: 10 }}>Calculation steps · 3</div>
      {STEPS.map(([no, k, v, ref]) => (
        <div key={no} style={{
          display: 'grid', gridTemplateColumns: '28px 80px 1fr auto',
          gap: 12, padding: '8px 0',
          borderBottom: '1px dashed var(--v2-line)', alignItems: 'baseline',
        }}>
          <span className="mono" style={{ color: 'var(--v2-fg-4)', fontSize: 11 }}>{no}</span>
          <span className="v2-label">{k}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-1)' }}>{v}</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--v2-brand-2)' }}>{ref}</span>
        </div>
      ))}
    </div>
  );
}

function VerificationTrace() {
  return (
    <div style={{ marginTop: 16 }}>
      <Trace tone="pass">
        <span style={{ fontWeight: 600 }}>SCORE 0.96</span>
        <span style={{ color: 'var(--v2-fg-4)' }}>·</span>
        <span>GATE pass</span>
        <span style={{ color: 'var(--v2-fg-4)' }}>·</span>
        <span>4 sources · KEC 232.3 · KEC 232.5 · IEC 60364-5-52 · NEC 215.2</span>
        <span style={{ marginLeft: 'auto', color: 'var(--v2-fg-4)' }}>247ms</span>
      </Trace>
      <CriticalRow tone="warn">
        <span className="mono" style={{ fontSize: 11, color: 'var(--v2-fg-1)' }}>
          <strong>PE-REVIEW</strong>
          <span style={{ color: 'var(--v2-fg-4)', margin: '0 8px' }}>·</span>
          주변온도 40°C 초과 가능성 — KEC 232.4 온도 보정계수 재검토 권고
        </span>
      </CriticalRow>
    </div>
  );
}

const CHAIN_CANDIDATES: Array<{ title: string; desc: string; href: string }> = [
  { title: 'Short-circuit current', desc: '이 케이블 임피던스로 단락전류', href: '/search?q=' + encodeURIComponent('단락전류 95mm² CU XLPE 50m') },
  { title: 'OCB rating',            desc: '단락전류로 차단기 용량 산정',   href: '/search?q=' + encodeURIComponent('차단기 정격 OCB 100A') },
  { title: 'Ground resistance',     desc: '접지 임피던스 확인',            href: '/search?q=' + encodeURIComponent('접지 저항 IEEE 80') },
];

function ContinueChain() {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="v2-sect-title" style={{ marginBottom: 10 }}>Continue chain · 3 recommended</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {CHAIN_CANDIDATES.map(({ title, desc, href }) => (
          <Link
            key={title}
            href={href}
            className="v2-card"
            style={{
              padding: 12, textAlign: 'left', cursor: 'pointer',
              background: 'var(--v2-ink-2)', border: '1px solid var(--v2-line)',
              textDecoration: 'none', display: 'block',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--v2-fg-1)' }}>{title}</span>
              <I.Arrow s={11} style={{ color: 'var(--v2-fg-3)' }}/>
            </div>
            <div style={{ fontSize: 11, color: 'var(--v2-fg-3)' }}>{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

type Citation = { code: StdCode; no: string; t: string; date: string; d: 'authoritative' | 'reference' };
const CITATIONS: Citation[] = [
  { code: 'KEC', no: '232.3',       t: '저압 전기설비 — 전압강하',                  date: '2021-12-31', d: 'authoritative' },
  { code: 'KEC', no: '232.5',       t: '저압 케이블 허용전류',                      date: '2021-12-31', d: 'authoritative' },
  { code: 'IEC', no: '60364-5-52',  t: 'Selection and erection — wiring systems',   date: '2019-06-15', d: 'reference' },
  { code: 'NEC', no: '215.2',       t: 'Voltage drop · feeders',                    date: '2023-08-01', d: 'reference' },
];

function Citations() {
  return (
    <div style={{ marginTop: 28 }}>
      <div className="v2-sect-title" style={{ marginBottom: 10 }}>Citations · 4 sources</div>
      {CITATIONS.map((s, i) => (
        <div key={i} style={{
          padding: '10px 0', borderBottom: '1px dashed var(--v2-line)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <StdBadge code={s.code} section={s.no} version=""/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--v2-fg-1)' }}>{s.t}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--v2-fg-4)' }}>
              publ. {s.date} · {s.d}
            </div>
          </div>
          <I.Arrow s={11} style={{ color: 'var(--v2-fg-4)' }}/>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// PART 3 — Physical receipt column (paper metaphor · barcode · hash)
// ============================================================

function ReceiptColumn() {
  return (
    <aside style={{
      borderLeft: '1px solid var(--v2-line)', background: 'var(--v2-ink-0)',
      padding: '24px 20px', overflow: 'auto',
    }}>
      <PaperReceipt/>
      <ReceiptActions/>
      <ProvenanceNote/>
    </aside>
  );
}

const PAPER_BG = '#f4ede0';
const PAPER_INK = '#2a2419';

function PaperReceipt() {
  return (
    <div style={{
      background: PAPER_BG, color: PAPER_INK,
      padding: '20px 18px',
      fontFamily: 'var(--v2-font-mono)',
      fontSize: 11, lineHeight: 1.6, position: 'relative',
      backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 22px, rgba(0,0,0,0.04) 22px 23px)',
      boxShadow: '0 24px 40px rgba(0,0,0,0.4)',
    }}>
      <TornEdge position="top"/>
      <ReceiptHeader/>
      <ReceiptMeta/>
      <ReceiptIO/>
      <ReceiptStandards/>
      <ReceiptHashBarcode/>
      <ReceiptDisclaimer/>
      <TornEdge position="bottom"/>
    </div>
  );
}

function TornEdge({ position }: { position: 'top' | 'bottom' }) {
  const pos = position === 'top' ? { top: -8 } : { bottom: -8, transform: 'rotate(180deg)' };
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, height: 8, ...pos,
      backgroundImage: `radial-gradient(circle at 6px 8px, transparent 5px, ${PAPER_BG} 5px)`,
      backgroundSize: '12px 8px',
    }}/>
  );
}

function ReceiptHeader() {
  return (
    <div style={{ textAlign: 'center', borderBottom: `1px dashed ${PAPER_INK}`, paddingBottom: 8, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2em' }}>ESA RECEIPT</div>
      <div style={{ fontSize: 9, marginTop: 2 }}>Engineer&apos;s Search Engine</div>
      <div style={{ fontSize: 9, marginTop: 2 }}>4-Team v2 · Korea · KEC 2021</div>
    </div>
  );
}

const META_ROWS: Array<[string, string]> = [
  ['ID',       '0xa7c4f9e2b8d1·73af'],
  ['ISSUED',   '2026-05-12 14:33:07 KST'],
  ['ENGINE',   'voltage-drop@2.4.1'],
  ['OPERATOR', 'kim.eng@esa.io'],
];

function ReceiptMeta() {
  return (
    <div style={{ marginBottom: 8 }}>
      {META_ROWS.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 4 }}>
          <span style={{ display: 'inline-block', width: 70 }}>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

const INPUTS: Array<[string, string]> = [
  ['V',    '22 900 V'],
  ['I',    '100 A'],
  ['L',    '50 m'],
  ['A',    '95 mm² CU XLPE'],
  ['T',    '30 °C'],
  ['cosφ', '0.90'],
];

const OUTPUTS: Array<[string, string]> = [
  ['ΔV',    '1.84 V'],
  ['%',     '0.48 %'],
  ['LIMIT', '3.00 %'],
];

function ReceiptIO() {
  return (
    <>
      <div style={{
        borderTop: `1px dashed ${PAPER_INK}`, borderBottom: `1px dashed ${PAPER_INK}`,
        padding: '8px 0', margin: '8px 0',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>INPUTS</div>
        {INPUTS.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{k}</span><span>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ borderBottom: `1px dashed ${PAPER_INK}`, padding: '0 0 8px', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>OUTPUTS</div>
        {OUTPUTS.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{k}</span><span>{v}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 4 }}>
          <span>VERDICT</span><span>* PASS *</span>
        </div>
      </div>
    </>
  );
}

function ReceiptStandards() {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>STANDARDS</div>
      <div>KEC 232.3 · 232.5</div>
      <div>IEC 60364-5-52 (ref)</div>
    </div>
  );
}

const SHA256_DEMO = '4f7a 9c2e 8b1d 6035 a1c9 d4f7 2e8b 5916 c037 ab8e 4d12 f9c5 8a36 e2b1 d748 9f50';

function ReceiptHashBarcode() {
  return (
    <div style={{ borderTop: `1px dashed ${PAPER_INK}`, paddingTop: 8 }}>
      <div style={{ fontSize: 8, marginBottom: 6, wordBreak: 'break-all', opacity: 0.7 }}>
        SHA-256 {SHA256_DEMO}
      </div>
      <Barcode/>
      <div style={{ textAlign: 'center', fontSize: 9, marginTop: 4 }}>
        IPFS bafy...7c9e · 2026-05-12 14:33 KST
      </div>
    </div>
  );
}

function Barcode() {
  // Deterministic stripe widths — i%7==0: 3px, i%3==0: 2px, else 1px.
  const bars = Array.from({ length: 54 }, (_, i) => (i % 7 === 0 ? 3 : i % 3 === 0 ? 2 : 1));
  return (
    <div style={{ display: 'flex', gap: 1, height: 28, justifyContent: 'center' }}>
      {bars.map((w, i) => (
        <div key={i} style={{ width: w, background: PAPER_INK }}/>
      ))}
    </div>
  );
}

function ReceiptDisclaimer() {
  return (
    <div style={{
      borderTop: `1px dashed ${PAPER_INK}`, marginTop: 8, paddingTop: 8,
      fontSize: 8, lineHeight: 1.5, opacity: 0.7,
    }}>
      본 영수증은 시점 증명이며 결과 보증이 아닙니다.
      현장 적용 전 자격자의 검토가 필요합니다.
      © ESA 2026
    </div>
  );
}

const RECEIPT_HASH_DEMO = '0xa7c4f9e2b8d1·73af';

function ReceiptActions() {
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the timer on unmount so a delayed setState never fires on a stale ref.
  React.useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const handleCopy = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(RECEIPT_HASH_DEMO);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied — silent (preview-grade; real app would toast).
    }
  }, []);

  const handleExport = React.useCallback(() => {
    if (typeof window !== 'undefined') window.print();
  }, []);

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      <button
        type="button"
        onClick={handleCopy}
        className="v2-btn"
        style={{ flex: 1, justifyContent: 'center' }}
        aria-label="Copy receipt hash to clipboard"
      >
        <I.Copy s={11}/> {copied ? 'Copied' : 'Copy hash'}
      </button>
      <button
        type="button"
        onClick={handleExport}
        className="v2-btn"
        style={{ flex: 1, justifyContent: 'center' }}
        aria-label="Export receipt"
      >
        <I.File s={11}/> Export
      </button>
    </div>
  );
}

function ProvenanceNote() {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--v2-line)', fontSize: 10 }}>
      <Signal label="RECEIPT GRADE · PE-REVIEWABLE"/>
      <p style={{ margin: '8px 0 0', color: 'var(--v2-fg-3)', lineHeight: 1.6 }}>
        Receipt is content-addressed (SHA-256) and anchored to IPFS.
        Identical inputs always produce the same hash —
        idempotent across reruns of the {CALCULATOR_COUNT}-engine deterministic core.
      </p>
      <Hash value="0xa7c4f9e2b8d1·73af" tone="brand"/>
    </div>
  );
}

// IDENTITY_SEAL: preview/concept-v2/answer | role=AnswerTape (receipt metaphor) | inputs=mock | outputs=React UI
