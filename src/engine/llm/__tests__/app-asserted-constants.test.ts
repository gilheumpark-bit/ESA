import { filterLLMOutput } from '../output-filter';
import { APP_ASSERTED_CONSTANTS, findAssertedSource } from '../app-asserted-constants';

/**
 * 앱이 **이미 근거와 함께 내보내는 값**을 챗이 말할 수 있는가.
 *
 * 실측 2026-07-28(실공급자 라이브, gemini-3.6-flash): 현장에서 가장 자주
 * 묻는 질문들이 전부 빈칸으로 돌아왔다.
 *
 *   "밀폐공간 적정공기 기준?"   → "산소 [미확인] 이상 [미확인] 미만 …"
 *   "폭염작업 기준 온도?"       → "체감온도 [미확인]℃"
 *   "절연장갑 Class 00 은 몇 V?" → "AC 최대 [미확인]"
 *   "이 앱은 어느 표준을 쓰나?"  → "[미확인] 표준을 적용합니다"
 *
 * 같은 값을 `/field` 체크리스트는 조문과 함께 그대로 보여 준다. 앱은 말할
 * 용의가 있는데 **챗만 못 했다** — 보수적인 게 아니라 두 화면이 어긋난
 * 것이고, 모든 숫자가 `[미확인]` 이면 그 표시는 곧 무시된다(늑대 소년).
 *
 * 수리 방향이 중요하다: **"숫자를 통과시킨다" 가 아니라 "앱이 이미 가진
 * 근거를 붙여 준다"**. 그래서 아래 검사는 통과뿐 아니라 **각주가 붙는지**,
 * 그리고 **좁은 조건이 실제로 좁은지**를 함께 본다.
 */

const tool = [{ name: 'kec_lookup', result: {} }];

