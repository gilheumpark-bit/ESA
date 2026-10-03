import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectableCalculations } from '../ProjectCalculationPicker';
import { decodeShareLinks, shareLinkState, type ShareLinkRow } from '../ProjectShareLinks';
import type { HistoryRecord } from '@/lib/history-read-model';

const record = (id: string): HistoryRecord => ({ id, calcId: 'voltage-drop', calculatedAt: '2026-10-01T00:00:00.000Z', inputs: {} });
const link = (overrides: Partial<ShareLinkRow> = {}): ShareLinkRow => ({
  id: 'a', createdAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-10-10T00:00:00.000Z', revokedAt: null, ...overrides,
});
const NOW = Date.parse('2026-10-03T00:00:00.000Z');

describe('프로젝트에 계산 추가', () => {
  it('이미 붙은 계산은 다시 고를 수 없다', () => {
    expect(selectableCalculations([record('r1'), record('r2'), record('r3')], ['r2']).map((r) => r.id)).toEqual(['r1', 'r3']);
  });

  it('붙은 것이 없으면 전부 고를 수 있다', () => {
    expect(selectableCalculations([record('r1')], [])).toHaveLength(1);
  });
});

describe('공유 링크 상태', () => {
  it('기한이 남은 링크는 사용 중이다', () => {
    expect(shareLinkState(link(), NOW)).toBe('active');
  });

  it('기한이 지난 링크는 만료다', () => {
    expect(shareLinkState(link({ expiresAt: '2026-10-02T00:00:00.000Z' }), NOW)).toBe('expired');
  });

  it('회수한 링크는 기한이 남아 있어도 회수됨이다', () => {
    expect(shareLinkState(link({ revokedAt: '2026-10-02T00:00:00.000Z' }), NOW)).toBe('revoked');
  });

  it('읽을 수 없는 만료 시각은 사용 중으로 치지 않는다', () => {
    expect(shareLinkState(link({ expiresAt: 'not-a-date' }), NOW)).toBe('expired');
  });

  // 기한 없는 링크(expires_at NULL)가 하나라도 있으면 목록 전체가 형식 오류로 떨어져 아무것도 회수할 수 없었다.
  it('기한 없는 링크도 읽고, 회수 전까지 사용 중으로 본다', () => {
    const [row] = decodeShareLinks({ links: [{ id: 'a', created_at: 'c', expires_at: null, revoked_at: null }] });
    expect(row.expiresAt).toBeNull();
    expect(shareLinkState(row, NOW)).toBe('active');
  });

  it('발급한 링크 목록은 소유자에게만 그린다 — 편집자에게 권한 오류를 띄우지 않는다', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(with-nav)/projects/[id]/page.tsx'), 'utf8');
    expect(page).toContain('{isOwner && <ProjectShareLinks');
  });

  it('서버 열 이름을 화면 모델로 옮기고, 형식이 다르면 거절한다', () => {
    expect(decodeShareLinks({ links: [{ id: 'a', created_by: 'u', created_at: 'c', expires_at: 'e', revoked_at: null }] }))
      .toEqual([{ id: 'a', createdAt: 'c', expiresAt: 'e', revokedAt: null }]);
    expect(() => decodeShareLinks({ links: [{ id: 'a' }] })).toThrow();
    expect(() => decodeShareLinks({ links: 'no' })).toThrow();
  });
});

/**
 * 서버에는 있는데 화면이 부르지 않던 동작들이다. 컴포넌트가 실제로 그 동작 이름으로
 * 요청하는지, 그리고 서버가 그 이름을 받는지를 양쪽 소스에서 대조한다 — 한쪽만
 * 이름을 바꾸면 버튼이 다시 아무 일도 하지 않게 된다.
 */
describe('화면 ↔ 서버 동작 이름', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
  const route = read('src/app/api/projects/[id]/route.ts');
  const page = read('src/app/(with-nav)/projects/[id]/page.tsx');

  it.each([
    ['addCalculation', 'src/components/ProjectCalculationPicker.tsx'],
    ['listShareLinks', 'src/components/ProjectShareLinks.tsx'],
    ['revokeShareLinks', 'src/components/ProjectShareLinks.tsx'],
  ])('%s 를 화면이 보내고 서버가 받는다', (action, component) => {
    expect(read(component)).toContain(`action: '${action}'`);
    expect(route).toContain(`case '${action}'`);
  });

  it('프로젝트 화면이 두 컴포넌트를 실제로 그린다', () => {
    expect(page).toContain('<ProjectCalculationPicker');
    expect(page).toContain('<ProjectShareLinks');
    expect(page).not.toContain("onAdd={() => router.push('/calc')}");
  });
});
