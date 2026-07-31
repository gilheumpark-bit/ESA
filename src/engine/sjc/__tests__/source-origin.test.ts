import { createSource } from '../types';

/**
 * **영수증의 조항 번호에서 원문으로 갈 수 있는지 본다.**
 *
 * 이 저장소는 기준서 원문 문장을 담지 않으므로 사용자가 받는 근거는 조항 번호
 * 하나다. 번호만 던지고 끝내면 그 근거는 확인할 수 없고, 확인할 수 없는 근거는
 * 근거가 아니라 권위의 외양이다.
 *
 * 여기서는 헬퍼의 계약만 잠근다. **계산기가 실제로 이 경로를 타는가** 는
 * `lib/__tests__/calculator-params-contract.test.ts` 가 전 계산기 실입력으로
 * 확인한다 — 헬퍼 단위 테스트만으로는 배선이 끊겨도 초록이다(§2.2).
 */
describe('영수증 출처는 원문 경로를 들고 나간다', () => {
  it('등록 기관은 원문 URL 이 붙는다', () => {
    expect(createSource('KEC', '232.3.9').url).toBe('https://www.motie.go.kr');
    expect(createSource('IEC', '60364-5-52').url).toBe('https://webstore.iec.ch');
  });

  it('호출자가 준 더 구체적인 링크를 덮어쓰지 않는다', () => {
    const explicit = 'https://example.test/clause';
    expect(createSource('KEC', '232.3.9', { url: explicit }).url).toBe(explicit);
  });

  it('미등록 기관은 지어내지 않는다', () => {
    expect(createSource('없는기관', '1.2').url).toBeUndefined();
  });

});
