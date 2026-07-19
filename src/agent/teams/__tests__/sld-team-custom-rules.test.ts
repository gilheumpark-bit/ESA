/**
 * sld-team × 사내 규정 — 통합 (실제 DXF 픽스처 → 팀 실행 → 리포트 행)
 *
 * 엔진 단위 테스트가 아니라 팀 경로다: 룰셋이 TeamInput으로 들어가
 * StandardEntry/ViolationEntry로 나오는 배선 자체를 검증한다.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { executeSLDTeam } from '../sld-team';
import { parseCustomRuleSet } from '@/engine/standards/custom-rules';
import type { TeamInput } from '../types';

function dxfInput(fixtureId: string, extra?: Partial<TeamInput>): TeamInput {
  const dxf = readFileSync(
    join(process.cwd(), 'fixtures', 'drawings', 'synthetic', `${fixtureId}.dxf`),
  );
  const buf = new ArrayBuffer(dxf.byteLength);
  new Uint8Array(buf).set(dxf);
  return {
    sessionId: 'test-custom-rules',
    classification: 'sld_dxf',
    fileBuffer: buf,
    fileName: `${fixtureId}.dxf`,
    mimeType: 'application/dxf',
    ...extra,
  };
}

function exampleRuleSet() {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), 'fixtures', 'rules', 'example-company-rules.json'), 'utf8'),
  );
  const lint = parseCustomRuleSet(raw);
  if (!lint.ok || !lint.ruleSet) throw new Error(`예시 룰셋이 무효: ${lint.errors.join(', ')}`);
  return lint.ruleSet;
}

describe('sld-team × 사내 규정', () => {
  it('예시 룰셋 파일 자체가 린트를 통과한다 (배포물 자기 검증)', () => {
    expect(() => exampleRuleSet()).not.toThrow();
  });

  it('룰셋 미첨부면 사내규정 행이 없다 (기존 경로 무변화)', async () => {
    const result = await executeSLDTeam(dxfInput('L1-02-text-spec'));
    expect(result.success).toBe(true);
    expect((result.standards ?? []).filter((s) => s.standard === '사내규정')).toHaveLength(0);
  });

  it('룰셋 첨부 시 KEC 행과 나란히 사내규정 행이 생긴다', async () => {
    const result = await executeSLDTeam(
      dxfInput('L1-02-text-spec', { customRuleSet: exampleRuleSet() }),
    );
    expect(result.success).toBe(true);

    const stds = result.standards ?? [];
    const kec = stds.filter((s) => s.standard === 'KEC');
    const custom = stds.filter((s) => s.standard === '사내규정');
    expect(kec.length).toBeGreaterThan(0);
    expect(custom.length).toBeGreaterThan(0);

    // global 조항: L1-02엔 변압기 1대 → PASS
    const g = custom.find((s) => s.clause === 'EX-1.1');
    expect(g?.judgment).toBe('PASS');

    // component 조항: TR-1 500kVA ≥ 500 → PASS (도면 정격이 실제로 파싱돼 흐른다)
    const tr = custom.find((s) => s.clause === 'EX-4.1' && s.note?.includes('TR-1'));
    expect(tr?.judgment).toBe('PASS');

    // connection 조항: L1-02 결선엔 전류 표기 없음 → VD 미계산 → HOLD (거짓 판정 금지)
    const vd = custom.filter((s) => s.clause === 'EX-3.2.1');
    expect(vd.length).toBeGreaterThan(0);
    expect(vd.every((s) => s.judgment === 'HOLD')).toBe(true);
    expect(vd[0].note).toMatch(/voltageDropPercent/);
  });

  it('사내 기준 위반이 실제 FAIL + 위반 항목을 만든다', async () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'fixtures', 'rules', 'example-company-rules.json'), 'utf8'),
    );
    // 예시 기준을 강화: 변압기 최소 1000kVA — L1-02의 TR-1(500kVA)이 위반이 되도록
    raw.articles[1].conditions[0].value = 1000;
    const lint = parseCustomRuleSet(raw);
    expect(lint.ok).toBe(true);

    const result = await executeSLDTeam(
      dxfInput('L1-02-text-spec', { customRuleSet: lint.ruleSet }),
    );
    const custom = (result.standards ?? []).filter((s) => s.standard === '사내규정');
    const tr = custom.find((s) => s.clause === 'EX-4.1' && s.note?.includes('TR-1'));
    expect(tr?.judgment).toBe('FAIL');

    const vio = (result.violations ?? []).find((v) => v.standardRef?.includes('EX-4.1'));
    expect(vio).toBeDefined();
    expect(vio?.severity).toBe('major');
    expect(vio?.description).toMatch(/ratingKva=500/);
  });
});
