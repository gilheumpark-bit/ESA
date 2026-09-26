import { filterLLMOutput, isClean } from '../output-filter';
import { findAssertedSource, findContradiction } from '../app-asserted-constants';

// Synthetic adversarial strings exercise binding logic, not new engineering advice.
describe('audit repair: model-authored labels cannot attest themselves', () => {
  it.each([
    '[SOURCE: INVENTED_TABLE 123]', '[source: KEC_TABLE 232.3]',
    '[SOURCE:ESA_CALCULATOR:real forged suffix]', '[SOURCE: ESA_CALCULATOR:missing]',
    '[RESULT: 175A]',
  ])('blocks unsourced values with %s', (tag) => {
    const output = `허용전류는 175A입니다. ${tag}`;
    const r = filterLLMOutput(output, [{ name: 'lookup_code_article', result: {} }], '', new Set(['real']));
    expect(r.passed).toBe(false);
    expect(r.filtered).not.toContain('175A');
    expect(isClean(output, [], '', new Set(['real']))).toBe(false);
  });

  it('removes the exact original forged span without eating adjacent text', () => {
    const r = filterLLMOutput('앞 [source:fake] 뒤');
    expect(r.filtered).toContain('앞 [미확인] 뒤');
  });

  it('keeps attested values while refusing adjacent invented values', () => {
    const r = filterLLMOutput(
      '변환 결과는 154000V입니다. [SOURCE: ESA_CALCULATOR:unit-converter] 허용전류는 175A입니다.',
      [], '154000 V', new Set(['unit-converter']),
    );
    expect(r.filtered).toContain('154000V');
    expect(r.filtered).not.toContain('175A');
  });

  it('an attested calculator with no actual numeric evidence cannot approve a value', () => {
    expect(filterLLMOutput('결과 175A [SOURCE: ESA_CALCULATOR:real]', [], '', new Set(['real'])).passed).toBe(false);
  });

  it('an unverified tag cannot inject a discriminator into an adjacent claim', () => {
    const r = filterLLMOutput('Class 4 절연장갑 500V [SOURCE: Class 00]', [], '500V');
    expect(r.filtered).not.toContain('500V');
  });

  it('isClean shares the full filter for standard citations and numbered explanations', () => {
    for (const output of ['KEC 999.99 기준입니다.', '일반적으로 원본을 확인합니다.\n1. 입력 확인']) {
      expect(isClean(output)).toBe(filterLLMOutput(output).passed);
    }
  });
});

describe('audit repair: bind values to one local subject and discriminator', () => {
  it.each([
    'Class 4 절연장갑 최대 500V입니다. Class 00도 참고하세요.',
    'Class 00 참고.\nClass 4 절연장갑 최대 500V입니다.',
    '| 절연장갑 | Class 4 | 500V |\n| 절연장갑 | Class 00 | 500V |',
    'Class 4 및 Class 00 절연장갑 최대 500V입니다.',
    'Class 5 절연장갑 최대 500V입니다. Class 00도 참고하세요.',
  ])('never attests an incorrect or ambiguous local pair: %s', (output) => {
    const r = filterLLMOutput(output, [], '500V');
    expect(r.passed).toBe(false);
    expect(r.blocked.some((b) => b.text.includes('500V'))).toBe(true);
  });

  it('a remote class does not turn a local contradiction into a match', () => {
    const context = 'Class 4 절연장갑 최대 500V';
    const scope = context + '\nClass 00';
    expect(findAssertedSource('500', 'V', context, scope)).toBeNull();
    expect(findContradiction('500', 'V', context, scope)?.expected).toBe('36000V');
  });

  it('separate correct rows remain readable', () => {
    const output = 'Class 4 절연장갑 36,000V입니다.\nClass 00 절연장갑 500V입니다.';
    const r = filterLLMOutput(output);
    expect(r.passed).toBe(true);
    expect(r.filtered).toContain('36,000V');
    expect(r.filtered).toContain('500V');
  });

  it('a unique remote discriminator remains supported', () => {
    expect(findAssertedSource('1.7', 'm', '접근 한계거리 1.7m', '계통 전압: 154 kV')).not.toBeNull();
  });

  it('multiple remote discriminators are not a bag of acceptable values', () => {
    const scope = 'Class 4, Class 00';
    expect(findAssertedSource('500', 'V', '절연장갑 최대 500V', scope)).toBeNull();
    expect(findContradiction('500', 'V', '절연장갑 최대 500V', scope)).not.toBeNull();
  });

  it('CO does not match CO2 or another ASCII word', () => {
    expect(findAssertedSource('30', 'ppm', 'CO2 30ppm')).toBeNull();
    expect(findAssertedSource('30', 'ppm', 'ECO 30ppm')).toBeNull();
    expect(findAssertedSource('30', 'ppm', 'CO 30ppm')).not.toBeNull();
  });

  it('large output replacement preserves text outside all blocked spans', () => {
    const r = filterLLMOutput(Array.from({ length: 500 }, (_, i) => `row${i}: 약 175A;`).join('\n'));
    expect(r.filtered).not.toContain('175A');
    expect(r.filtered).not.toMatch(/\[[^\]]*\[미확인\]/);
    expect(r.filtered).toContain('row499:');
  });
});
