import { CALCULATOR_REGISTRY } from '@/engine/calculators';
import { CALCULATOR_PARAMS, CALCULATOR_NAMES } from '@/lib/calculator-params';
import { assembleSubmitValues, makeRow, type ExtendedParamDef } from '@/components/CalculatorForm';

// ═══════════════════════════════════════════════════════════════════════════════
// 회귀 방지 — CALCULATOR_PARAMS ↔ 계산기 입력 계약 정합성 (전 57개)
//
// 폼은 값을 param.name으로 키잉해 전송하고, 폼→API→계산기 사이에 이름 매핑이
// 없다. param.name이 계산기 입력 필드명과 어긋나면 "<field> ... got undefined"로
// 프로덕션에서 던진다. 단위 테스트는 계산기를 직접 부르므로 이 드리프트를 못 잡는다.
//
// 이 테스트는 폼의 실제 조립 함수(assembleSubmitValues)로 payload를 만들어
// (설계 입력처럼 기본값 없는 필수 숫자는 유효 fallback으로 채움) 계산기를 실행,
// (1) 유한한 value, (2) 비어있지 않은 source가 나오는지 검증한다. 배열 입력
// 계산기(loads/sections/transformers 등)도 폼의 배열 필드 경로로 함께 검증한다.
// 2026-07-19 실측: 수정 전 57개 중 52개가 이 경로에서 예외로 죽었다.
// ═══════════════════════════════════════════════════════════════════════════════

const FALLBACK_NUM = 100;

function clamp(v: number, min?: number, max?: number): number {
  if (typeof min === 'number' && v < min) v = min;
  if (typeof max === 'number' && v > max) v = max;
  return v;
}

/** 폼의 초기 raw 상태를 재현하되, 기본값 없는 필수 숫자는 유효 fallback으로 채운다. */
function buildRawState(defs: ExtendedParamDef[]): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  for (const p of defs) {
    if (p.type === 'array') {
      const schema = p.itemSchema ?? [];
      const count = Math.max(p.defaultItems ?? p.minItems ?? 1, p.minItems ?? 1);
      // makeRow는 기본값만 채우므로, 기본값 없는 숫자 sub-field는 fallback 보정.
      s[p.name] = Array.from({ length: count }, () => {
        const row = makeRow(schema);
        for (const sub of schema) {
          if (sub.type === 'number' && (row[sub.name] === '' || row[sub.name] === undefined)) {
            row[sub.name] = String(clamp(FALLBACK_NUM, sub.min, sub.max));
          }
        }
        return row;
      });
    } else if (p.type === 'boolean') {
      s[p.name] = (p.defaultValue as boolean) ?? false;
    } else if (p.type === 'number') {
      s[p.name] = p.defaultValue != null ? String(p.defaultValue) : String(clamp(FALLBACK_NUM, p.min, p.max));
    } else if (p.type === 'string' && p.options?.length) {
      s[p.name] = p.defaultValue != null ? String(p.defaultValue) : String(p.options[0].value);
    } else {
      s[p.name] = p.defaultValue != null ? String(p.defaultValue) : '텍스트';
    }
  }
  return s;
}

const allIds = [...CALCULATOR_REGISTRY.keys()];

describe('CALCULATOR_PARAMS ↔ 계산기 입력 계약 (전 계산기 UI 경로 실행)', () => {
  test.each(allIds)('%s: 폼 조립 payload로 실제 계산이 된다', (id) => {
    const entry = CALCULATOR_REGISTRY.get(id)!;
    const defs = CALCULATOR_PARAMS[id] as ExtendedParamDef[];
    expect(defs).toBeDefined();
    expect(defs.length).toBeGreaterThan(0);

    const payload = assembleSubmitValues(defs, buildRawState(defs) as never);
    const result = entry.calculator(payload) as { value: unknown; source?: unknown[] };

    const v = result.value;
    const valueOk =
      (typeof v === 'number' && Number.isFinite(v)) ||
      (typeof v === 'string' && v.length > 0);
    expect(valueOk).toBe(true);
    expect(Array.isArray(result.source) ? result.source.length : 0).toBeGreaterThan(0);
  });

  test('모든 레지스트리 계산기가 CALCULATOR_NAMES에 있다 (죽은 링크 방지)', () => {
    const missing = allIds.filter((id) => !CALCULATOR_NAMES[id]);
    expect(missing).toEqual([]);
  });

  test('케이블 계산기 UI는 모든 도체·절연 조합에 정본 표가 있는 설치방법만 노출한다', () => {
    const installation = (CALCULATOR_PARAMS['cable-sizing'] as ExtendedParamDef[])
      .find((param) => param.name === 'installation');

    expect(installation?.options?.map((option) => option.value)).toEqual(['C', 'A1', 'D']);
  });
});
