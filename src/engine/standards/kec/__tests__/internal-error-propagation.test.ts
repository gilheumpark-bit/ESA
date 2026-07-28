import { getAmpacity } from '@/data/ampacity-tables/kec-ampacity';
import { queryAmpacity, findMinCableSize, executeQuery } from '../kec-table-query';

jest.mock('@/data/ampacity-tables/kec-ampacity', () => ({
  ...jest.requireActual('@/data/ampacity-tables/kec-ampacity'),
  getAmpacity: jest.fn(),
}));

const mockGet = jest.mocked(getAmpacity);
const actual = jest.requireActual('@/data/ampacity-tables/kec-ampacity');

/**
 * **표가 깨졌을 때 200 으로 "규격이 없습니다" 를 내보내지 않는다.**
 *
 * 이 파일의 세 자리가 표 조회 오류를 전부 삼켰다 — `return null` ·
 * `continue` · `failResult`. 그 결과 허용전류표가 배포 사고로 깨져도:
 *
 *   HTTP **200** · `{"success":false,"error":"요구 전류를 만족하는 KEC
 *   표준 케이블 규격이 없습니다."}` · `console.error` 0 건 · 알람 0 건
 *
 * 문장이 **도메인적으로 거짓**이다 — 규격이 없는 게 아니라 표가 깨진 것이다.
 * 사용자는 그 말을 믿고 더 굵은 케이블로 설계를 바꾼다. 그리고 우리는 표가
 * 깨진 줄 모른다(2026-07-28 독립 심사 백엔드 좌석 실행 실측).
 *
 * 여기서는 표 계층이 `ESVA-INTERNAL:` 을 던지게 만들어 **실제로 올라오는지**
 * 본다. 소스 훑기가 아니다.
 */

const OPTS = { conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' } as const;

describe('내부 불변식은 삼켜지지 않는다', () => {
  afterEach(() => mockGet.mockReset());

  it('queryAmpacity — null 로 흡수하지 않고 올려보낸다', () => {
    mockGet.mockImplementation(() => {
      throw new Error('ESVA-INTERNAL: KEC 허용전류표 누락 — Cu_XLPE_conduit');
    });
    expect(() => queryAmpacity({ ...OPTS, size: 16 })).toThrow(/ESVA-INTERNAL/);
  });

  it('findMinCableSize — 다음 규격으로 넘어가지 않고 올려보낸다', () => {
    mockGet.mockImplementation(() => {
      throw new Error('ESVA-INTERNAL: KEC 허용전류표 누락 — Cu_XLPE_conduit');
    });
    expect(() => findMinCableSize(55, OPTS)).toThrow(/ESVA-INTERNAL/);
  });

  it('executeQuery — failResult(200) 로 흡수하지 않는다', () => {
    mockGet.mockImplementation(() => {
      throw new Error('ESVA-INTERNAL: KEC 허용전류표 누락 — Cu_XLPE_conduit');
    });
    expect(() => executeQuery({
      type: 'ampacity', ...OPTS, size: 16,
    } as never)).toThrow(/ESVA-INTERNAL/);
  });
});

describe('호출자 잘못은 계속 흡수한다 — 과도 전파 회귀 방지', () => {
  afterEach(() => mockGet.mockReset());

  /**
   * "그 규격엔 데이터가 없다"(예: Al 1.5sq)는 정말로 다음 규격으로 넘어가는
   * 게 맞다. 내부 표식을 붙이지 않은 오류까지 올려보내면 정상 역산이 죽는다.
   */
  it('표식 없는 오류는 종전대로 삼킨다', () => {
    mockGet.mockImplementation(() => {
      throw new Error('Wire size 1.5 is not available');
    });
    expect(queryAmpacity({ ...OPTS, size: 1.5 })).toBeNull();
    expect(findMinCableSize(55, OPTS)).toBeNull();
  });

  /** 실제 표로 정상 동작이 유지되는지 — 위 검사들이 mock 에만 사는 게 아님. */
  it('실제 표로는 계속 값이 나온다', () => {
    mockGet.mockImplementation(actual.getAmpacity);
    expect(queryAmpacity({ ...OPTS, size: 16 })?.baseAmpacity).toBeGreaterThan(0);
    expect(findMinCableSize(55, OPTS)?.minSize).toBeGreaterThan(0);
  });
});
