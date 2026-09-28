import fs from 'fs';
import path from 'path';

const page = fs.readFileSync(
  path.join(process.cwd(), 'src/app/(with-nav)/receipt/[id]/page.tsx'),
  'utf8',
);

describe('receipt protected-client wiring', () => {
  test('sends an optional Firebase token when loading an owned receipt, bypassing the HTTP cache', () => {
    // The browser cache is not partitioned by account, so it is never consulted.
    expect(page).toContain("optionalAuthenticatedFetch(`/api/receipt/${id}`, { cache: 'no-store' })");
  });

  test('uses mandatory authentication for notarization', () => {
    expect(page).toContain("authenticatedFetch('/api/notarize'");
  });

  test('does not describe a private owner URL as a public share link', () => {
    expect(page).not.toContain('>\n          공유\n');
    expect(page).toContain('내 링크 복사');
  });
});
