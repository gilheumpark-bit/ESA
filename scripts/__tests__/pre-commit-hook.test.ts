import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * **pre-commit 훅이 등록만 된 게 아니라 실제로 발화하는가.**
 *
 * 왜 필요한가(2026-07-28 독립 보안 좌석 실측):
 *  · 이 리포는 **PUBLIC** 이다
 *  · `.env.example` 은 tracked 이고 `.gitignore` 는 `.env*.local` 만 덮는다
 *  · 워킹트리의 `.env.example` 에는 로컬 검증용 **실키**가 들어 있다
 *  · 훅 0개 · CI 에 시크릿 스캐너 0개 → `git add -A` 한 번이면 공개된다
 *
 * 지금까지는 사람이 매번 `':(exclude).env.example'` 을 붙여 막았다. 그건
 * 방어가 아니라 기억력이다.
 *
 * 이 검사는 **훅 파일을 실제로 실행한다.** 목록 대조나 존재 확인이 아니다 —
 * 이 리포에서 "등록됐으니 작동한다" 는 착시가 반복해서 났다(§2.2).
 * 임시 저장소를 만들고 가짜 시크릿을 스테이지해 커밋이 **막히는지** 본다.
 *
 * 여기 쓰는 가짜 값은 형태만 맞춘 것이고 실제 키가 아니다.
 */

const HOOK = join(__dirname, '..', '..', '.githooks', 'pre-commit');

/**
 * **시크릿 형태를 리터럴로 적지 않는다 — 런타임에 조립한다.**
 *
 * 처음엔 `'AIzaFAKEfake…'` 처럼 그대로 적었다가 **훅이 이 커밋을 막았다.**
 * 옳은 동작이다. 여기서 파일 단위 예외를 두면 그 파일이 곧 구멍이 된다 —
 * 누구든 진짜 키를 이 검사 파일에 넣으면 통과한다.
 *
 * 그래서 리포에는 리터럴이 존재하지 않게 하고, 검사가 돌 때만 만든다.
 * 훅이 보는 것은 커밋되는 텍스트이므로 이걸로 충분하고, 검사가 실제로
 * 완성된 형태를 훅에 먹인다는 점은 그대로다.
 */
const filler = (n: number) => 'x'.repeat(n);
const shape = (prefix: string, n: number) => `${prefix}${filler(n)}`;

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'esva-hook-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'hook test');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, '.githooks'));
  copyFileSync(HOOK, join(dir, '.githooks', 'pre-commit'));
  chmodSync(join(dir, '.githooks', 'pre-commit'), 0o755);
  git('config', 'core.hooksPath', '.githooks');
  return dir;
}

/** 커밋을 시도하고 **막혔는지** 돌려준다. */
function tryCommit(dir: string, file: string, content: string): { blocked: boolean; out: string } {
  writeFileSync(join(dir, file), content);
  execFileSync('git', ['add', file], { cwd: dir, stdio: 'pipe' });
  try {
    execFileSync('git', ['commit', '-m', 'x'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    return { blocked: false, out: '' };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { blocked: true, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('pre-commit 훅 — 실발화', () => {
  let dir: string;
  beforeEach(() => { dir = makeRepo(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  /** 첫 커밋이 되는지 — 훅 자체가 모든 것을 막아 버리면 이 검사가 무의미하다. */
  it('평범한 파일은 커밋된다 — 훅이 전부 막는 게 아님', () => {
    const r = tryCommit(dir, 'ok.txt', 'hello\nworld\n');
    expect(r.blocked).toBe(false);
  });

  it('값이 채워진 .env.example 은 막힌다', () => {
    tryCommit(dir, 'seed.txt', 'seed\n');
    const r = tryCommit(dir, '.env.example', [
      '# comment',
      'SOME_BASE_URL=http://localhost:1234',
      `GOOGLE_GENERATIVE_AI_API_KEY=${filler(30)}`,
      '',
    ].join('\n'));
    expect(r.blocked).toBe(true);
    expect(r.out).toMatch(/시크릿 이름을 가진 변수에 값이 있다/);
  });

  it('값이 빈 .env.example 은 통과한다 — 커밋본이 막히면 안 된다', () => {
    tryCommit(dir, 'seed.txt', 'seed\n');
    const r = tryCommit(dir, '.env.example', [
      'GOOGLE_GENERATIVE_AI_API_KEY=',
      'STRIPE_SECRET_KEY=',
      'SUPABASE_SERVICE_ROLE_KEY=',
      'OLLAMA_BASE_URL=http://localhost:11434',
      'STRIPE_BILLING_ENABLED=false',
      'ESVA_DEFAULT_TENANT_ID=esa',
      '',
    ].join('\n'));
    expect(r.blocked).toBe(false);
  });

  /**
   * 파일 종류를 가리지 않는다 — 소스에 붙여넣은 키도 막아야 한다.
   * 형태만 맞춘 가짜 값이다.
   */
  it.each([
    ['Google 구형', () => shape('AIza', 24)],
    ['Google 신형', () => shape(`AQ${'.'}`, 24)],
    ['OpenAI', () => shape('sk-', 24)],
    ['GitHub PAT', () => shape('ghp_', 34)],
    ['AWS', () => `AKIA${'A'.repeat(16)}`],
    ['개인키', () => ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ')],
  ])('%s 형태가 소스에 들어오면 막는다', (_label, make) => {
    tryCommit(dir, 'seed.txt', 'seed\n');
    const r = tryCommit(dir, 'src.ts', `const k = "${make()}";\n`);
    expect(r.blocked).toBe(true);
    expect(r.out).toMatch(/알려진 시크릿 형태/);
  });

  /** 막을 때 **값을 출력하지 않는다** — 로그·터미널 기록에 남으면 안 된다. */
  it('차단 메시지에 값이 들어가지 않는다', () => {
    tryCommit(dir, 'seed.txt', 'seed\n');
    const secret = shape(`AQ${'.'}`, 24);
    const r = tryCommit(dir, 'src.ts', `const k = "${secret}";\n`);
    expect(r.blocked).toBe(true);
    expect(r.out).not.toContain(secret);
    expect(r.out).not.toContain(filler(24));
  });

  /** 정상 코드가 막히면 개발이 멈춘다 — 과차단 회귀 방지. */
  it.each([
    ['평범한 상수', 'export const SIZE = 25;'],
    ['긴 base64 아닌 문자열', 'const s = "abcdefghijklmnopqrstuvwxyz0123456789";'],
    ['환경변수 참조', 'const k = process.env.GOOGLE_GENERATIVE_AI_API_KEY;'],
    ['빈 값 대입', 'const k = "";'],
  ])('%s 는 통과한다', (_label, line) => {
    tryCommit(dir, 'seed.txt', 'seed\n');
    const r = tryCommit(dir, 'src.ts', `${line}\n`);
    expect(r.blocked).toBe(false);
  });
});
