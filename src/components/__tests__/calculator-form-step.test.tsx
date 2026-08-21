/**
 * 숫자 입력의 step 계약.
 *
 * HTML5 는 `step` 을 검증에 쓰고 그 격자의 기준점은 `min` 이다. min=0.01,
 * step=0.05 면 유효값이 0.01·0.06·…·0.56·0.61 이므로 조명률 0.6·보수율 0.8
 * 같은 표준값이 브라우저에서 거부된다. 거부되면 폼 제출이 React 검증 이전에
 * 막혀 오류 문구조차 뜨지 않고, 사용자는 "계산하기가 안 먹는다"만 겪는다.
 *
 * 실측(2026-07-25): 7개 파라미터가 **자기 기본값부터** 이 격자를 벗어나
 * 단락전류·아크플래시·조도·UPS·배터리·제동저항기 6종이 기본 상태에서
 * 제출조차 되지 않았다. 여기 값들은 연속량이라 격자에 맞출 이유가 없다.
 */
import { CALCULATOR_PARAMS } from '@/lib/calculator-params';
import type { ExtendedParamDef } from '@/components/CalculatorForm';

function numericParams(params: readonly ExtendedParamDef[]): ExtendedParamDef[] {
  return params.flatMap((p) => [
    ...(p.type === 'number' ? [p] : []),
    ...numericParams(p.itemSchema ?? []),
  ]);
}

describe('숫자 입력은 step 격자로 값을 막지 않는다', () => {
  it('렌더러가 step 을 검증에 쓰지 않는다', () => {
    // 두 렌더러 모두 step="any" 여야 한다. 하나만 고치면 인라인 계산기에서 재발한다.
    const sources = [
      require('node:fs').readFileSync('src/components/CalculatorForm.tsx', 'utf8'),
      require('node:fs').readFileSync('src/components/InlineCalcResult.tsx', 'utf8'),
    ];
    for (const src of sources) {
      expect(src).toContain('step="any"');
      expect(src).not.toContain("step={param.step");
    }
  });

  it('폼은 noValidate 로 native 검증을 끈다 — 안 그러면 min 위반이 침묵으로 막힌다', () => {
    // step 만 문제가 아니다. `min` 도 native 검증에 쓰이고, 위반하면(rangeUnderflow)
    // submit 이벤트 자체가 발화하지 않아 React 의 「최소값: X」 문구·포커스 이동이
    // 한 번도 돌지 않는다(실측 2026-08-21: 음수 입력 → submitEventFired=false ·
    // aria-invalid 0). noValidate 로 native 를 끄고 우리 검증이 전 경로를 소유한다.
    const src = require('node:fs').readFileSync('src/components/CalculatorForm.tsx', 'utf8') as string;
    // form 태그에 noValidate 가 있어야 하고, React 검증 문구가 실재해야 한다.
    expect(/<form[^>]*\bnoValidate\b/.test(src)).toBe(true);
    expect(src).toContain('최소값:');
    // 검증이 오류를 실제로 push 하는지 — 조용히 통과시키지 않는다.
    expect(src).toContain("num < param.min");
  });

  it('정의에 남은 step 은 기본값조차 통과시키지 못한다 — 왜 검증에 쓰면 안 되는지', () => {
    const offGrid: string[] = [];
    for (const id of Object.keys(CALCULATOR_PARAMS)) {
      for (const p of numericParams(CALCULATOR_PARAMS[id])) {
        if (p.step === undefined || typeof p.defaultValue !== 'number') continue;
        const k = (p.defaultValue - (p.min ?? 0)) / p.step;
        if (Math.abs(k - Math.round(k)) > 1e-9) offGrid.push(`${id}.${p.name}`);
      }
    }
    // 이 목록이 비어 있지 않다는 것이 step 을 검증에 쓰면 안 되는 이유다.
    expect(offGrid.length).toBeGreaterThan(0);
  });
});
