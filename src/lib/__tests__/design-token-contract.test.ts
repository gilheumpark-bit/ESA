import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('legacy component design-token compatibility', () => {
  test('shared safety and field components resolve every legacy surface/text token', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const required = [
      '--color-border',
      '--color-surface',
      '--color-surface-2',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-text-muted',
    ];

    for (const token of required) {
      expect(css).toMatch(new RegExp(`${token.replaceAll('-', '\\-')}\\s*:`));
    }
  });
});
