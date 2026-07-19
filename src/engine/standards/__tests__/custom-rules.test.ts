/**
 * 사내 규정(커스텀 룰셋) — 린트·평가 검증
 *
 * 판정 시맨틱이 registry 범용 경로와 같아야 하고(자리표시자 HOLD·누락 HOLD·
 * 위반 FAIL), 무효 룰셋은 조용히 버려지지 않아야 한다.
 */

import {
  parseCustomRuleSet,
  evaluateCustomRules,
  type CustomRuleSet,
  type RuleEvalExtraction,
} from '../custom-rules';

// ── 헬퍼 ──

function validRaw(): Record<string, unknown> {
  return {
    name: '테스트 사내기준',
    version: '2026-01',
    basedOn: 'KEC 2021',
    articles: [
      {
        article: 'VD-1',
        title: '간선 전압강하 사내 한도',
        scope: 'connection',
        severity: 'critical',
        remedy: '케이블 굵기 한 단계 상향',
        conditions: [
          { param: 'voltageDropPercent', operator: '<=', value: 2.5, unit: '%', result: 'PASS', note: 'KEC 3%보다 엄격' },
        ],
      },
      {
        article: 'TR-CAP',
        title: '변압기 최소 용량',
        scope: 'component',
        appliesTo: ['transformer'],
        conditions: [
          { param: 'ratingKva', operator: '>=', value: 500, unit: 'kVA', result: 'PASS', note: '' },
        ],
      },
      {
        article: 'G-1',
        title: '변압기 존재',
        scope: 'global',
        conditions: [
          { param: 'transformerCount', operator: '>=', value: 1, unit: '대', result: 'PASS', note: '' },
        ],
      },
    ],
  };
}

function parsed(): CustomRuleSet {
  const r = parseCustomRuleSet(validRaw());
  if (!r.ok || !r.ruleSet) throw new Error(`fixture ruleset invalid: ${r.errors.join(', ')}`);
  return r.ruleSet;
}

const EXTRACTION: RuleEvalExtraction = {
  components: [
    { id: 'c1', type: 'transformer', label: 'TR-1', rating: '1000kVA' },
    { id: 'c2', type: 'transformer', label: 'TR-2', rating: '300kVA' },
    { id: 'c3', type: 'breaker', label: 'ACB-1', rating: '800A' },
    { id: 'c4', type: 'motor', label: 'M-1' },
  ],
  connections: [
    { from: 'c1', to: 'c3', lengthM: 20, voltageDropPercent: 1.8 },
    { from: 'c3', to: 'c4', lengthM: 45, voltageDropPercent: 3.1 },
    { from: 'c2', to: 'c4', lengthM: 10 }, // VD 미계산 — HOLD여야
  ],
};

// ═══════════════════════════════════════════════════════════════
// 린트
// ═══════════════════════════════════════════════════════════════

