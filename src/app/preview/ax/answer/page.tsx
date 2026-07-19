import { Check, ChevronDown, Mic, ArrowUp } from 'lucide-react';
import { IconRail, StatusBar, MobileTabBar } from '../_components';

const SOURCES = [
  { ref: 'KEC 232.3.9', desc: '수용가 설비의 전압강하 — 조명 3%, 기타 5% 이하' },
  { ref: 'IEC 60364-5-52', desc: '표 B.52.2 — 허용전류 (PVC 3심, 동)' },
];
const FOLLOWUPS = ['케이블을 35mm²로 올리면?', '조명 기준 3%로 재검토', '차단기 정격 확인'];

// ── 검증 영수증 (시그니처: 실물 영수증 메타포) ──
function Receipt() {
  return (
    <div style={{ background: 'var(--ax-receipt)', border: '1px solid var(--ax-line-2)', borderRadius: 6, padding: '20px 22px', boxShadow: '0 8px 24px rgba(35,36,31,.07)', position: 'relative' }} className="ax-mono">
      <div aria-hidden="true" style={{ position: 'absolute', right: 16, top: 16, width: 60, height: 60, border: '2px solid #b8770a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-12deg)', color: '#b8770a', fontWeight: 600, fontSize: 12.5, opacity: .85 }}>적 합</div>
      <div style={{ fontSize: 10.5, letterSpacing: '.2em', color: 'var(--ax-faint-2)' }}>ESVA · RECEIPT</div>
      <div style={{ marginTop: 12, fontSize: 11.5, lineHeight: 2.05, color: '#3d3e36' }}>
        계산기 · voltage-drop v2.1<br />
        입력 · 380V 3φ / 50kW / 100m<br />
        결과 · <b>2.79 %</b> · PASS<br />
        조항 · KEC 232.3.9 (≤5%)<br />
        모델 · Gemini 2.5 (BYOK)
      </div>
      <div className="ax-perf" style={{ margin: '12px 0' }} />
      <div style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--ax-faint-2)' }}>
        SHA-256<br /><span style={{ color: '#3d3e36' }}>a3f8 44c1 …… 9c2e</span>
      </div>
      <div className="ax-barcode" style={{ marginTop: 12 }} />
      <div style={{ marginTop: 12, display: 'flex', gap: 8, fontFamily: 'var(--ax-font-sans)' }}>
        <button type="button" style={{ flex: 1, border: '1px solid var(--ax-line-2)', borderRadius: 7, padding: '7px 0', fontSize: 12, fontWeight: 600, color: '#3d3e36', background: 'transparent', cursor: 'pointer' }}>PDF</button>
        <button type="button" style={{ flex: 1, border: '1px solid var(--ax-line-2)', borderRadius: 7, padding: '7px 0', fontSize: 12, fontWeight: 600, color: '#3d3e36', background: 'transparent', cursor: 'pointer' }}>해시 검증</button>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <>
      <Receipt />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', color: 'var(--ax-faint-2)', marginBottom: 10 }}>출처 · 2</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SOURCES.map(({ ref, desc }) => (
            <div key={ref} className="ax-card" style={{ borderRadius: 10, padding: '11px 14px' }}>
              <div className="ax-mono" style={{ fontSize: 11, color: 'var(--ax-amber)', fontWeight: 600 }}>{ref}</div>
              <div style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ax-muted)' }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', color: 'var(--ax-faint-2)', marginBottom: 8 }}>관련 계산기</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span>케이블 선정 (KEC) →</span>
          <span>차단기 정격 선정 →</span>
        </div>
      </div>
    </>
  );
}

