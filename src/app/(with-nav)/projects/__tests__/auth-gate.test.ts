/**
 * 인증이 필요한 작성 화면은 **먼저** 막는다.
 *
 * /projects/new 는 인증이 필요한데도 폼을 그대로 열어 두고, 이름·설명을 다
 * 채워 "프로젝트 생성" 을 누른 뒤에야 거부했다(실측 2026-07-26: 제출 후에야
 * "로그인 서비스를 사용할 수 없습니다"). 사용자가 쓴 것을 버리게 된다.
 *
 * 같은 성격의 /community/ask 는 이미 useAuth 로 사전에 막고 있었다. 두 화면이
 * 다르게 굴면 어느 쪽이 맞는지 알 수 없으므로 계약으로 잠근다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 인증이 있어야 제출이 되는 작성 화면. */
const CREATE_PAGES = [
  'src/app/(with-nav)/projects/new/page.tsx',
  'src/app/(with-nav)/community/ask/page.tsx',
];

describe('작성 화면의 사전 인증 안내', () => {
  it.each(CREATE_PAGES)('%s — useAuth 로 로그인 여부를 본다', (path) => {
    expect(readFileSync(join(process.cwd(), path), 'utf-8')).toContain('useAuth');
  });

  it.each(CREATE_PAGES)('%s — 비로그인이면 폼 대신 안내를 낸다', (path) => {
    const source = readFileSync(join(process.cwd(), path), 'utf-8');
    // 제출 핸들러보다 **앞에서** 반환해야 폼을 그리지 않는다.
    const gate = source.indexOf('!user');
    const submit = source.indexOf('const handleSubmit');
    expect(gate).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(submit);
    expect(source).toContain('로그인이 필요합니다');
  });

  it.each(CREATE_PAGES)('%s — 로그인 경로와 돌아갈 목록을 함께 준다', (path) => {
    const source = readFileSync(join(process.cwd(), path), 'utf-8');
    expect(source).toContain('href="/login"');
    expect(source).toMatch(/href="\/(projects|community)"/);
  });
});
