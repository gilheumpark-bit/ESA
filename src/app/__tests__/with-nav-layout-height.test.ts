import fs from 'node:fs';
import path from 'node:path';

describe('with-nav full-height layout contract', () => {
  const layout = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(with-nav)/layout.tsx'),
    'utf8',
  );
  const home = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(with-nav)/page.tsx'),
    'utf8',
  );

  test('uses the real viewport flex stack instead of a fixed height subtraction', () => {
    expect(layout).toContain('className="flex min-h-dvh flex-col"');
    expect(layout).toContain('className="flex flex-1 flex-col"');
    expect(layout).not.toContain('calc(100vh-8rem)');
  });

  test('keeps the home status bar attached to the shared footer', () => {
    expect(home).toContain('className="flex flex-1 flex-col');
    expect(home).toContain('mt-auto flex h-8');
  });
});
