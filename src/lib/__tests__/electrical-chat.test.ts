import {
  ELECTRICAL_CHAT_MAX_TOKENS,
  buildElectricalAssistantPrompt,
} from '../electrical-chat';

describe('electrical chat calibration contract', () => {
  test('reserves enough output budget for reasoning-capable Gemini models', () => {
    expect(ELECTRICAL_CHAT_MAX_TOKENS).toBeGreaterThanOrEqual(4096);
  });

  test('requires evidence labels, missing-input handling, and complete answers', () => {
    const prompt = buildElectricalAssistantPrompt('ko');

    expect(prompt).toContain('[확인]');
    expect(prompt).toContain('[추정]');
    expect(prompt).toContain('[미확인]');
    expect(prompt).toContain('정확한 조항 번호');
    expect(prompt).toContain('누락 입력');
    expect(prompt).toContain('문장 중간에서 끝내지');
    expect(prompt).toContain('700자');
    expect(prompt).toContain('이미지가 제공되지');
    expect(prompt).toContain('상류·하류 장치의 종류나 배치 순서를 단정하지');
    expect(prompt).toContain('일반적인 가능성');
    expect(prompt).toContain('차단 범위나 동작 차단기');
    expect(prompt).toContain('BUS-TIE OPEN');
    expect(prompt).toContain('정격전압에서 계통 공칭전압을 절대로 역추정하지');
    expect(prompt).toContain('기호식, 누락 입력');
    expect(prompt).toContain('Z_pu');
    expect(prompt).toContain('[추정] 없음');
    expect(prompt).toContain('25.8kV→22.9kV');
    expect(prompt).toContain('판정 보류');
    expect(prompt).toContain('로컬 태그');
    expect(prompt).not.toContain('현재 사용자 질문');
  });

  test('applies the selected response language to the model contract', () => {
    expect(buildElectricalAssistantPrompt('en'))
      .toContain('Answer in English');
  });
});
