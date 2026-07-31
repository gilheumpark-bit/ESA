import { assertLoopbackRequest, isLoopbackHost } from '@/lib/chatgpt-local-loopback';

describe('ChatGPT local loopback boundary', () => {
  it.each([
    ['localhost:3000', true],
    ['127.0.0.1:3000', true],
    ['[::1]:3000', true],
    ['LOCALHOST', true],
    ['esa.example.com', false],
    ['localhost.attacker.test', false],
    ['127.0.0.2', false],
    [null, false],
  ])('classifies %s without suffix or alternate-address bypasses', (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });

  it('rejects a request whose Host header is not loopback', () => {
    const request = new Request('https://esa.example.com/api/settings/chatgpt-local', {
      headers: { host: 'esa.example.com' },
    });

    expect(() => assertLoopbackRequest(request)).toThrow('LOCAL_CHATGPT_NOT_AVAILABLE');
  });

  it('accepts a loopback Host even for a local production URL', () => {
    const request = new Request('http://127.0.0.1:3000/api/settings/chatgpt-local', {
      headers: { host: '127.0.0.1:3000' },
    });

    expect(() => assertLoopbackRequest(request)).not.toThrow();
  });
});
