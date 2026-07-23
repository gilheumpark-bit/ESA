import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function compose(name: string): string {
  return readFileSync(join(process.cwd(), name), 'utf8');
}

describe('self-hosted data services', () => {
  test.each(['docker-compose.yml', 'docker-compose.weaviate.yml'])(
    '%s keeps Weaviate private and authenticated',
    (file) => {
      const source = compose(file);

      expect(source).not.toMatch(/-\s*["']?(?:0\.0\.0\.0:)?8080:8080/);
      expect(source).not.toMatch(/-\s*["']?(?:0\.0\.0\.0:)?50051:50051/);
      expect(source).toMatch(/AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED:\s*["']?false/);
      expect(source).toMatch(/AUTHENTICATION_APIKEY_ENABLED:\s*["']?true/);
    },
  );

  test('the primary compose file does not publish unauthenticated Redis', () => {
    expect(compose('docker-compose.yml')).not.toMatch(
      /-\s*["']?(?:0\.0\.0\.0:)?6379:6379/,
    );
  });
});
