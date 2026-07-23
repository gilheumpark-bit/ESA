import fs from 'node:fs';
import path from 'node:path';

describe('home surface simplification', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(with-nav)/page.tsx'),
    'utf8',
  );

  test('removes AX and estimation slogans from the home surface', () => {
    expect(source).not.toContain('AX 최종안');
    expect(source).not.toContain('AI는 추정하지 않습니다.');
  });

  test('uses one left-aligned content axis for the hero and search surface', () => {
    expect(source).toContain('max-w-[808px]');
    expect(source).not.toContain('text-center');
    expect(source).not.toContain('<div className="flex justify-center">');
  });

  test('routes a general home question to the visible AI answer surface', () => {
    expect(source).toContain('answer=1');
  });
});
