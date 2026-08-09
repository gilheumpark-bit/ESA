import { NextRequest } from 'next/server';

import { POST } from '../route';

interface MockGeneration {
  text?: string;
  totalTokens?: number;
  error?: Error;
}

const generations: MockGeneration[] = [];
const openAIModelMock = jest.fn((_model: string) => ({}));
const createOpenAIMock = jest.fn((_options?: unknown) => openAIModelMock);
const streamTextMock = jest.fn((_options?: unknown) => {
  const generation = generations.shift();
  if (!generation) throw new Error('No mock generation queued');
  if (generation.error) throw generation.error;

  return {
    textStream: (async function* textStream() { yield generation.text ?? ''; })(),
    finishReason: Promise.resolve('stop'),
    usage: Promise.resolve({ totalTokens: generation.totalTokens ?? 20 }),
  };
});

jest.mock('ai', () => ({
  streamText: (options: unknown) => streamTextMock(options),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: (options?: unknown) => createOpenAIMock(options),
}));

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(),
}));

function chat(ip: string, message = '이 회로를 판단해줘'): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify({
      provider: 'openai',
      model: 'gpt-5.6-luna',
      apiKey: 'user-owned-key',
      language: 'ko',
      messages: [{ role: 'user', content: message }],
    }),
  });
}

async function bodyFor(ip: string): Promise<string> {
  const response = await POST(chat(ip));
  expect(response.status).toBe(200);
  return response.text();
}

describe('POST /api/chat 판단 책임 계약', () => {
  beforeEach(() => {
    generations.length = 0;
    streamTextMock.mockClear();
    createOpenAIMock.mockClear();
    openAIModelMock.mockClear();
  });

  it('정상 판단은 추가 호출 없이 그대로 통과한다', async () => {
    generations.push({ text: 'ESA 판단: VCB는 수전 회로의 차단 장치입니다.' });

    const body = await bodyFor('198.51.100.71');

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(body).toContain('ESA 판단: VCB는 수전 회로의 차단 장치입니다.');
    expect(body).toContain('"decisionContract":{"passed":true,"repairAttempted":false,"repairSucceeded":false');
  });

  it('책임 전가 답변만 같은 모델로 한 번 교정하고 교정본만 보낸다', async () => {
    generations.push(
      { text: '어느 쪽이 맞는지는 사용자가 직접 판단해 주세요.' },
      {
        text: 'ESA 잠정 판단: 현재 자료에서는 차단기 구성이 적합합니다. 근거: 제공된 표기와 연결 관계가 일치합니다. 결론 변경 조건: 원본 도면의 정격 표기가 다르게 확인되는 경우.',
      },
    );

    const body = await bodyFor('198.51.100.72');

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(openAIModelMock).toHaveBeenNthCalledWith(1, 'gpt-5.6-luna');
    expect(openAIModelMock).toHaveBeenNthCalledWith(2, 'gpt-5.6-luna');
    expect(body).not.toContain('사용자가 직접 판단해 주세요');
    expect(body).toContain('ESA 잠정 판단: 현재 자료에서는 차단기 구성이 적합합니다.');
    expect(body).toContain('"decisionContract":{"passed":true,"repairAttempted":true,"repairSucceeded":true');

    const repairOptions = streamTextMock.mock.calls[1]?.[0] as {
      instructions?: string;
      messages?: Array<{ content?: string }>;
    };
    expect(repairOptions.instructions).toContain('ESA 잠정 판단');
    expect(repairOptions.messages?.[0]?.content).toContain('<untrusted_answer>');
  });

  it('교정본도 위반하면 두 번에서 멈추고 원답과 교정본을 모두 숨긴다', async () => {
    generations.push(
      { text: '사용자가 판단해 주세요.' },
      { text: '필요한 값을 알려 주시면 판단하겠습니다.' },
    );

    const body = await bodyFor('198.51.100.73');

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(body).not.toContain('사용자가 판단해 주세요');
    expect(body).not.toContain('필요한 값을 알려 주시면');
    expect(body).toContain('판단 미완결');
    expect(body).toContain('"decisionContract":{"passed":false,"repairAttempted":true,"repairSucceeded":false');
  });

  it('교정 호출이 실패해도 전체 요청을 500으로 만들지 않고 안전 문구로 닫는다', async () => {
    generations.push(
      { text: '직접 선택해 주세요.' },
      { error: new Error('provider unavailable') },
    );

    const body = await bodyFor('198.51.100.74');

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(body).not.toContain('직접 선택해 주세요');
    expect(body).toContain('판단 미완결');
  });

  it('교정본을 선택한 뒤에도 기존 무출처 수치 필터를 적용한다', async () => {
    generations.push(
      { text: '사용자가 판단해 주세요.' },
      {
        text: 'ESA 잠정 판단: 정격은 75A가 적합합니다. 근거: 일반적인 구성입니다. 결론 변경 조건: 원본 명판이 다르게 확인되는 경우.',
      },
    );

    const body = await bodyFor('198.51.100.75');

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(body).not.toContain('75A');
    expect(body).toContain('[미확인]');
  });
});
