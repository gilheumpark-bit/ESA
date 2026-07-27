import { surveyPageKind } from '../page-classifier';

/**
 * `surveyPageKind` 의 판정 중 **결과가 있는 것은 `empty` 하나뿐이다.**
 * 오케스트레이터가 `drawingKind === 'empty'` 인 페이지를 `skipped-empty` 로
 * 표시하고 분석 루프에서 통째로 건너뛴다(`document-orchestrator.ts`).
 * 나머지 6 분류(sld·legend·title·sequence·layout·unknown)는 계산만 되고
 * 아무도 읽지 않는다.
 *
 * 그래서 여기서 잠그는 것은 **"실제로 들어오는 페이지가 empty 로 몰리지
 * 않는가"** 다. 잘못 몰리면 도면 한 장이 조용히 사라진다 — 오류도 경고도
 * 없이 분석 대상에서 빠지므로 사용자는 누락을 알 방법이 없다.
 *
 * 기존 잠금은 `vectorOpCount: 1` 한 케이스뿐이었다. empty 판정은 입력 세
 * 개의 논리곱인데 그중 하나만 밟고 있었다.
 */
describe('페이지 분류 — 건너뛰기 판정', () => {
  /**
   * `drawing-source.ts` 가 실제로 만드는 페이지 모양이다. 여기 값이
   * 바뀌면 이 표도 함께 바뀌어야 한다 — 아래 정합성 검사가 강제한다.
   */
  const 실입력 = [
    ['이미지 업로드(PNG/JPG/WEBP)', { textSample: 'sld-sample.png', vectorOpCount: 0, rasterCoverage: 1 }],
    ['DXF', { textSample: 'plant.dxf', vectorOpCount: 1, rasterCoverage: 0 }],
    ['PDF 벡터 페이지', { textSample: '22.9kV 수전반', vectorOpCount: 412, rasterCoverage: 0 }],
    ['PDF 스캔 페이지(텍스트 없음)', { textSample: '', vectorOpCount: 0, rasterCoverage: 1 }],
    // constructPath 하나에 도형이 들어 있는 페이지. 벡터 연산 1 은 "거의
    // 없음" 이 아니라 "도면이 있음" 이다 — 예전에 이걸 빈 페이지로 몰았다.
    ['PDF 벡터 최소(선 하나)', { textSample: '', vectorOpCount: 1, rasterCoverage: 0 }],
    ['PDF 텍스트만(표지)', { textSample: 'DRAWING NO. E-101', vectorOpCount: 0, rasterCoverage: 0 }],
  ] as const;

  it.each(실입력)('%s 은 건너뛰지 않는다', (_이름, input) => {
    expect(surveyPageKind(input)).not.toBe('empty');
  });

  /**
   * 반증 — 규칙이 살아 있어야 위 검사가 의미를 갖는다. `not.toBe('empty')`
   * 만 있으면 "항상 'sld' 를 돌려주도록" 고쳐도 전부 통과한다.
   */
  it('셋 다 비어 있는 페이지는 건너뛴다', () => {
    expect(surveyPageKind({ textSample: '', vectorOpCount: 0, rasterCoverage: 0 })).toBe('empty');
    expect(surveyPageKind({ textSample: '   ', vectorOpCount: 0, rasterCoverage: 0 })).toBe('empty');
    expect(surveyPageKind({})).toBe('empty');
  });

  /**
   * 셋 중 **어느 하나라도** 있으면 살린다. 논리곱이 논리합으로 뒤집히면
   * 스캔 도면(벡터 0)이나 벡터 도면(래스터 0)이 통째로 사라진다.
   */
  it.each([
    ['텍스트만', { textSample: 'TR-1', vectorOpCount: 0, rasterCoverage: 0 }],
    ['벡터만', { textSample: '', vectorOpCount: 1, rasterCoverage: 0 }],
    ['래스터만', { textSample: '', vectorOpCount: 0, rasterCoverage: 1 }],
  ])('%s 있어도 살린다 — 논리곱이 뒤집히면 도면이 사라진다', (_이름, input) => {
    expect(surveyPageKind(input)).not.toBe('empty');
  });

  /** 래스터 임계(0.05)가 살아 있는지. 아주 옅은 잔여물은 빈 페이지다. */
  it('래스터 흔적이 임계 미만이면 빈 페이지다', () => {
    expect(surveyPageKind({ textSample: '', vectorOpCount: 0, rasterCoverage: 0.04 })).toBe('empty');
    expect(surveyPageKind({ textSample: '', vectorOpCount: 0, rasterCoverage: 0.06 })).not.toBe('empty');
  });
});

/**
 * 위 표가 실제 `drawing-source.ts` 와 어긋나면 잠금이 허구가 된다 —
 * 상상한 입력을 상대로 통과하는 게이트는 §2.2 그대로다.
 */
describe('실입력 표가 source 와 맞는지', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'drawing-source.ts'), 'utf8') as string;

  it('이미지 페이지는 rasterOpCount 1 로 만들어진다', () => {
    expect(src).toMatch(/vectorOpCount:\s*0,\s*[\r\n]+\s*rasterOpCount:\s*1,/);
  });

  it('DXF 페이지는 vectorOpCount 1 로 만들어진다', () => {
    expect(src).toMatch(/vectorOpCount:\s*1,\s*[\r\n]+\s*rasterOpCount:\s*0,/);
  });

  it('오케스트레이터가 rasterOpCount 를 0/1 로 눌러 넘긴다', () => {
    const orch = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'document-orchestrator.ts'), 'utf8') as string;
    expect(orch).toContain('rasterCoverage: page.rasterOpCount > 0 ? 1 : 0');
    expect(orch).toContain("if (state.drawingKind === 'empty') state.status = 'skipped-empty'");
  });
});
