import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseDxfToSLD } from '@/engine/topology/dxf-parser';

import { reviewAnalysis } from '../circuit-review';

/**
 * **도면 파일 → 파서 → 검토** 사슬을 끝까지 밟는다.
 *
 * 이 검사가 생긴 이유(2026-07-29 실측): 검토 규칙은 단위 검사가 두껍고
 * (`circuit-review.test.ts` 에 AF/AT 만 36 곳) 스위트는 초록인데, **합성 도면
 * 16 장 중 실제로 판정이 난 장이 0 이었다.** 전부 `판정 보류` 였다.
 *
 *   · 차단기 정격을 담은 장: 1/15 (L1-02, 800A 단독 표기)
 *   · 케이블 스펙을 담은 장: 0/15
 *   → `AT ≤ AF` 도 `허용전류 대조` 도 DXF 경로에서 **한 번도 발화한 적이 없다.**
 *
 * 그래서 이 사슬에서 두 결함이 여태 숨어 있었다:
 *   ① 파서가 `100AF/150AT` 를 `current: '150A'` 로 납작하게 눌러 **프레임이
 *      소실**됐다. 트립이 프레임을 넘은 차단기가 그냥 통과했다.
 *   ② 케이블 표기가 **가장 가까운 선로가 아니라 반경 안에서 먼저 만난 선로**
 *      에 붙어, 차단기가 제 것이 아닌 케이블로 판정됐다.
 *
 * 정답은 `L2-06-rated-feeder.label.json` 의 `expectedReview` 다 —
 * `scripts/fixtures/drawing-specs.mjs` 에 **손으로 적은 선언**이고 파서·판정
 * 출력에서 파생하지 않는다(닫힌 순환 금지, 그 파일 머리말 참조).
 */

const FIXTURES = join(process.cwd(), 'fixtures', 'drawings', 'synthetic');
const ID = 'L2-06-rated-feeder';

const label = JSON.parse(readFileSync(join(FIXTURES, `${ID}.label.json`), 'utf8')) as {
  expectedReview: {
    breakersTotal: number;
    breakersRatedParsed: number;
    breakersWithCable: number;
    mustFail: Array<{ rule: string; subject: string }>;
    mustNotFail: Array<{ rule: string; subject: string }>;
  };
};

const analysis = parseDxfToSLD(readFileSync(join(FIXTURES, `${ID}.dxf`), 'utf8'));
const report = reviewAnalysis(analysis);

describe('DXF → 검토 사슬 (L2-06-rated-feeder)', () => {
  it('도면이 파싱된다 — 부품·연결이 실제로 나온다', () => {
    expect(analysis.components.length).toBeGreaterThan(0);
    expect(analysis.connections.length).toBeGreaterThan(0);
  });

  it('선언한 만큼 읽어 낸다 — 커버리지', () => {
    expect(report.coverage).toEqual({
      breakersTotal: label.expectedReview.breakersTotal,
      breakersRatedParsed: label.expectedReview.breakersRatedParsed,
      breakersWithCable: label.expectedReview.breakersWithCable,
    });
  });

  /** ① 프레임 소실 회귀. 이 검사가 깨지면 AT ≤ AF 가 다시 못 돈다. */
  it.each(
    (label.expectedReview.mustFail ?? []).map((f) => [f.rule, f.subject] as const),
  )('%s 가 %s 에서 부적합으로 잡힌다', (rule, subject) => {
    const hit = report.findings.find((f) => f.rule === rule && f.subject.includes(subject));
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe('FAIL');
  });

  /** ② 남의 케이블로 판정하면 여기가 깨진다 — 멀쩡한 차단기가 부적합이 된다. */
  it.each(
    (label.expectedReview.mustNotFail ?? []).map((f) => [f.rule, f.subject] as const),
  )('%s 는 %s 에서 부적합이 아니다', (rule, subject) => {
    const hit = report.findings.find((f) => f.rule === rule && f.subject.includes(subject));
    expect(hit?.severity).not.toBe('FAIL');
  });

  /**
   * 판정이 실제로 났는지 — 전부 `판정 보류` 로 초록이던 상태로 되돌아가지
   * 않게 못 박는다. 이 한 줄이 이 파일의 존재 이유다.
   */
  it('판정 보류만 내고 끝나지 않는다', () => {
    const { fail, pass, unknown } = report.summary;
    expect(fail + pass).toBeGreaterThan(0);
    expect(fail).toBeGreaterThanOrEqual(2);
    expect(pass).toBeGreaterThanOrEqual(1); // 통과 분기도 밟는다
    expect(unknown).toBeLessThan(fail + pass + unknown); // 전량 보류 금지
  });

  /**
   * 허용전류 판정이 **그 회로의** 케이블로 났는지. 굵은 쪽(95sq)과 가는 쪽
   * (16sq)이 뒤바뀌면 값이 서로 바뀐다 — 규칙 이름만 보면 못 잡는다.
   */
  it('각 차단기가 자기 회로 케이블로 판정된다', () => {
    const amp = report.findings.filter((f) => f.rule === 'CABLE-AMPACITY');
    const m1 = amp.find((f) => f.subject.includes('MCCB-1'));
    const m2 = amp.find((f) => f.subject.includes('MCCB-2'));
    // 95sq 쪽이 16sq 쪽보다 허용전류가 크다 — 숫자를 박지 않고 대소만 본다.
    const currentOf = (v?: string) => Number(/(\d+)A(?!F|T)/.exec(v ?? '')?.[1] ?? 0);
    expect(currentOf(m1?.verdict)).toBeGreaterThan(0);
    expect(currentOf(m2?.verdict)).toBeGreaterThan(0);
    expect(m1!.verdict).toContain('258A');
    expect(m2!.verdict).toContain('85A');
  });
});
