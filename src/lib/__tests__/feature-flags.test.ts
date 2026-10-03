import { isFeatureEnabled, isFeatureEnabledServer, type FeatureFlags } from '@/lib/feature-flags';

const ENV: Record<keyof FeatureFlags, string> = {
  DRAWING_PARSER: 'NEXT_PUBLIC_FF_DRAWING_PARSER',
  RECEIPT_NOTARIZE: 'NEXT_PUBLIC_FF_RECEIPT_NOTARIZE',
};
const DEFAULTS: FeatureFlags = { DRAWING_PARSER: true, RECEIPT_NOTARIZE: false };

describe('feature flags', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of Object.values(ENV)) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  // 플래그마다 자기 환경 변수를 읽는지 본다. 이름을 하나로 뭉쳐 읽거나 한 플래그의
  // 줄을 빠뜨리면, 그 플래그만 환경 값과 무관하게 기본값으로 남는다.
  it.each(Object.keys(ENV) as (keyof FeatureFlags)[])('%s 는 자기 환경 변수를 따른다', (flag) => {
    expect(isFeatureEnabledServer(flag)).toBe(DEFAULTS[flag]);

    process.env[ENV[flag]] = String(!DEFAULTS[flag]);
    expect(isFeatureEnabledServer(flag)).toBe(!DEFAULTS[flag]);
    expect(isFeatureEnabled(flag)).toBe(!DEFAULTS[flag]);

    // 다른 플래그의 변수는 이 플래그를 움직이지 않는다.
    delete process.env[ENV[flag]];
    for (const other of Object.keys(ENV) as (keyof FeatureFlags)[]) {
      if (other !== flag) process.env[ENV[other]] = String(!DEFAULTS[flag]);
    }
    expect(isFeatureEnabledServer(flag)).toBe(DEFAULTS[flag]);
  });

  it('true/false 가 아닌 값은 기본값으로 둔다', () => {
    process.env.NEXT_PUBLIC_FF_RECEIPT_NOTARIZE = '1';
    expect(isFeatureEnabledServer('RECEIPT_NOTARIZE')).toBe(false);
  });
});