describe('린트 — 오류(로드 거부)', () => {
  it('유효 룰셋은 ok=true + summary', () => {
    const r = parseCustomRuleSet(validRaw());
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.summary).toEqual({
      articles: 3,
      conditions: 3,
      byScope: { connection: 1, component: 1, global: 1 },
    });
    expect(r.ruleSet?.standardLabel).toBe('사내규정'); // 기본값
  });

  it.each([
    ['루트 비객체', 'json은 객체여야'],
    [null, '객체여야'],
    [[], '객체여야'],
  ])('루트가 객체가 아니면 거부 (%p)', (raw) => {
    const r = parseCustomRuleSet(raw);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('name/version 누락 → 오류', () => {
    const raw = validRaw();
    delete raw.name;
    delete raw.version;
    const r = parseCustomRuleSet(raw);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/name/);
    expect(r.errors.join(' ')).toMatch(/version/);
  });

  it('article 중복 → 오류', () => {
    const raw = validRaw();
    (raw.articles as Array<Record<string, unknown>>).push({
      ...(raw.articles as Array<Record<string, unknown>>)[0],
    });
    const r = parseCustomRuleSet(raw);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/중복/);
  });

  it('무효 operator·비유한 value·무효 result → 각각 오류', () => {
    const raw = validRaw();
    (raw.articles as Array<Record<string, unknown>>)[0] = {
      article: 'BAD-1',
      title: '나쁜 조항',
      scope: 'global',
      conditions: [
        { param: 'x', operator: '!=', value: 1, unit: '', result: 'PASS', note: '' },
        { param: 'y', operator: '<=', value: Infinity, unit: '', result: 'PASS', note: '' },
        { param: 'z', operator: '<=', value: 1, unit: '', result: 'MAYBE', note: '' },
      ],
    };
    const r = parseCustomRuleSet(raw);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/operator/);
    expect(r.errors.join(' ')).toMatch(/value/);
    expect(r.errors.join(' ')).toMatch(/result/);
  });

  it('조항 수 한도 초과 → 거부', () => {
    const raw = validRaw();
    const proto = (raw.articles as Array<Record<string, unknown>>)[2];
    raw.articles = Array.from({ length: 201 }, (_, i) => ({ ...proto, article: `G-${i}` }));
    const r = parseCustomRuleSet(raw);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/한도/);
  });

  it('scope 무효 → 오류', () => {
    const raw = validRaw();
    (raw.articles as Array<Record<string, unknown>>)[0].scope = 'universe';
    const r = parseCustomRuleSet(raw);
    expect(r.ok).toBe(false);
  });
});

