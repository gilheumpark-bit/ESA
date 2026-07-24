/**
 * 로그 마스킹 계약.
 *
 * 두 방향을 같이 잠근다. 지워야 할 것을 지우는지, 그리고 **지우면 안 되는 것을
 * 남기는지**. 후자가 없으면 마스킹이 영수증(SHA-256)까지 삼켜 관측을 죽인다 —
 * 과잉 마스킹도 결함이다.
 */

import { redactSecrets, apiLog } from '../api-logger';

describe('redactSecrets — 자격증명만 지운다', () => {
  it.each([
    ['OpenAI', 'upstream said sk-abcdefghijklmnop1234567890 failed'],
    ['Stripe', 'key sk_live_abcdefghijklmnop1234 rejected'],
    ['Google', 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6 quota'],
    ['Groq', 'gsk_abcdefghijklmnop1234567890 invalid'],
    ['GitHub', 'token ghp_abcdefghijklmnopqrstuvwxyz1234 expired'],
  ])('%s 키를 로그에서 지운다', (_label, text) => {
    const out = redactSecrets(text);
    expect(out).toContain('[REDACTED]');
    expect(out).not.toMatch(/sk-[A-Za-z0-9]|sk_live_[A-Za-z0-9]|AIzaSy|gsk_[A-Za-z0-9]|ghp_[A-Za-z0-9]/);
  });

  it('Bearer 토큰과 JWT 를 지운다', () => {
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456'))
      .toBe('Authorization: Bearer [REDACTED]');
    expect(redactSecrets('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toContain('[REDACTED]');
  });

  it('SHA-256 영수증 해시는 남긴다 — 이 저장소가 증거로 쓰는 값이다', () => {
    const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(redactSecrets(`sourceHash=${sha}`)).toBe(`sourceHash=${sha}`);
  });

  it('평범한 진단 문장과 수치는 건드리지 않는다', () => {
    const msg = 'PDF parse failed: Invalid PDF structure. 498 line segments, conf 0.85';
    expect(redactSecrets(msg)).toBe(msg);
  });
});

describe('apiLog — error 와 meta 를 통과시키기 전에 지운다', () => {
  const lines: string[] = [];
  let spyLog: jest.SpyInstance;
  let spyErr: jest.SpyInstance;

  beforeEach(() => {
    lines.length = 0;
    spyLog = jest.spyOn(console, 'log').mockImplementation((s: unknown) => { lines.push(String(s)); });
    spyErr = jest.spyOn(console, 'error').mockImplementation((s: unknown) => { lines.push(String(s)); });
  });
  afterEach(() => { spyLog.mockRestore(); spyErr.mockRestore(); });

  it('error 필드의 키를 지운다', () => {
    apiLog({ level: 'error', event: 'provider-call', route: '/api/chat',
      error: 'auth failed for sk-abcdefghijklmnop1234567890' });

    expect(lines[0]).toContain('[REDACTED]');
    expect(lines[0]).not.toContain('sk-abcdefghijklmnop1234567890');
  });

  it('meta 의 문자열 값도 지우고, 문자열이 아닌 값은 보존한다', () => {
    apiLog({ level: 'info', event: 'calc', route: '/api/calculate',
      meta: { upstream: 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6', calculatorId: 'voltage-drop', durationMs: 12 } });

    const parsed = JSON.parse(lines[0]);
    expect(parsed.meta.upstream).toBe('[REDACTED]');
    expect(parsed.meta.calculatorId).toBe('voltage-drop');
    expect(parsed.meta.durationMs).toBe(12);
  });
});