describe('앱 근거 상수 — 챗이 말할 수 있어야 한다', () => {
  it('목록이 비어 있지 않고 전부 출처를 갖는다', () => {
    expect(APP_ASSERTED_CONSTANTS.length).toBeGreaterThan(8);
    for (const c of APP_ASSERTED_CONSTANTS) {
      expect(c.source.length).toBeGreaterThan(5);
      expect(c.terms.length).toBeGreaterThan(0);
    }
  });

  describe('통과 — 대상 용어가 곁에 있을 때', () => {
    it.each([
      ['적정공기 산소', '적정공기는 산소 18% 이상 23.5% 미만입니다.', ['18', '23.5']],
      ['이산화탄소', '이산화탄소는 1.5% 미만이어야 합니다.', ['1.5']],
      ['일산화탄소', '일산화탄소(CO)는 30ppm 미만입니다.', ['30']],
      ['황화수소', '황화수소(H₂S)는 10ppm 미만입니다.', ['10']],
      ['폭염 체감온도', '폭염작업은 체감온도 31℃ 이상인 경우입니다.', ['31']],
      // 문장에 22.9kV 를 같이 적지 않는다 — 그 값은 목록에 없어 따로 막힌다
      // (실제 경로에서는 사용자 질문이 trustedInput 으로 들어가 통과한다).
      // 여기서 보려는 것은 0.9m 하나다.
      ['접근 한계거리', '접근 한계거리는 0.9m 입니다.', ['0.9']],
      ['절연장갑', '절연장갑 Class 00은 최대 500V 까지 사용합니다.', ['500']],
    ])('%s', (_이름, text, values) => {
      const r = filterLLMOutput(text, tool);
      for (const v of values) {
        expect(r.filtered).toContain(v);
      }
      expect(r.filtered).not.toContain('[미확인]');
    });

    it('통과시킨 값에는 근거 각주가 붙는다 — 조용히 통과시키지 않는다', () => {
      const r = filterLLMOutput('적정공기는 산소 18% 이상 23.5% 미만입니다.', tool);
      expect(r.filtered).toMatch(/앱이 근거와 함께 쓰는 값/);
      expect(r.filtered).toMatch(/제618조/);
    });
  });

  /**
   * **조건이 좁아야 한다.** 값만 맞고 대상이 다르면 통과하면 안 된다 —
   * 30ppm 은 일산화탄소 값이지 황화수소 값이 아니다. 목록을 "숫자 면제"로
   * 쓰면 정확히 이런 오답이 근거를 달고 나간다.
   */
  describe('차단 — 조건이 하나라도 어긋나면', () => {
    it('값은 맞지만 대상이 다르면 막는다 (황화수소 30ppm)', () => {
      const r = filterLLMOutput('황화수소는 30ppm 미만이어야 합니다.', tool);
      expect(r.filtered).toContain('[미확인]');
    });

    it('목록에 없는 값은 막는다 (산소 25%)', () => {
      const r = filterLLMOutput('적정공기는 산소 25% 이상입니다.', tool);
      expect(r.filtered).toContain('[미확인]');
    });

    it('단위가 다르면 막는다 (체감온도 31%)', () => {
      const r = filterLLMOutput('폭염작업은 체감온도 31% 이상입니다.', tool);
      expect(r.filtered).toContain('[미확인]');
    });

    it('용어가 멀면 막는다', () => {
      const far = '산소 농도에 대해 설명합니다.' + '가'.repeat(200) + ' 그 값은 18% 입니다.';
      const r = filterLLMOutput(far, tool);
      expect(r.filtered).toContain('[미확인]');
    });

    it('옛 값(22.9kV 0.6m)은 통과하지 않는다 — 목록이 정정본만 담는다', () => {
      const r = filterLLMOutput('22.9kV 접근 한계거리는 0.6m 입니다.', tool);
      expect(r.filtered).toContain('[미확인]');
    });
  });

  describe('조회 함수 단위', () => {
    it('용어가 있으면 출처를 준다', () => {
      expect(findAssertedSource('18', '%', '산소 18% 이상')).toMatch(/제618조/);
    });

    it('용어가 없으면 null', () => {
      expect(findAssertedSource('18', '%', '수분 함량은 18% 입니다')).toBeNull();
    });

    it('쉼표·공백 표기를 흡수한다', () => {
      expect(findAssertedSource('1,000', 'V', '절연장갑 Class 0')).not.toBeNull();
    });
  });

  /**
   * **등급이 갈리는 값은 등급을 확인한다.**
   *
   * 앞서 `terms` 에 `'절연장갑'` 이 들어 있어 그 낱말만 있으면 등급과 무관하게
   * 통과했다(2026-07-28 독립 심사 도메인 좌석 실행 실측). Class 4 는 36,000V
   * 인데 "Class 4 절연장갑 최대 500V" 가 **IEC 60903 출처를 달고** 나갔다 —
   * 22.9kV 작업자에게 1,000V 장갑을 승인하는 경로다. 필터가 막으라고 있는
   * 바로 그것을 필터가 만들어 주고 있었다.
   */
  describe('절연장갑 — 등급과 전압이 맞을 때만 출처를 준다', () => {
    it.each([
      ['500', 'Class 4 절연장갑의 최대 사용전압은 500V 입니다'],
      ['1000', '22.9kV 활선용 절연 장갑 정격 1000V'],
      ['1000', 'Class 00 절연장갑 최대 사용전압 1000V'],
      ['36000', 'Class 1 절연장갑 36000V'],
    ])('어긋난 짝 %sV 는 막힌다 — %s', (v, ctx) => {
      expect(findAssertedSource(v, 'V', ctx)).toBeNull();
    });

    it.each([
      ['500', 'Class 00 절연장갑은 500V 까지'],
      ['1000', 'Class 0 절연장갑 1000V'],
      ['7500', 'Class 1 절연장갑 7500V'],
      ['17000', 'Class 2 절연장갑 17000V'],
      ['26500', 'Class 3 절연장갑 26500V'],
      ['36000', 'Class 4 절연장갑 36000V'],
    ])('맞는 짝 %sV 는 통과한다 — %s', (v, ctx) => {
      expect(findAssertedSource(v, 'V', ctx)).toMatch(/IEC 60903/);
    });

    /** `Class 0` 이 `Class 00` 의 부분 문자열이라 경계 없이 보면 겹친다. */
    it('Class 0 이 Class 00 문장에 걸리지 않는다', () => {
      expect(findAssertedSource('1000', 'V', 'Class 00 절연장갑')).toBeNull();
      expect(findAssertedSource('500', 'V', 'Class 00 절연장갑')).not.toBeNull();
    });

    /** 등급을 안 밝힌 전압은 통과시키지 않는다 — 현장에서 어느 장갑인지 모른다. */
    it('등급 없는 "절연장갑 500V" 는 막힌다', () => {
      expect(findAssertedSource('500', 'V', '절연장갑 최대 사용전압 500V')).toBeNull();
    });
  });

  /** 무발명 규율 자체가 살아 있는지 — 이 수리가 필터를 무력화하지 않았는지. */
  it('근거 없는 일반 수치는 여전히 막힌다', () => {
    const r = filterLLMOutput('배전반 수명은 보통 15년 정도입니다.', tool);
    expect(r.filtered).toContain('[미확인]');
    expect(r.passed).toBe(false);
  });
});
