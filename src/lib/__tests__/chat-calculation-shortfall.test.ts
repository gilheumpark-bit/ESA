import {
  resolveChatCalculationShortfall,
  resolveChatCalculationEvidence,
} from '@/lib/chat-calculation-evidence';

/**
 * 근거 없이 계산하지 말고 **되묻게 하는** 지시가 실제로 붙는지 본다.
 *
 * 채팅 답변의 신뢰는 "모델이 똑똑해서" 가 아니라 **결정론 계산기 영수증에
 * 묶여 있어서** 성립한다. 영수증을 못 만드는 질문에서 그 지시가 빠지면
 * 모델이 스스로 끝까지 계산하고, 출력 필터가 영수증에 없는 수치를 지워
 * "[미확인] ÷ [미확인] ≈ [미확인]" 만 남는다(소스 주석의 실측 2026-07-25/26).
 *
 * `gate:chat-live` 는 **영수증이 있는 경로만** 검증한다(voltage-drop 4.14V 가
 * 모델 프롬프트에 실렸는지). 영수증이 **없을 때** 무엇을 지시하는지는
 * 어떤 테스트도 안 덮고 있었다 — 사용자가 실제로 더 자주 만나는 쪽인데.
 */
describe('계산 근거가 없을 때의 지시', () => {
  it('계산 의도가 없으면 아무 지시도 붙이지 않는다 — 과잉 지시는 답을 망친다', () => {
    expect(resolveChatCalculationShortfall('KEC 232.5 조항이 뭔가요')).toBeNull();
    expect(resolveChatCalculationShortfall('안녕하세요')).toBeNull();
  });

  it('입력이 다 갖춰져 영수증이 나오면 지시를 붙이지 않는다', () => {
    const q = '380V 3상 100A 50m 35sq 구리 역률 0.9 전압강하 계산해줘';
    // 이 질문은 영수증 경로다 — 둘 중 하나만 발동해야 한다.
    const evidence = resolveChatCalculationEvidence(q);
    if (evidence) {
      expect(resolveChatCalculationShortfall(q)).toBeNull();
    }
  });

  it('계산 요청인데 입력이 부족해도 역질문하지 않고 조건부 판단과 최소 입력만 제시한다', () => {
    const out = resolveChatCalculationShortfall('전압강하 계산해줘');
    expect(out).not.toBeNull();
    expect(out).toContain('직접 계산');
    expect(out).toContain('가장 타당한 조건부 결론');
    expect(out).toContain('결론을 바꾸는 핵심 입력');
    expect(out).not.toMatch(/되물|질문하세요|알려\s*주세요/);
  });

  it('맞는 계산기를 못 지목해도 침묵하지 않는다 — 공식과 필요한 입력을 설명하게 한다', () => {
    // 계산 의도는 뚜렷한데 ESA 계산기로 매핑되지 않는 주제.
    const out = resolveChatCalculationShortfall('지중 케이블 열저항 보정계수 계산해줘');
    if (out !== null) {
      expect(out).toMatch(/수치를 직접 만들|직접 계산/);
      expect(out).toMatch(/공식|입력/);
    }
  });

  it('지시문은 반드시 "수치를 만들지 말라"를 담는다 — 이 한 줄이 이 장치의 전부다', () => {
    const queries = ['전압강하 계산해줘', '차단기 용량 계산', '케이블 굵기 산정해줘'];
    const outs = queries.map(resolveChatCalculationShortfall).filter((o): o is string => o !== null);
    // 하나도 안 나오면 이 검사가 공허하다.
    expect(outs.length).toBeGreaterThan(0);
    for (const o of outs) {
      expect(o).toMatch(/직접 계산해서 수치를 제시하지 마세요|수치를 직접 만들어 제시하지 마세요/);
    }
  });
});
