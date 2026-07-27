import { reviewAnalysis } from '../circuit-review';
import type { SLDAnalysis, SLDComponent } from '@/lib/sld-recognition';

/**
 * 변압기 용량과 주차단기 정격의 **상호 대조**.
 *
 * `TR-MAIN-CURRENT` 는 읽은 용량에서 I₂를 파생한다. 용량을 잘못 읽으면
 * 오차가 그대로 커져서 나온다 — 파생값은 원본 오류를 못 잡는다.
 *
 * 실측(2026-07-28 스캔 티어): 같은 도면·같은 모델로 두 번 돌렸더니 500kVA
 * 변압기를 **300kVA · 1000kVA** 로 읽었다. 두 번 다 틀렸고, 1000kVA 로 틀린
 * 응답의 문서 confidence 는 **0.9** 였다. 모델 자기신고는 오독을 가리키지
 * 못한다(§2.3 — 자기채점은 오라클이 아니다).
 *
 * 이 자리에서 쓸 수 있는 독립 근거는 **도면이 따로 들고 있는 값**뿐이다.
 * 2차 주차단기는 변압기 정격 2차전류를 흘려야 하므로 트립이 I₂ 이상이어야
 * 한다. 페이지 최대 트립조차 I₂보다 작으면 둘 중 하나는 틀렸다.
 *
 * 어느 쪽이 틀렸는지는 모른다 — 그래서 FAIL 이 아니라 WARN 이다.
 */
const tr = (label: string): SLDComponent => ({
  id: 'tr-1', type: 'transformer', label, position: { x: 100, y: 100 },
});
const breaker = (id: string, label: string): SLDComponent => ({
  id, type: 'breaker', label, position: { x: 100, y: 200 },
});

const analysis = (components: SLDComponent[]): SLDAnalysis => ({
  components,
  connections: [],
  confidence: 0.9,
  warnings: [],
  suggestedCalculations: [],
  rawDescription: '',
});

const trFinding = (components: SLDComponent[]) =>
  reviewAnalysis(analysis(components)).findings.find((f) => f.rule === 'TR-MAIN-CURRENT');

describe('변압기 용량 ↔ 주차단기 정격 상호 대조', () => {
  // 500kVA · 380V · 3φ → I₂ = 500000/(√3×380) ≈ 760A
  const TR500 = 'MOLD TR-1 500kVA 3φ 380V';

  it('정상 — 800AT 주차단기가 760A 를 상회하면 모순 없음', () => {
    const f = trFinding([tr(TR500), breaker('cb-1', 'ACB 800AF/800AT')]);
    expect(f?.severity).toBe('INFO');
    expect(f?.computed?.['정격 2차전류']).toBe('760A');
    expect(f?.given?.['이 페이지 최대 트립']).toBe('800AT');
  });

  /**
   * 실측 오독 재현. 같은 도면을 1000kVA 로 읽으면 I₂가 1519A 가 되는데
   * 주차단기는 여전히 800AT 다 — 그 순간 모순이 드러난다.
   */
  it('오독 적발 — 1000kVA 로 잘못 읽으면 800AT 와 모순되어 WARN', () => {
    const f = trFinding([tr('MOLD TR-1 1000kVA 3φ 380V'), breaker('cb-1', 'ACB 800AF/800AT')]);
    expect(f?.severity).toBe('WARN');
    expect(f?.computed?.['정격 2차전류']).toBe('1519A');
    expect(f?.verdict).toContain('800AT');
    // 어느 값이 틀렸는지 단정하지 않는다 — 세 가능성을 다 적어야 한다.
    expect(f?.verdict).toContain('이 페이지에 없거나');
    expect(f?.verdict).toContain('잘못 읽었거나');
    expect(f?.verdict).toContain('실제로 미달');
  });

  /**
   * 반대 방향 오독도 잡히는가 — 300kVA 로 읽으면 I₂ 456A 라 800AT 안에
   * 들어온다. **이 대조는 과대 오독만 잡는다.** 그 한계를 여기 적어 둔다.
   */
  it('과소 오독(300kVA)은 이 대조로 잡히지 않는다 — 알고 남기는 한계', () => {
    const f = trFinding([tr('MOLD TR-1 300kVA 3φ 380V'), breaker('cb-1', 'ACB 800AF/800AT')]);
    expect(f?.severity).toBe('INFO');
    expect(f?.computed?.['정격 2차전류']).toBe('456A');
  });

  it('차단기 정격이 하나도 안 읽히면 대조를 건너뛴다 — 없는 근거로 경고하지 않는다', () => {
    const f = trFinding([tr(TR500), breaker('cb-1', 'ACB')]);
    expect(f?.severity).toBe('INFO');
    expect(f?.given?.['이 페이지 최대 트립']).toBeUndefined();
    expect(f?.verdict).toContain('대조 생략');
  });

  it('차단기가 아예 없어도 I₂ 계산과 판정은 남는다', () => {
    const f = trFinding([tr(TR500)]);
    expect(f?.severity).toBe('INFO');
    expect(f?.computed?.['정격 2차전류']).toBe('760A');
  });

  it('페이지 최대 트립을 쓴다 — 작은 분기 차단기 때문에 오경보하지 않는다', () => {
    const f = trFinding([
      tr(TR500),
      breaker('cb-1', 'MCCB 100AF/50AT'),
      breaker('cb-2', 'ACB 800AF/800AT'),
      breaker('cb-3', 'MCCB 225AF/175AT'),
    ]);
    expect(f?.severity).toBe('INFO');
    expect(f?.given?.['이 페이지 최대 트립']).toBe('800AT');
  });

  /**
   * 용량·전압·상수가 무모호하지 않으면 애초에 I₂를 만들지 않는다(무발명).
   * 대조를 붙이면서 그 규율을 깨지 않았는지 확인한다.
   */
  it('상수 미기재면 대조 이전에 UNKNOWN 으로 보류한다', () => {
    const f = trFinding([tr('MOLD TR-1 500kVA 380V'), breaker('cb-1', 'ACB 800AF/800AT')]);
    expect(f?.severity).toBe('UNKNOWN');
    expect(f?.computed?.['정격 2차전류']).toBeUndefined();
  });
});
