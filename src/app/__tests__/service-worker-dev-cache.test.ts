import fs from 'node:fs';
import path from 'node:path';

describe('service worker development cache policy', () => {
  test('does not serve stale Next.js chunks from cache on localhost', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');

    expect(source).toContain("url.hostname === 'localhost'");
    expect(source).toContain("url.hostname === '127.0.0.1'");
    expect(source).toContain("url.pathname.startsWith('/_next/')");
    expect(source).toContain('event.respondWith(fetch(request))');
  });
});
