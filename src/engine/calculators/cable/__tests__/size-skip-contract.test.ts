import { CALCULATOR_REGISTRY } from '@engine/calculators';
import { CalcValidationError } from '../../types';
import { getAmpacity } from '@/data/ampacity-tables/kec-ampacity';

jest.mock('@/data/ampacity-tables/kec-ampacity', () => ({
  ...jest.requireActual('@/data/ampacity-tables/kec-ampacity'),
  getAmpacity: jest.fn(),
}));

// 기본 국가가 KR 이라 `cable-sizing` 은 **KEC 표**를 탄다(이번 세션에 바꾼
// 경로다). 처음엔 IEC 를 mock 했다가 훑기가 실제로 어느 표를 밟는지 확인해
// 고쳤다 — mock 한 표를 안 타면 검사는 조용히 아무것도 안 본다.
const mockKec = jest.mocked(getAmpacity);
const actualKec = jest.requireActual('@/data/ampacity-tables/kec-ampacity').getAmpacity;

/**
 * **"이 굵기엔 표가 없다" 판별이 메시지 문자열에 매달려 있으면 안 된다.**
 *
 * `cable-sizing` 은 굵기 후보를 작은 것부터 훑으면서, 표가 없는 조합이면
 * 다음 굵기로 넘어간다. 그 판별이 앞서 이랬다:
 *
 *     /not available/i.test(error.message)
 *
 * 허용전류표 세 곳의 **영문 메시지**에 제어 흐름이 매달려 있었다. 그리고
 * 같은 배치가 형제 메시지(주위 온도)를 이미 한국어로 바꿨다 — 남은 영문을
 * 누가 번역하는 순간 `continue` 가 `throw` 로 뒤집혀 **Al 1.5mm² 같은 정상
 * 입력이 죽는다.** 드리프트는 이미 시작돼 있었다(2026-07-28 독립 심사
 * 백엔드 좌석).
 *
 * 여기서는 **메시지를 실제로 한국어로 바꿔** 돌려 본다. 소스 훑기가 아니다.
 */

const INPUT = {
  current: 100, length: 50, voltage: 380, conductor: 'Cu', insulation: 'XLPE',
  installation: 'C', ambientTemp: 30, groupCount: 1, powerFactor: 0.85,
  phase: 3, dropLimitPercent: 3,
};

function run() {
  return CALCULATOR_REGISTRY.get('cable-sizing')!.calculator(INPUT as never);
}

describe('굵기 건너뛰기 — 사유 코드로 판별한다', () => {
  afterEach(() => mockKec.mockReset());

  it('실제 표로 정상 계산된다 — 기준선', () => {
    mockKec.mockImplementation(actualKec);
    expect(run().value).toBeGreaterThan(0);
  });

  /**
   * 이 검사가 핵심이다. 메시지를 한국어로 바꿨는데도 훑기가 계속돼야 한다 —
   * 앞 구현에서는 여기서 첫 굵기부터 던져 계산이 통째로 죽었다.
   */
  it('메시지를 한국어로 바꿔도 작은 굵기를 건너뛰고 계산한다', () => {
    mockKec.mockImplementation(((opts: { size: number }) => {
      if (opts.size < 25) {
        throw new CalcValidationError(
          'size',
          `케이블 굵기 ${opts.size}mm² 는 이 조합에 표가 없습니다`,
          'SIZE_UNAVAILABLE',
        );
      }
      return actualKec(opts);
    }) as never);
    const r = run();
    expect(r.value).toBeGreaterThanOrEqual(25);
  });

  /** 사유 코드가 없는 거부는 삼키지 않는다 — 과도 흡수 회귀 방지. */
  it('다른 사유의 거부는 건너뛰지 않고 올려보낸다', () => {
    mockKec.mockImplementation((() => {
      throw new CalcValidationError('insulation', '절연 종류가 잘못됐습니다');
    }) as never);
    expect(() => run()).toThrow(CalcValidationError);
  });

  /** 내부 불변식도 삼키지 않는다 — 표가 깨진 것을 "굵기 없음" 으로 읽으면 안 된다. */
  it('내부 오류는 건너뛰지 않는다', () => {
    mockKec.mockImplementation((() => {
      throw new Error('ESVA-INTERNAL: KEC 허용전류표 누락');
    }) as never);
    expect(() => run()).toThrow(/ESVA-INTERNAL/);
  });

  /**
   * 표 계층이 실제로 그 코드를 달고 던지는지 — 위 검사들이 mock 안에서만
   * 참인 게 아님을 확인한다. mock 을 실제 구현으로 되돌려 직접 던지게 한다.
   */
  it('표 계층이 실제로 SIZE_UNAVAILABLE 을 단다', () => {
    let thrown: unknown = null;
    try {
      actualKec({ size: 1.5, conductor: 'Al', insulation: 'PVC', installation: 'tray', ambientTemp: 30 });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(CalcValidationError);
    expect((thrown as CalcValidationError).code).toBe('SIZE_UNAVAILABLE');
  });
});
