'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp, ArrowUpDown, FileText, Camera, Shield,
} from 'lucide-react';
import {
  EsvaLogo, IconRail, StatusBar, MobileTabBar, MobileStatusBar,
} from './_components';

const EXAMPLES = [
  { icon: ArrowUpDown, text: '380V 50kW 100m 전압강하 검토', arrow: true },
  { icon: FileText, text: 'KEC 232.3.9 전압강하 조항 원문과 예외', arrow: false },
  { icon: Camera, text: '변압기 명판 촬영 → 스펙 추출 → 용량 검증', arrow: false },
];

const VALUES = [
  { n: 'Ⅰ', t: '결정론적 계산', d: '57개 순수함수 엔진 · ±0.01% · LLM은 변수 추출만' },
  { n: 'Ⅱ', t: '조항 기반 판정', d: '245+ 조항 · 출처 없는 답변은 가드레일이 차단' },
  { n: 'Ⅲ', t: '검증 영수증', d: 'SHA-256 봉인 · 모든 결과 재현·감사 가능' },
];

const RECENT = [
  { t: '변압기 500kVA 병렬 운전 조건', m: '어제 · 적합 · 영수증 발행됨' },
  { t: '접지저항 10Ω 설계 — Dwight 식', m: '7월 16일 · 조건 2건 보류' },
];

