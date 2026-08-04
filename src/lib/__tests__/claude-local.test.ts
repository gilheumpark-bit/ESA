import { extractTurnText, maskClaudeEmail } from '../claude-local';

describe('maskClaudeEmail', () => {
  it('계정 원문을 남기지 않는다', () => {
    expect(maskClaudeEmail('engineer@example.com')).toBe('e***@example.com');
    expect(maskClaudeEmail(null)).toBeNull();
    expect(maskClaudeEmail(undefined)).toBeNull();
    expect(maskClaudeEmail('broken')).toBe('***');
  });
});

describe('extractTurnText', () => {
  it('CLI 봉투에서 결과 본문만 꺼낸다', () => {
    const envelope = JSON.stringify({
      subtype: 'success',
      is_error: false,
      result: '{"symbols":[]}',
    });
    expect(extractTurnText(envelope)).toBe('{"symbols":[]}');
  });

  it('코드펜스를 벗긴다', () => {
    const envelope = JSON.stringify({
      is_error: false,
      result: '```json\n{"symbols":[{"id":"S1"}]}\n```',
    });
    expect(extractTurnText(envelope)).toBe('{"symbols":[{"id":"S1"}]}');
  });

  it('CLI가 오류를 표시하면 성공으로 넘기지 않는다', () => {
    // 조용히 빈 결과로 넘기면 역할 실패가 판독 성공으로 위장된다.
    const envelope = JSON.stringify({ is_error: true, result: 'rate limited' });
    expect(() => extractTurnText(envelope)).toThrow('CLAUDE_LOCAL_TURN_FAILED');
  });

  it('빈 응답을 성공으로 받지 않는다', () => {
    expect(() => extractTurnText(JSON.stringify({ is_error: false, result: '   ' })))
      .toThrow('CLAUDE_LOCAL_EMPTY_RESPONSE');
  });

  it('봉투가 JSON이 아니면 거부한다', () => {
    expect(() => extractTurnText('not json')).toThrow('CLAUDE_LOCAL_MALFORMED_RESPONSE');
    expect(() => extractTurnText('{oops')).toThrow('CLAUDE_LOCAL_MALFORMED_RESPONSE');
  });

  it('result 필드가 없으면 빈 응답으로 닫는다', () => {
    expect(() => extractTurnText(JSON.stringify({ is_error: false })))
      .toThrow('CLAUDE_LOCAL_EMPTY_RESPONSE');
  });
});
