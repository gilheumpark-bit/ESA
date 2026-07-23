import fs from 'node:fs';
import path from 'node:path';

describe('Studio text answer wiring', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(with-nav)/tools/studio/page.tsx'),
    'utf8',
  );

  test('uses the shared AI chat path instead of returning search snippets', () => {
    expect(source).toContain('requestElectricalChat');
    expect(source).not.toContain("body: JSON.stringify({ query: text, mode: 'studio' })");
  });
});