describe('린트 — 경고(로드하되 고지)', () => {
  it('자리표시자 임계(0+부등호) → 경고', () => {
    const raw = validRaw();
    ((raw.articles as Array<Record<string, unknown>>)[2].conditions as Array<Record<string, unknown>>)[0].value = 0;
    const r = parseCustomRuleSet(raw);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/자리표시자/);
  });

  it('사전 밖 param → 경고 (오류 아님)', () => {
    const raw = validRaw();
    ((raw.articles as Array<Record<string, unknown>>)[0].conditions as Array<Record<string, unknown>>)[0].param = 'mysteryParam';
    const r = parseCustomRuleSet(raw);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/mysteryParam/);
  });

  it('component 조항에 appliesTo 없음 → 경고', () => {
    const raw = validRaw();
    delete (raw.articles as Array<Record<string, unknown>>)[1].appliesTo;
    const r = parseCustomRuleSet(raw);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/appliesTo/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 평가
// ═══════════════════════════════════════════════════════════════

describe('평가 — connection scope', () => {
  it('VD 2.5% 한도: 1.8%→PASS · 3.1%→FAIL · 미계산→HOLD', () => {
    const findings = evaluateCustomRules(parsed(), EXTRACTION).filter((f) => f.article === 'VD-1');
    expect(findings).toHaveLength(3);

    const byTarget = new Map(findings.map((f) => [f.target, f]));
    expect(byTarget.get('c1→c3')?.judgment).toBe('PASS');
    expect(byTarget.get('c3→c4')?.judgment).toBe('FAIL');
    expect(byTarget.get('c3→c4')?.severity).toBe('critical');
    expect(byTarget.get('c3→c4')?.remedy).toBe('케이블 굵기 한 단계 상향');
    expect(byTarget.get('c2→c4')?.judgment).toBe('HOLD');
    expect(byTarget.get('c2→c4')?.note).toMatch(/voltageDropPercent/); // 무엇이 없는지 명시
  });
});

describe('평가 — component scope', () => {
  it('appliesTo 필터: 변압기만 판정, 1000kVA→PASS · 300kVA→FAIL · 브레이커 제외', () => {
    const findings = evaluateCustomRules(parsed(), EXTRACTION).filter((f) => f.article === 'TR-CAP');
    expect(findings).toHaveLength(2); // TR-1, TR-2만 — ACB/M 제외
    const byTarget = new Map(findings.map((f) => [f.target, f]));
    expect(byTarget.get('TR-1')?.judgment).toBe('PASS');
    expect(byTarget.get('TR-2')?.judgment).toBe('FAIL');
  });

  it('정격 없는 컴포넌트는 HOLD (지어내지 않는다)', () => {
    const rs = parsed();
    rs.articles[1].appliesTo = ['motor']; // M-1은 rating 없음
    const findings = evaluateCustomRules(rs, EXTRACTION).filter((f) => f.article === 'TR-CAP');
    expect(findings).toHaveLength(1);
    expect(findings[0].judgment).toBe('HOLD');
    expect(findings[0].note).toMatch(/ratingKva/);
  });

  it('대상 0개면 스킵이 아니라 HOLD로 보고한다', () => {
    const rs = parsed();
    rs.articles[1].appliesTo = ['ups'];
    const findings = evaluateCustomRules(rs, EXTRACTION).filter((f) => f.article === 'TR-CAP');
    expect(findings).toHaveLength(1);
    expect(findings[0].judgment).toBe('HOLD');
    expect(findings[0].target).toBe('(대상 없음)');
  });

  it('MVA 정격은 kVA로 환산된다', () => {
    const rs = parsed();
    const extraction: RuleEvalExtraction = {
      components: [{ id: 'c1', type: 'transformer', label: 'TR-BIG', rating: '2.5MVA' }],
      connections: [],
    };
    const findings = evaluateCustomRules(rs, extraction).filter((f) => f.article === 'TR-CAP');
    expect(findings[0].judgment).toBe('PASS'); // 2500 >= 500
  });
});

describe('평가 — global scope', () => {
  it('집계 param으로 판정한다 (transformerCount)', () => {
    const findings = evaluateCustomRules(parsed(), EXTRACTION).filter((f) => f.article === 'G-1');
    expect(findings).toHaveLength(1);
    expect(findings[0].judgment).toBe('PASS'); // 변압기 2대 >= 1
    expect(findings[0].target).toBe('(도면 전체)');
  });

  it('사용자 params가 사전 밖 param을 채울 수 있다', () => {
    const rs = parsed();
    rs.articles[2].conditions = [
      { param: 'designMarginPercent', operator: '>=', value: 20, unit: '%', result: 'PASS', note: '' },
    ];
    const noParam = evaluateCustomRules(rs, EXTRACTION);
    expect(noParam.find((f) => f.article === 'G-1')?.judgment).toBe('HOLD');

    const withParam = evaluateCustomRules(rs, { ...EXTRACTION, userParams: { designMarginPercent: 25 } });
    expect(withParam.find((f) => f.article === 'G-1')?.judgment).toBe('PASS');
  });

  it('집계가 사용자 params를 덮는다 (집계가 정본)', () => {
    const findings = evaluateCustomRules(parsed(), {
      ...EXTRACTION,
      userParams: { transformerCount: 0 }, // 거짓 주입 시도
    });
    expect(findings.find((f) => f.article === 'G-1')?.judgment).toBe('PASS'); // 실집계 2가 이김
  });
});

describe('평가 — 안전·경계', () => {
  it('자리표시자 조항은 평가 시 HOLD', () => {
    const rs = parsed();
    rs.articles[2].conditions = [
      { param: 'transformerCount', operator: '>=', value: 0, unit: '', result: 'PASS', note: '원문 규칙' },
    ];
    const f = evaluateCustomRules(rs, EXTRACTION).find((x) => x.article === 'G-1');
    expect(f?.judgment).toBe('HOLD');
    expect(f?.note).toMatch(/자리표시자/);
  });

  it('"__proto__" param은 프로토타입을 줍지 않고 HOLD', () => {
    const rs = parsed();
    rs.articles[2].conditions = [
      { param: '__proto__', operator: '>=', value: 1, unit: '', result: 'PASS', note: '' },
    ];
    const f = evaluateCustomRules(rs, EXTRACTION).find((x) => x.article === 'G-1');
    expect(f?.judgment).toBe('HOLD');
  });

  it('결선 0개 도면에서 connection 조항은 HOLD로 보고', () => {
    const findings = evaluateCustomRules(parsed(), { components: EXTRACTION.components, connections: [] });
    const f = findings.find((x) => x.article === 'VD-1');
    expect(f?.judgment).toBe('HOLD');
    expect(f?.target).toBe('(결선 없음)');
  });
});
