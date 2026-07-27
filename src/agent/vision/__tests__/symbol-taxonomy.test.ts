import { resolveSymbol, getSymbolMetadata, EXPANDED_SYMBOL_DB } from '../symbol-db';

/**
 * 계량·계측 기기가 전력변압기로 분류되면 도면 판정이 틀어진다.
 *
 * MOF(계기용변성기)는 한전 계량용으로 CT 와 PT 를 한 함에 넣은 계량기기다.
 * 전력을 변성해 부하에 보내는 전력변압기가 아니다. 그런데 별칭표에서
 * MOF 가 `transformer`(descriptionKo '전력 변압기') 에 붙어 있었다 —
 * 그 결과 도면의 MOF 가 `sld-team` 에서 `transformer-capacity` 계산 행과
 * `KEC 311.1 변압기 용량` 판정 행을 만들고, 표준도면 대조의
 * `maxCount: 3` 을 잠식했다. 소프트웨어 게이트는 전부 통과했다 —
 * 문자열로서는 아무 문제가 없기 때문이다(§2.10 도메인 진실).
 *
 * 판정은 구현 선택(어떤 type 문자열을 쓸지) 이 아니라 도메인 사실로 건다:
 * **계량·계측 기기의 category 는 power 가 아니다.**
 */
describe('심볼 분류 — 계량·계측 기기 vs 전력기기', () => {
  // 각 약어가 실제로 무엇인지. 이 표가 이 게이트의 도메인 오라클이다.
  const METERING = [
    ['MOF', '계기용변성기 — 계량용 CT+PT 조합기기'],
    ['CT', '변류기 — 대전류를 계측·보호용으로 변류'],
    ['PT', '계기용변압기 — 고전압을 계측용으로 강압'],
    ['VT', '계기용변압기 (IEC 선호 표기)'],
  ] as const;

  it.each(METERING)('%s 는 전력기기(category power)로 분류되지 않는다 — %s', (abbrev) => {
    const type = resolveSymbol(abbrev);
    const meta = getSymbolMetadata(type);
    expect(meta).toBeDefined();
    expect(meta!.category).not.toBe('power');
  });

  it.each(METERING)('%s 는 전력변압기 타입(transformer)으로 뭉개지지 않는다 — %s', (abbrev) => {
    expect(resolveSymbol(abbrev)).not.toBe('transformer');
  });

  // 반대 방향도 잠근다 — 진짜 전력변압기는 power 여야 한다.
  it.each([['TR'], ['XFMR'], ['DRY_TR'], ['MOLD_TR'], ['AUTO_TR']])(
    '%s 는 전력기기로 분류된다',
    (abbrev) => {
      const meta = getSymbolMetadata(resolveSymbol(abbrev));
      expect(meta).toBeDefined();
      expect(meta!.category).toBe('power');
    },
  );

  // 별칭이 두 항목에 중복되면 ALIAS_INDEX 는 뒤에 온 것으로 덮인다 —
  // KEC 조항 레지스트리에서 중복 정의가 조용히 틀린 값을 이기던 것과 같은 함정.
  it('같은 별칭이 두 심볼에 중복 등록되지 않는다', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const entry of EXPANDED_SYMBOL_DB) {
      for (const alias of entry.aliases) {
        const key = alias.toUpperCase();
        const prev = seen.get(key);
        if (prev && prev !== entry.type) dupes.push(`${alias}: ${prev} vs ${entry.type}`);
        seen.set(key, entry.type);
      }
    }
    expect(dupes).toEqual([]);
  });

  /**
   * LA(피뢰기)와 SPD(서지보호장치)는 다른 기기다.
   *
   * KEC 전문(시행 2026.1.5) 기준으로 근거 조항 계열부터 갈린다:
   *   피뢰기        341.13 피뢰기의 시설 · 341.14 피뢰기의 접지
   *                 451.3 피뢰기 설치장소 · 451.4 피뢰기의 선정
   *   서지보호장치  153.1.4 서지보호장치 시설 (내부피뢰시스템)
   *
   * 피뢰기는 고압·특고압측(22.9kV 수전 인입·154kV 모선)에, 서지보호장치는
   * 저압 분전반에 붙는다. 정격도 선정 방식도 다르다. 그런데 별칭표에서
   * 'LA' 가 `spd` 에 붙어 있어 수전 단선도의 피뢰기가 '서지 보호기 (SPD)'
   * 로 표기되고 있었다. 둘 다 category 는 protection 이라 분류 검사로는
   * 안 걸린다 — 동치 여부로 직접 건다.
   */
  it('LA(피뢰기)와 SPD(서지보호장치)는 다른 심볼로 분류된다', () => {
    const la = resolveSymbol('LA');
    const spd = resolveSymbol('SPD');
    expect(la).not.toBe(spd);
    expect(getSymbolMetadata(la)).toBeDefined();
    expect(getSymbolMetadata(spd)).toBeDefined();
    // 한국어 표기도 서로 섞이지 않아야 한다.
    expect(getSymbolMetadata(la)!.descriptionKo).toContain('피뢰기');
    expect(getSymbolMetadata(spd)!.descriptionKo).not.toContain('피뢰기');
  });

  // 수전 단선도의 1차 기기는 원본 문자열로 흘려보내지 않는다.
  // (미등록이면 resolveSymbol 이 입력을 그대로 돌려줘 역할 분류에서 빠진다)
  it.each([
    ['GCB', '가스차단기 — 154kV 계통 표준'],
    ['OCB', '유입차단기'],
    ['LA', '피뢰기'],
    ['ASS', '자동고장구분개폐기 — 22.9kV 수전 인입'],
    ['COS', '컷아웃스위치'],
    ['ZCT', '영상변류기 — 지락 검출'],
    ['GPT', '접지형계기용변압기'],
    ['MOF', '계기용변성기'],
  ])('%s 는 심볼 표에 등록돼 있다 — %s', (abbrev) => {
    expect(getSymbolMetadata(resolveSymbol(abbrev))).toBeDefined();
  });

  // 정규식·표가 죽으면 위 단언이 공허하게 통과한다.
  it('별칭 표가 비어 있지 않다', () => {
    expect(EXPANDED_SYMBOL_DB.length).toBeGreaterThanOrEqual(40);
    expect(resolveSymbol('VCB')).toBe('breaker_vcb');
  });
});
