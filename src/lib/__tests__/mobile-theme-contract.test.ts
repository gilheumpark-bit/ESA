import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('mobile field theme contract', () => {
  test('field mode does not force light-only neutral surfaces or primary text', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(with-nav)/mobile/page.tsx'), 'utf8');

    expect(source).not.toMatch(/\bbg-white\b|\bbg-gray-50\b|\btext-gray-900\b|\bborder-gray-(?:100|200|300)\b/);
  });
});