export default function AXHome() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const go = () => router.push('/preview/ax/answer');
  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); go(); };

  return (
    <>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, background: 'var(--ax-surface)' }}>
        <IconRail active="new" />

        {/* ═══════════ 데스크톱 1a ═══════════ */}
        <div className="ax-desktop-only" style={{ flex: 1, minWidth: 0, flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 40px 0' }}>
            <span className="ax-chip ax-mono" style={{ fontSize: 11, borderColor: 'var(--ax-line-2)', background: 'var(--ax-rail)' }}>
              <span className="ax-dot" />KEC 2021 · NEC 2023 · IEC 60364 · JIS C 0364
            </span>
            <button type="button" style={{ marginLeft: 'auto', border: '1px solid var(--ax-line-2)', borderRadius: 8, padding: '8px 20px', fontSize: 13.5, fontWeight: 500, background: 'transparent', color: 'var(--ax-ink)', cursor: 'pointer' }}>로그인</button>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 760, width: '100%', margin: '0 auto', padding: '0 24px' }}>
            <h1 className="ax-serif" style={{ margin: 0, fontSize: 40, fontWeight: 700, letterSpacing: '-.015em', lineHeight: 1.35, textAlign: 'center' }}>
              AI는 추정하지 않습니다.
            </h1>
            <p style={{ margin: '14px 0 0', fontSize: 16, lineHeight: 1.75, color: 'var(--ax-muted-2)', textAlign: 'center' }}>
              모든 수치는 결정론적 엔진이 계산하고,<br />모든 판정은 기준서 조항이 결정합니다.
            </p>

            <form onSubmit={onSubmit} style={{ marginTop: 40, background: 'var(--ax-panel)', border: '1px solid var(--ax-line-2)', borderRadius: 'var(--ax-radius-input)', padding: '20px 22px', boxShadow: '0 4px 24px rgba(28,27,23,.06)' }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='질문, 계산 조건, 조항 번호 — 무엇이든. 예: "3상 380V 50kW 부하, 케이블 100m 전압강하 검토"'
                aria-label="질문 입력"
                style={{ width: '100%', border: 0, outline: 'none', background: 'transparent', fontSize: 15.5, color: 'var(--ax-ink)', minHeight: 54, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="ax-chip ax-chip--active">⚡ 자동 감지</span>
                <span className="ax-chip">검색</span>
                <span className="ax-chip">계산</span>
                <span className="ax-chip">검증</span>
                <span className="ax-mono" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ax-faint)' }}>
                  <Shield size={12} strokeWidth={2} />Gemini 2.5 · BYOK
                </span>
                <button type="submit" className="ax-submit" aria-label="검토 시작">
                  <ArrowUp size={17} strokeWidth={2.5} />
                </button>
              </div>
            </form>

            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--ax-line)' }}>
              {EXAMPLES.map(({ icon: Icon, text, arrow }, i) => (
                <button key={i} type="button" className="ax-example" onClick={go}>
                  <Icon size={15} strokeWidth={2} color="var(--ax-amber)" />
                  {text}
                  {arrow && <span className="ax-example-arrow" style={{ marginLeft: 'auto', color: '#c9c2b0' }}>↗</span>}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              {VALUES.map(({ n, t, d }, i) => (
                <div key={n} style={{ padding: i === 0 ? '0 24px 0 4px' : i === 2 ? '0 4px 0 24px' : '0 24px', borderRight: i < 2 ? '1px solid var(--ax-line)' : undefined }}>
                  <div className="ax-serif" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ax-amber)' }}>{n}</div>
                  <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 700 }}>{t}</div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.65, color: 'var(--ax-faint)' }}>{d}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '0 40px 26px', maxWidth: 808, width: '100%', margin: '0 auto' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', color: 'var(--ax-faint-2)', marginBottom: 8 }}>최근 스레드</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {RECENT.map(({ t, m }) => (
                <button key={t} type="button" className="ax-card" onClick={go} style={{ padding: '12px 16px', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t}</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--ax-faint-2)' }}>{m}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════ 모바일 1c ═══════════ */}
        <div className="ax-mobile-only" style={{ flex: 1, minWidth: 0, flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 0' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <EsvaLogo size={26} />
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ax-navy)' }}>ESVA</span>
            </span>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', background: '#d9d4c5', color: '#5c5849', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>박</span>
          </div>
          <div style={{ padding: '40px 24px 0' }}>
            <h1 className="ax-serif" style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.45 }}>
              AI는<br />추정하지 않습니다.
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.7, color: 'var(--ax-muted-2)' }}>
              수치는 엔진이 계산하고, 판정은 조항이 결정합니다.
            </p>
            <form onSubmit={onSubmit} style={{ marginTop: 22, background: 'var(--ax-panel)', border: '1px solid var(--ax-line-2)', borderRadius: 'var(--ax-radius-input)', padding: 18, boxShadow: '0 4px 20px rgba(28,27,23,.05)' }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="질문, 계산 조건, 조항 번호 — 무엇이든"
                aria-label="질문 입력"
                style={{ width: '100%', border: 0, outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--ax-ink)', minHeight: 52, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="ax-chip ax-chip--active" style={{ padding: '5px 12px', fontSize: 12 }}>⚡ 자동</span>
                <span className="ax-chip" style={{ padding: '5px 12px', fontSize: 12 }}>검색</span>
                <span className="ax-chip" style={{ padding: '5px 12px', fontSize: 12 }}>계산</span>
                <button type="submit" className="ax-submit" aria-label="검토 시작" style={{ marginLeft: 'auto', width: 44, height: 44, borderRadius: 12 }}>
                  <ArrowUp size={18} strokeWidth={2.5} />
                </button>
              </div>
            </form>
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--ax-line)' }}>
              {EXAMPLES.map(({ icon: Icon, text }, i) => (
                <button key={i} type="button" className="ax-example" onClick={go} style={{ padding: '14px 4px' }}>
                  <Icon size={15} strokeWidth={2} color="var(--ax-amber)" />
                  {text}
                  <span className="ax-example-arrow" style={{ marginLeft: 'auto', color: '#c9c2b0' }}>↗</span>
                </button>
              ))}
            </div>
            <div style={{ margin: '22px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', color: 'var(--ax-faint-2)', marginBottom: 8 }}>최근 스레드</div>
              <button type="button" className="ax-card" onClick={go} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>변압기 500kVA 병렬 운전 조건</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--ax-faint-2)' }}>어제 · 영수증 발행됨</div>
                </div>
                <span style={{ background: 'var(--ax-pass-bg)', color: 'var(--ax-pass)', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 600 }}>적합</span>
              </button>
            </div>
          </div>
          <MobileStatusBar />
        </div>
      </div>

      <StatusBar />
      <MobileTabBar active="home" />
    </>
  );
}
