import { APP_ASSERTED_CONSTANTS, findAssertedSource, findContradiction } from '../app-asserted-constants';
import { filterLLMOutput } from '../output-filter';

// The standard number and edition describe one registered implementation, not
// interchangeable safety subjects. No new standard value or edition is added.
describe('linked standard identity review regression', () => {
  const context = '아크플래시 1584-2002';

  it.each(['1584', '2002'])('preserves registered standard component %s', (value) => {
    expect(findAssertedSource(value, '', context)).toBe('이 앱의 아크플래시 계산기 구현(IEEE 1584-2002)');
    expect(findContradiction(value, '', context)).toBeNull();
  });

  it('keeps the registered number-edition pair in the complete output filter', () => {
    const result = filterLLMOutput('아크플래시 계산기 구현은 1584-2002 판입니다.');
    expect(result.passed).toBe(true);
    expect(result.filtered).toContain('1584-2002');
    expect(result.filtered).not.toContain('[미확인]');
  });

  it('does not register a different edition through the shared identity', () => {
    expect(findAssertedSource('2018', '', '아크플래시 1584-2018')).toBeNull();
    expect(findContradiction('2018', '', '아크플래시 1584-2018')).not.toBeNull();
  });

  it('continues rejecting different safety subjects even when their source is shared', () => {
    expect(findAssertedSource('30', 'ppm', 'CO 및 H2S 30ppm')).toBeNull();
    expect(findContradiction('30', 'ppm', 'CO 및 H2S 30ppm')).not.toBeNull();
  });

  it('does not weaken class-specific voltage binding', () => {
    const text = 'Class 4 절연장갑 500V';
    expect(findAssertedSource('500', 'V', text)).toBeNull();
    expect(findContradiction('500', 'V', text)?.expected).toBe('36000V');
  });

  it('uses an explicit identity only for the two linked registry entries', () => {
    expect(APP_ASSERTED_CONSTANTS.filter((entry) => entry.subject).map((entry) => entry.value)).toEqual(['1584', '2002']);
  });
});
