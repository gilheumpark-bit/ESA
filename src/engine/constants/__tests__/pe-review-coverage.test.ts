import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { requiresPEReview, REVIEW_REQUIREMENTS } from '../disclaimer';
import { CALCULATOR_REGISTRY } from '@engine/calculators';

/**
 * 기술사(PE) 검토 필요 판정이 **조회 키를 맞게 쓰는지** 본다.
 *
 * `REVIEW_REQUIREMENTS` 표가 id 와 category 를 섞어 쓰고 있었다:
 *   category: grounding · voltage-drop · transformer
 *   **id**  : arc-flash · short-circuit · cable-sizing
 * 그런데 함수 인자 이름은 `calculatorCategory` 다. 레지스트리에서
 * `arc-flash` 의 category 는 `protection` 이므로, 호출부가 `entry.category`
 * 를 넘기면 **`protection` → 표에 없음 → null** 이 된다.
 *
 * 하필 그렇게 빠지는 둘이 **검토 필수** 항목이다(아크플래시·단락). 방향이
 * "검토 안 해도 된다" 쪽이라 위험하다.
 *
 * 현재 호출처는 0 이다(`getUncertainty` 도 마찬가지). 붙이는 순간
 * 실제 판정이 되므로 지금 맞춰 두고 잠근다.
 */

describe('PE 검토 필요 판정 — 조회 키', () => {
  const categories = [...new Set([...CALCULATOR_REGISTRY.values()].map((e) => e.category))];

  it('레지스트리 카테고리를 실제로 읽는다', () => {
    expect(categories.length).toBeGreaterThan(5);
  });

  it('안전 직결 계산기는 id 로 물어도 검토 필수가 나온다', () => {
    for (const id of ['arc-flash', 'short-circuit']) {
      const r = requiresPEReview(id);
      expect(r).not.toBeNull();
      expect(r!.required).toBe(true);
    }
  });

  /**
   * 호출부가 `entry.category` 를 넘기는 것이 가장 자연스럽다. 그때
   * 아크플래시·단락이 속한 `protection` 이 검토 필수로 나와야 한다 —
   * 안 나오면 그 둘의 요구가 통째로 사라진다.
   */
  it('보호(protection) 카테고리로 물어도 검토 필수가 나온다', () => {
    const r = requiresPEReview('protection');
    expect(r).not.toBeNull();
    expect(r!.required).toBe(true);
  });

  /**
   * 전 카테고리를 채우라고 요구하지 **않는다.** 나머지 카테고리(power ·
   * motor · lighting · renewable · substation · global · ai)에 검토가
   * 필요한지는 제품·전문가 판단이고, 코드 정리하다 정할 일이 아니다.
   *
   * 여기서 강제하는 것은 **이미 표에 요구가 적힌 것이 조회 키 때문에
   * 사라지지 않을 것** 하나다. 아크플래시·단락은 `required: true` 로
   * 적혀 있는데 category 로 물으면 안 나왔다 — 그건 정책이 아니라 결함이다.
   */
  it('표에 적힌 요구가 조회 키 때문에 사라지지 않는다', () => {
    const listedIds = REVIEW_REQUIREMENTS.map((r) => r.category);
    const lost: string[] = [];
    for (const entry of CALCULATOR_REGISTRY.values()) {
      if (!listedIds.includes(entry.id)) continue;
      const byId = requiresPEReview(entry.id);
      const byCategory = requiresPEReview(entry.category);
      // id 로 "필수" 인데 category 로 물으면 사라지는 경우를 잡는다.
      if (byId?.required && !byCategory?.required) {
        lost.push(`${entry.id}(${entry.category})`);
      }
    }
    expect(lost).toEqual([]);
  });

  it('모르는 키는 null 이다 — 없는 요구를 지어내지 않는다', () => {
    expect(requiresPEReview('없는카테고리')).toBeNull();
    expect(requiresPEReview('')).toBeNull();
  });

  /**
   * 이 표는 아직 **아무에게도 안 닿는다** — `requiresPEReview` 의 production
   * 호출처가 0 이다(2026-07-28 실측). `required: true` 가 어느 화면에도
   * 뜨지 않는다. 대장에 그렇게 적었다(docs/DORMANT_MANIFEST.md).
   *
   * 이 검사는 그 선언을 잠근다 — **배선하는 순간 깨지도록.** 깨지면
   * 대장에서 이 줄을 지우고, 어디에 어떻게 띄울지를 그때 정하면 된다.
   */
  it('아직 production 호출처가 없다 — 배선하면 대장을 고쳐라', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        if (['node_modules', '.next', '__tests__'].includes(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(full)) out.push(full);
      }
      return out;
    };
    const files = walk(join(__dirname, '..', '..', '..'));
    expect(files.length).toBeGreaterThan(100); // 훑기가 공회전이 아닌지

    const callers = files.filter((f) => {
      if (f.endsWith(join('constants', 'disclaimer.ts'))) return false; // 정의 자신
      return /requiresPEReview\s*\(/.test(readFileSync(f, 'utf8'));
    });
    expect(callers).toEqual([]);
  });

  /**
   * 안전 관련 표면은 PE 검토 필수다 — 표 자신의 기준선(**안전 관련 → PE /
   * 설계 검증 → 기사**)을 항목으로 못 박는다. 변이 실측에서 피뢰기 요구를
   * false 로 내려도 아무 검사도 안 깨졌다(2026-07-28) — 대칭 검사만으로는
   * 요구 자체가 사라지는 것을 못 잡는다.
   */
  it.each([
    ['arc-flash', '입사 에너지 → PPE 등급'],
    ['short-circuit', '차단 용량'],
    ['protection', '보호 협조'],
    ['grounding', '접지'],
    ['surge-arrester', '절연협조 — 정격이 낮으면 스스로 파괴, 높으면 보호 실패'],
    ['substation', '수전설비 — 유자격자 설계 영역'],
  ])('%s 는 PE 검토 필수다 (%s)', (key) => {
    const r = requiresPEReview(key);
    expect(r).not.toBeNull();
    expect(r!.required).toBe(true);
    expect(r!.reviewer).toMatch(/PE/);
  });

  it('필수 항목에는 사유와 검토자가 적혀 있다 — 근거 없는 요구는 무시된다', () => {
    for (const r of REVIEW_REQUIREMENTS.filter((x) => x.required)) {
      expect(r.reviewer.length).toBeGreaterThan(0);
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});
