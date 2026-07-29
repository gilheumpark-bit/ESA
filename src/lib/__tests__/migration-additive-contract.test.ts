import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **마이그레이션은 더하기만 한다 (expand-only).**
 *
 * RUNBOOK §4 는 "코드만 되돌려도 복구된다"고 안내한다. 그 안내가 성립하는
 * 조건은 딱 하나 — 구버전 코드가 새 스키마 위에서도 돌아가는 것, 즉
 * **지우는 마이그레이션이 없는 것**이다.
 *
 * 실측 2026-07-29: 9 개 파일에 CREATE TABLE 30 · ADD COLUMN 27 · DROP COLUMN 0 ·
 * DROP TABLE 0. 결론은 맞았지만 RUNBOOK 이 적어 둔 이유("전부 정책·제약 변경")
 * 는 사실과 달랐다. 문장은 낡지만 검사는 안 낡으므로, 그 조건을 여기서 잠근다.
 *
 * 되돌릴 수 없는 문장을 넣어야 할 때는 이 검사가 먼저 깨진다. 그때 할 일은
 * 검사를 푸는 게 아니라 **expand → migrate → contract 로 배포를 쪼개고**
 * RUNBOOK §4 를 다시 쓰는 것이다.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations');

/** 구버전 코드를 깨뜨리는 문장. DROP POLICY·DROP INDEX 는 재정의라 제외한다. */
const DESTRUCTIVE: Array<{ label: string; pattern: RegExp }> = [
  { label: 'DROP TABLE', pattern: /\bdrop\s+table\b/i },
  { label: 'DROP COLUMN', pattern: /\bdrop\s+column\b/i },
  { label: 'DROP SCHEMA', pattern: /\bdrop\s+schema\b/i },
  { label: 'RENAME COLUMN', pattern: /\brename\s+column\b/i },
  { label: 'RENAME TO (테이블 개명)', pattern: /\balter\s+table\s+[^\n;]*\brename\s+to\b/i },
  { label: 'TRUNCATE', pattern: /\btruncate\b/i },
];

/** 주석과 문자열 리터럴을 걷어낸다 — 설명문의 단어를 문장으로 오독하지 않게. */
function stripNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * 이미 배포된 위반. **지우지 말고 사유와 함께 남긴다** — 0 처럼 보이게 만들면
 * RUNBOOK 의 잘못된 안내가 그대로 되살아난다.
 *
 * 이 두 줄 때문에 002 이전으로는 코드만 되돌려서 복구되지 않는다. RUNBOOK §4 에
 * 그렇게 적어 두었다.
 */
const DECLARED_RESIDUALS: Array<{ file: string; fragment: string; why: string }> = [
  {
    file: '002_firebase_contract.sql',
    fragment: 'RENAME COLUMN calc_id TO calculator_id',
    why: '배포 완료 · 영수증 어휘 통일. IF EXISTS 가드로 재실행은 안전하나 하위호환 창은 없다.',
  },
  {
    file: '002_firebase_contract.sql',
    fragment: 'RENAME COLUMN result TO outputs',
    why: '위와 같은 배치.',
  },
];

function isDeclared(file: string, statement: string): boolean {
  return DECLARED_RESIDUALS.some(
    (r) => r.file === file && statement.toUpperCase().includes(r.fragment.toUpperCase()),
  );
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

describe('마이그레이션 expand-only 계약', () => {
  it('훑을 파일이 실제로 있다 — 공회전 반증', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(DESTRUCTIVE)('$label 을 쓰지 않는다', ({ pattern }) => {
    const hits: string[] = [];
    for (const file of files) {
      const sql = stripNoise(readFileSync(join(DIR, file), 'utf8'));
      sql.split(/;\s*/).forEach((statement) => {
        if (pattern.test(statement) && !isDeclared(file, statement)) {
          hits.push(`${file}: ${statement.trim().slice(0, 60)}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });

  /**
   * 잔여 선언이 실제로 그 파일에 남아 있는지. 마이그레이션이 정리돼 문장이
   * 사라지면 이 검사가 깨지고, 그때 목록과 RUNBOOK §4 를 함께 지우게 된다.
   */
  it.each(DECLARED_RESIDUALS)('선언된 잔여 «$fragment» 가 실재한다', ({ file, fragment }) => {
    const sql = readFileSync(join(DIR, file), 'utf8').toUpperCase();
    expect(sql).toContain(fragment.toUpperCase());
  });

  /**
   * 규칙이 실제로 무언가를 잡는지. 조용히 0 건이면 이 계약은 영원히 초록이고,
   * 누가 파괴적 마이그레이션을 넣어도 통과한다(§2.2).
   */
  it('탐지 규칙이 발화한다', () => {
    const samples = [
      'DROP TABLE users',
      'ALTER TABLE users DROP COLUMN email',
      'DROP SCHEMA public',
      'ALTER TABLE users RENAME COLUMN a TO b',
      'ALTER TABLE users RENAME TO people',
      'TRUNCATE receipts',
    ];
    for (const sample of samples) {
      expect(DESTRUCTIVE.some(({ pattern }) => pattern.test(sample))).toBe(true);
    }
  });

  it('정상 문장을 과차단하지 않는다', () => {
    const allowed = [
      'CREATE TABLE IF NOT EXISTS receipts (id text primary key)',
      'ALTER TABLE receipts ADD COLUMN IF NOT EXISTS user_id text',
      'DROP POLICY IF EXISTS receipts_select ON receipts',
      'DROP INDEX IF EXISTS idx_receipts_user',
      'DROP TRIGGER IF EXISTS audit_guard ON audit_log',
      "COMMENT ON TABLE receipts IS 'drop table 이라고 적힌 설명'",
    ];
    for (const sample of allowed) {
      const cleaned = stripNoise(sample);
      expect(DESTRUCTIVE.some(({ pattern }) => pattern.test(cleaned))).toBe(false);
    }
  });
});
