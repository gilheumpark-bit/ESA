import { NextRequest } from 'next/server';

import { POST } from '../route';

/**
 * 토큰 예산은 **배포자의 청구서**를 지키는 장치다. 그 목적에서 두 가지가
 * 어긋나 있었다.
 *
 * ① **자기 키를 넣은 사용자도 막혔다.** 예산 검사가 키 해석보다 먼저 돌아
 *    BYOK 요청도 500K 에서 429 를 받았고, 그때 나가는 안내가
 *    `"Provide your own API key to continue"` 였다. 이미 넣은 키를 넣으라는
 *    말이라 사용자가 할 수 있는 일이 없다. 자기 돈으로 부르는 요청을
 *    우리가 막을 이유가 없다.
 *
 * ② **출력을 세지 않았다.** 계량은 입력 길이뿐인데 비싼 쪽은 출력이고,
 *    `maxTokens` 는 요청이 정한다(상한 8192). `"안녕"`(≈2 토큰)으로 8192
 *    토큰을 뽑으면 계량 2 · 청구서 8194 — 500K 예산이 실제로는 20M 토큰을
 *    허용한다.
 *
 * 출력을 상한으로 잡으면 이번엔 반대로 샌다: 4096 을 예약하고 300 을 쓴
 * 사용자가 하루 122 번에 막힌다. 그래서 **예약 후 정산**한다.
 */

/** 공급자가 보고할 실사용 토큰 — 검사마다 바꾼다. */
let reportedUsage = 100;
const streamTextMock = jest.fn((_options?: unknown) => ({
  textStream: (async function* textStream() { yield 'ok'; })(),
  finishReason: Promise.resolve('stop'),
  usage: Promise.resolve({ totalTokens: reportedUsage }),
}));

jest.mock('ai', () => ({
  streamText: (options: unknown) => streamTextMock(options),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => () => ({}),
}));

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(),
}));

/** 한 요청이 예산을 거의 다 먹도록 — 반복 없이 경계를 친다. */
const HUGE = 'x'.repeat(4 * 400_000); // ≈400K 토큰

function chat(opts: {
  ip: string;
  apiKey?: string;
  message?: string;
  maxTokens?: number;
}): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      'X-Forwarded-For': opts.ip,
    },
    body: JSON.stringify({
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      apiKey: opts.apiKey,
      maxTokens: opts.maxTokens,
      messages: [{ role: 'user', content: opts.message ?? 'hello' }],
    }),
  });
}

/** 스트림을 끝까지 읽어야 생성 완료 훅(정산)이 돈다. */
async function drain(res: Response): Promise<void> {
  await res.text();
}

let ipSeq = 0;
/** IP 당 계량이므로 검사끼리 섞이지 않게 매번 새 IP 를 쓴다. */
const freshIp = () => `10.9.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

describe('챗 토큰 예산 — 지키는 것은 배포자의 지갑이다', () => {
  const original = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'server-side-key';
    // 스푸핑 가능한 헤더는 기본적으로 신뢰하지 않는다. 프록시 뒤 배포에서만
    // 이 변수로 켠다 — 안 켜면 모든 익명 요청이 한 바구니를 나눠 쓴다.
    process.env.TRUSTED_CLIENT_IP_HEADER = 'x-forwarded-for';
    reportedUsage = 100;
  });

  afterAll(() => {
    if (original === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = original;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
  });

  /**
   * 계량 단위가 무엇인지 못 박는다. 신뢰 헤더를 지정하지 않으면 IP 를
   * 분간할 수 없어 **모든 익명 요청이 한 바구니**를 쓴다 — 과차단 쪽이라
   * 안전하지만, 프록시 뒤 배포에서 그대로 두면 사용자끼리 서로의 예산을
   * 깎아 먹는다(RUNBOOK 에 적을 설정 사항이지 코드 결함이 아니다).
   */
  it('신뢰 헤더가 없으면 IP 를 분간하지 않는다', async () => {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    const a = await POST(chat({ ip: '10.8.0.1', message: 'hi', maxTokens: 8192 }));
    const left1 = Number(a.headers.get('X-Token-Budget-Remaining'));
    await drain(a);
    const b = await POST(chat({ ip: '10.8.0.2', message: 'hi', maxTokens: 8192 }));
    const left2 = Number(b.headers.get('X-Token-Budget-Remaining'));
    await drain(b);
    expect(left2).toBeLessThan(left1);
  });

  it('서버 키로 예산을 넘기면 429 로 막는다', async () => {
    const ip = freshIp();
    reportedUsage = 400_000; // 정산해도 실제로 그만큼 썼다
    await drain(await POST(chat({ ip, message: HUGE })));
    const res = await POST(chat({ ip, message: HUGE }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('ESVA-3014');
  });

  /** 위 검사가 라우트 안쪽(모델 호출)까지 실제로 갔는지 — 공회전 반증. */
  it('예산 검사가 모델 경로를 실제로 밟는다', async () => {
    const before = streamTextMock.mock.calls.length;
    await drain(await POST(chat({ ip: freshIp(), message: 'hi' })));
    expect(streamTextMock.mock.calls.length).toBe(before + 1);
  });

  /** ① 자기 키를 낸 사용자는 같은 양을 보내도 막히지 않는다. */
  it('BYOK 사용자는 같은 양을 보내도 막히지 않는다', async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i += 1) {
      const res = await POST(chat({ ip, apiKey: 'user-own-key', message: HUGE }));
      expect(res.status).toBe(200);
      await drain(res);
    }
  });

  /** BYOK 요청이 서버 키 계량을 오염시키지도 않는다. */
  it('BYOK 요청은 서버 키 계량을 소비하지 않는다', async () => {
    const ip = freshIp();
    await drain(await POST(chat({ ip, apiKey: 'user-own-key', message: HUGE })));
    await drain(await POST(chat({ ip, apiKey: 'user-own-key', message: HUGE })));
    // 서버 키로는 아직 한 번도 안 썼으므로 통과해야 한다.
    const res = await POST(chat({ ip, message: HUGE }));
    expect(res.status).toBe(200);
    await drain(res);
  });

  /** ② 짧은 프롬프트로 긴 출력을 뽑는 경로가 계량된다. */
  it('출력 상한이 계량에 들어간다 — 짧은 프롬프트도 공짜가 아니다', async () => {
    const ip = freshIp();
    const remaining = async () => {
      const res = await POST(chat({ ip, message: 'hi', maxTokens: 8192 }));
      const left = Number(res.headers.get('X-Token-Budget-Remaining'));
      await drain(res);
      return left;
    };
    const first = await remaining();
    // 입력만 셌다면 ≈2 토큰이 빠져 499,99x 가 남는다.
    expect(first).toBeLessThan(500_000 - 8_000);
  });

  /**
   * 정산 — 예약은 상한, 청구는 실사용. 공급자가 100 토큰을 보고했으므로
   * 8192 예약 중 대부분이 돌아와야 한다.
   */
  it('실사용량으로 정산해 남은 예산을 돌려준다', async () => {
    const ip = freshIp();
    const res1 = await POST(chat({ ip, message: 'hi', maxTokens: 8192 }));
    await drain(res1);
    const res2 = await POST(chat({ ip, message: 'hi', maxTokens: 8192 }));
    const afterSettle = Number(res2.headers.get('X-Token-Budget-Remaining'));
    await drain(res2);
    // 정산이 없으면 두 번째 요청 시점에 8192×2 가 빠져 있다.
    expect(afterSettle).toBeGreaterThan(500_000 - 8_192 - 1_000);
  });

});
