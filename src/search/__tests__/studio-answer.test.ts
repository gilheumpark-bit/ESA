import { buildStudioAnswer } from '@/search/studio-answer';

describe('buildStudioAnswer', () => {
  test('uses ranked documents when the agent found no supporting sources', () => {
    const answer = buildStudioAnswer(
      { answer: '[한국 전기설비 전문가] 관련 정보를 찾지 못했습니다.', sourceCount: 0 },
      [{ title: '진공차단기', excerpt: '진공을 소호 매질로 사용하는 차단기입니다.' }],
    );

    expect(answer).toContain('진공차단기');
    expect(answer).toContain('진공을 소호 매질로 사용하는 차단기입니다.');
    expect(answer).not.toContain('관련 정보를 찾지 못했습니다');
  });

  test('keeps the agent answer when it has supporting sources', () => {
    expect(buildStudioAnswer(
      { answer: '근거가 연결된 답변', sourceCount: 1 },
      [{ title: '대체 문서', excerpt: '대체 내용' }],
    )).toBe('근거가 연결된 답변');
  });

  test('returns null when neither source-backed answer nor documents exist', () => {
    expect(buildStudioAnswer(
      { answer: '관련 정보를 찾지 못했습니다.', sourceCount: 0 },
      [],
    )).toBeNull();
  });

  test('falls back to document body when excerpt is absent', () => {
    expect(buildStudioAnswer(null, [{
      title: '본문 전용 문서',
      body: '검색 문서 본문',
    }])).toContain('검색 문서 본문');
  });
});
