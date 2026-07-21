/**
 * IEC 60947-2 표준 정격 사다리 — known-answer.
 * 무발명 제안의 역산 함수는 사다리에 있는 값만 돌려주고, 범위 밖은 null이어야 한다
 * (발명 금지 — 없으면 보류).
 */

import {
  IEC_STANDARD_FRAMES_A,
  IEC_STANDARD_TRIPS_A,
  smallestFrameFor,
  largestTripAtMost,
} from '../iec-60947-2-frames';

describe('IEC 60947-2 표준 정격 사다리', () => {
  it('프레임·트립 배열은 오름차순이다(largestTripAtMost 조기종료 전제)', () => {
    const asc = (a: readonly number[]) => a.every((v, i) => i === 0 || v >= a[i - 1]);
    expect(asc(IEC_STANDARD_FRAMES_A)).toBe(true);
    expect(asc(IEC_STANDARD_TRIPS_A)).toBe(true);
  });

  describe('smallestFrameFor — 트립 수용 최소 프레임', () => {
    it('150AT → 160AF (p42 100AF/150AT 위반의 프레임 상향 제안)', () => {
      expect(smallestFrameFor(150)).toBe(160);
    });
    it('정확히 프레임값과 같으면 그 프레임(경계 포함)', () => {
      expect(smallestFrameFor(225)).toBe(225);
    });
    it('사다리 최대치를 넘으면 null(발명 금지·보류)', () => {
      expect(smallestFrameFor(2000)).toBeNull();
    });
  });

  describe('largestTripAtMost — 상한 이하 최대 표준 트립', () => {
    it('100 → 100 (프레임 100AF 유지 시 트립 하향 제안)', () => {
      expect(largestTripAtMost(100)).toBe(100);
    });
    it('상한이 표준값 사이면 아래로 스냅 (149 → 125)', () => {
      expect(largestTripAtMost(149)).toBe(125);
    });
    it('케이블 허용전류 200A 이내 최대 트립 = 200', () => {
      expect(largestTripAtMost(200)).toBe(200);
    });
    it('사다리 최소치보다 작으면 null(발명 금지·보류)', () => {
      expect(largestTripAtMost(10)).toBeNull();
    });
  });
});