function AnswerBody() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ax-faint)' }}>
        <span className="ax-chip" style={{ padding: '3px 10px', fontWeight: 500 }}>스레드</span>
        <span>2026-07-19 14:22</span>
        <span className="ax-mono" style={{ marginLeft: 'auto', fontSize: 11 }}>Gemini 2.5 · BYOK</span>
      </div>
      <h1 style={{ margin: '14px 0 0', fontSize: 22, fontWeight: 600, lineHeight: 1.45, letterSpacing: '-.01em' }}>
        3상 380V·50kW 부하, 케이블 길이 100m — 전압강하 검토
      </h1>
      <div className="ax-card" style={{ marginTop: 18, padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <span className="ax-mono ax-tnum" style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-.02em' }}>
            2.79<span style={{ fontSize: 22, color: 'var(--ax-faint)' }}>%</span>
          </span>
          <span style={{ fontSize: 14.5, color: 'var(--ax-muted)' }}>허용 기준 5% 이내 —</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--ax-pass-bg)', color: 'var(--ax-pass)', borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}>
            <Check size={13} strokeWidth={2.5} />적합
          </span>
        </div>
        <div className="ax-mono" style={{ marginTop: 10, fontSize: 12, color: 'var(--ax-faint)' }}>
          I = 84.4 A · CV 25 mm² Cu 3C · cosφ 0.9 · e = √3·I·L·(R cosφ + X sinφ)
        </div>
        <button type="button" style={{ marginTop: 14, borderTop: '1px dashed var(--ax-line-3)', paddingTop: 11, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ax-muted)', background: 'transparent', border: 0, borderTopWidth: 1, borderTopStyle: 'dashed', borderTopColor: 'var(--ax-line-3)', width: '100%', cursor: 'pointer' }}>
          <ChevronDown size={14} strokeWidth={2} />수식 전개 4단계 보기
        </button>
      </div>
      <p style={{ margin: '22px 0 0', fontSize: 15, lineHeight: 1.85, color: 'var(--ax-ink-2)' }}>
        380V 3상 회로에서 50kW(역률 0.9) 부하의 정격전류는 84.4A입니다. CV 25mm² 동도체 기준 임피던스를 적용하면 100m에서 전압강하는 10.6V(2.79%)로, <span className="ax-clause">KEC 232.3.9</span> 의 기타 회로 허용치 5% 이내입니다. 조명 회로로 사용할 경우 기준이 3%로 강화되어 재검토가 필요합니다. 허용전류는 <span className="ax-clause">IEC 60364-5-52 표 B.52.2</span> 를 함께 확인했습니다.
      </p>
      <div style={{ marginTop: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FOLLOWUPS.map((f) => (
          <button key={f} type="button" style={{ border: '1px solid var(--ax-line-3)', background: 'var(--ax-panel)', borderRadius: 999, padding: '8px 16px', fontSize: 13, color: 'var(--ax-muted)', cursor: 'pointer' }}>{f}</button>
        ))}
      </div>
    </div>
  );
}

function InputBar() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--ax-panel)', border: '1px solid var(--ax-line-2)', borderRadius: 14, padding: '15px 20px', boxShadow: '0 4px 20px rgba(28,27,23,.06)' }}>
      <span style={{ flex: 1, fontSize: 14.5, color: 'var(--ax-faint-2)' }}>이어서 질문하거나 조건을 바꿔보세요…</span>
      <Mic size={18} strokeWidth={2} color="var(--ax-faint-2)" aria-hidden="true" />
      <button type="button" className="ax-submit ax-submit--sm" aria-label="전송"><ArrowUp size={16} strokeWidth={2.5} /></button>
    </div>
  );
}

export default function AXAnswer() {
  return (
    <>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, background: 'var(--ax-surface)' }}>
        <IconRail active="new" />

        {/* ═══════════ 데스크톱 1b ═══════════ */}
        <div className="ax-desktop-only" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ flex: 1, overflow: 'auto', padding: '40px 52px 0' }}><AnswerBody /></div>
            <div style={{ flex: 'none', padding: '18px 52px 24px', background: 'linear-gradient(180deg,rgba(251,250,247,0),var(--ax-surface) 40%)' }}><InputBar /></div>
          </div>
          <aside aria-label="검증 영수증·출처" style={{ width: 340, flex: 'none', borderLeft: '1px solid var(--ax-line)', background: 'var(--ax-panel-2)', padding: '36px 24px 24px', display: 'flex', flexDirection: 'column', gap: 18, overflow: 'auto' }}>
            <Sidebar />
            <div style={{ marginTop: 'auto', borderTop: '1px solid var(--ax-line)', paddingTop: 12, fontSize: 11, lineHeight: 1.7, color: 'var(--ax-faint-2)' }}>본 결과는 PE 검토를 대체하지 않습니다.</div>
          </aside>
        </div>

        {/* ═══════════ 모바일 (스택) ═══════════ */}
        <div className="ax-mobile-only" style={{ flex: 1, minWidth: 0, flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '24px 20px 0' }}><AnswerBody /></div>
          <div style={{ padding: '24px 20px 0', display: 'flex', flexDirection: 'column', gap: 18 }}><Sidebar /></div>
          <p style={{ padding: '16px 20px 0', margin: 0, fontSize: 11, lineHeight: 1.7, color: 'var(--ax-faint-2)' }}>본 결과는 PE 검토를 대체하지 않습니다.</p>
          <div style={{ padding: '16px 20px 24px' }}><InputBar /></div>
        </div>
      </div>

      <StatusBar right="이 스레드 영수증 1건 발행됨" extra="응답 p50 142ms" />
      <MobileTabBar active="threads" />
    </>
  );
}
