/**
 * standalone 산출물에 정적 자산을 복사한다 (postbuild).
 *
 * `output: 'standalone'` 은 서버 번들과 추적된 node_modules 만 만든다.
 * `.next/static` 과 `public` 은 **복사해 주지 않는다** — Next 가 명시한 동작이고,
 * Dockerfile 은 이미 COPY 두 줄로 처리하고 있다(36~39행).
 *
 * 문제는 Docker 밖이다. 로컬이나 비-Docker 배포에서 `node .next/standalone/server.js`
 * 로 띄우면 청크가 전부 404 나고 하이드레이션이 실패한다. 증상이 "페이지가
 * 이상하다"로만 보여서 서비스워커·빌드ID·캐시를 의심하게 되는데, 원인은 빌드마다
 * 재발하는 이 복사 누락이다. 사람이 매번 기억해야 하는 절차는 언젠가 빠진다.
 *
 * 그래서 빌드에 붙인다. Docker 는 이 스크립트가 채워 둔 자리를 그대로 COPY 하므로
 * 중복일 뿐 충돌하지 않는다.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 트리를 수동으로 순회해 복사한다.
 *
 * fs.cpSync(recursive) 를 쓰지 않는 이유는 실측이다 — Windows + OneDrive 경로에서
 * `.next/static` 을 복사하다 프로세스가 출력 없이 죽었다(exit 127, stdout·stderr
 * 모두 빈 상태. rm 단계까지는 찍히고 cp 에서 사망). 같은 트리를 아래 순회로
 * 복사하면 정상이다. 원인을 특정하지 못했으므로 회피한다 — 빌드 후처리는 조용히
 * 실패하면 안 되는 자리다.
 */
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (entry.isFile()) copyFileSync(source, target);
    // 심볼릭 링크·특수 파일은 건너뛴다. 정적 자산 트리에는 없다.
  }
}

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  // standalone 출력이 아닌 빌드에서는 할 일이 없다. 빌드를 실패시키지 않는다 —
  // 이 스크립트는 보조 장치지 게이트가 아니다.
  console.log('copy-standalone-assets: .next/standalone 없음 — 건너뜀');
  process.exit(0);
}

/** 대상이 남아 있으면 지우고 복사한다. 이전 빌드의 청크가 섞이면 404 를 남긴다. */
function replace(from, to, label) {
  if (!existsSync(from)) {
    console.log(`copy-standalone-assets: ${label} 원본 없음(${from}) — 건너뜀`);
    return false;
  }
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  copyTree(from, to);
  console.log(`copy-standalone-assets: ${label} → ${to}`);
  return true;
}

const copiedStatic = replace(
  join(root, '.next', 'static'),
  join(standalone, '.next', 'static'),
  '.next/static',
);
const copiedPublic = replace(join(root, 'public'), join(standalone, 'public'), 'public');

if (!copiedStatic) {
  // static 이 없으면 standalone 서버는 반드시 청크 404 를 낸다. 조용히 넘기지 않는다.
  console.error('copy-standalone-assets: .next/static 이 없어 standalone 서버가 깨진다.');
  process.exit(1);
}

console.log(`copy-standalone-assets: 완료 (static=${copiedStatic}, public=${copiedPublic})`);
