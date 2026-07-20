import sitemap from '@/app/sitemap';
import { CALCULATOR_REGISTRY } from '@/engine/calculators';

describe('sitemap calculator routes', () => {
  it('is generated from the live calculator registry without stale or missing URLs', () => {
    const actual = sitemap()
      .map((entry) => new URL(entry.url).pathname)
      .filter((pathname) => pathname.startsWith('/calc/'))
      .sort();
    const expected = Array.from(CALCULATOR_REGISTRY.values())
      .map((calculator) => `/calc/${calculator.category}/${calculator.id}`)
      .sort();

    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(CALCULATOR_REGISTRY.size);
  });
});
