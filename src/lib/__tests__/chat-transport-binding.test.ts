/**
 * 브라우저 채팅 전송기의 this 결속.
 *
 * `fetcher: fetch` 로 맨 참조를 객체 속성에 담아 두고 `transport.fetcher(...)`
 * 로 부르면 this 가 transport 가 된다. 브라우저 fetch 는 this 가 Window 여야
 * 하므로 거부하고, 그 문자열이 그대로 답변 자리에 찍힌다 —
 * "Failed to execute 'fetch' on 'Window': Illegal invocation"
 * (실측 2026-07-26, /tools/studio 에서 질문 전송 시).
 *
 * 서버 경유 게이트(gate:chat-live)는 /api/chat 을 직접 치므로 이 경로를 타지
 * 않아 초록이었다. 그래서 여기서 결속 자체를 잠근다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(process.cwd(), 'src/lib/electrical-chat-client.ts'), 'utf-8');

describe('채팅 전송기', () => {
  it('맨 fetch 를 객체 속성에 담지 않는다', () => {
    expect(SOURCE).not.toMatch(/fetcher:\s*fetch\s*,/);
  });

  it('전송기를 감싸서 넘긴다', () => {
    expect(SOURCE).toMatch(/fetcher:\s*\((?:input|\.\.\.)/);
  });
});

/**
 * 결속이 왜 필요한지를 런타임으로 재현한다 — jsdom 의 fetch 도 같은 규칙을
 * 따르므로, 감싸지 않으면 실제로 던진다.
 */
describe('this 결속 재현', () => {
  const nativeFetch = globalThis.fetch;

  beforeAll(() => {
    // 브라우저와 같은 조건: this 가 globalThis 가 아니면 던지는 함수.
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: function boundOnly(this: unknown) {
        if (this !== globalThis && this !== undefined) {
          throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
        }
        return Promise.resolve('ok');
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: nativeFetch });
  });

  it('맨 참조를 속성에 담아 부르면 던진다', async () => {
    const transport = { fetcher: globalThis.fetch };
    await expect(async () => transport.fetcher('/x')).rejects.toThrow('Illegal invocation');
  });

  it('감싸서 부르면 통과한다', async () => {
    const transport = { fetcher: (input: string) => globalThis.fetch(input) };
    await expect(transport.fetcher('/x')).resolves.toBe('ok');
  });
});
