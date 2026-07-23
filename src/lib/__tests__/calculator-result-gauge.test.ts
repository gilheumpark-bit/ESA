import { buildCalculatorGauge } from '../calculator-result-gauge';

describe('calculator result gauge classification', () => {
  test.each(['voltage-drop', 'complex-voltage-drop'])(
    '%s는 전압강하 게이지를 표시한다',
    (calcId) => {
      expect(buildCalculatorGauge(calcId, 2.1, '%')).toMatchObject({
        label: '전압강하',
        limit: 3,
        direction: 'below',
      });
    },
  );

  test('impedance-voltage의 %Z는 전압강하 게이지로 분류하지 않는다', () => {
    expect(buildCalculatorGauge('impedance-voltage', 5, '%')).toBeNull();
  });

  test('숫자가 아니거나 단위가 %가 아니면 게이지를 만들지 않는다', () => {
    expect(buildCalculatorGauge('voltage-drop', '2.1', '%')).toBeNull();
    expect(buildCalculatorGauge('voltage-drop', 2.1, 'V')).toBeNull();
  });
});
