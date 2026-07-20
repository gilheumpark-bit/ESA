import fs from 'node:fs';
import path from 'node:path';

describe('root layout local font contract', () => {
  it('uses local font packages and retains the global font variables', () => {
    const layout = fs.readFileSync(
      path.join(process.cwd(), 'src', 'app', 'layout.tsx'),
      'utf8',
    );

    expect(layout).not.toContain("next/font/google");
    expect(layout).toContain("@fontsource/ibm-plex-sans-kr");
    expect(layout).toContain("@fontsource/noto-serif-kr");
    expect(layout).toContain("@fontsource/ibm-plex-mono");
    expect(layout).toContain("--font-sans");
    expect(layout).toContain("--font-serif");
    expect(layout).toContain("--font-mono");
  });
});
