/**
 * 최소 DXF ASCII 라이터 (픽스처 생성 전용)
 * ─────────────────────────────────────────
 * 목적은 "CAD가 뱉는 DXF를 흉내내는 것"이 아니라 **파서가 실제로 마주칠 형태를
 * 통제된 상태로 만드는 것**이다. 그래야 정답을 우리가 알고, 파서 출력과
 * 대조했을 때 차이가 곧 결함이 된다.
 *
 * 주의 — 파서가 읽을 줄 아는 엔티티만 쓰면 픽스처는 절대 실패하지 않는다(닫힌 순환).
 * 그래서 raw 지오메트리 심볼·중첩 블록·ARC 같이 파서가 못 읽을 수도 있는 형태를
 * 의도적으로 섞는다. 실패하면 그게 수확이다.
 */

/** DXF 그룹코드 페어 한 줄 */
function pair(code, value) {
  return `${code}\n${value}\n`;
}

export function line(x1, y1, x2, y2, layer = 'WIRE') {
  return (
    pair(0, 'LINE') + pair(8, layer) +
    pair(10, x1) + pair(20, y1) + pair(30, 0) +
    pair(11, x2) + pair(21, y2) + pair(31, 0)
  );
}

export function lwpolyline(points, layer = 'WIRE') {
  let out = pair(0, 'LWPOLYLINE') + pair(8, layer) + pair(90, points.length) + pair(70, 0);
  for (const [x, y] of points) out += pair(10, x) + pair(20, y);
  return out;
}

export function insert(name, x, y, layer = 'SYMBOL', rotation = 0) {
  return (
    pair(0, 'INSERT') + pair(8, layer) + pair(2, name) +
    pair(10, x) + pair(20, y) + pair(30, 0) +
    (rotation ? pair(50, rotation) : '')
  );
}

export function text(content, x, y, layer = 'TEXT', height = 2.5) {
  return (
    pair(0, 'TEXT') + pair(8, layer) +
    pair(10, x) + pair(20, y) + pair(30, 0) +
    pair(40, height) + pair(1, content)
  );
}

export function circle(x, y, r, layer = 'SYMBOL') {
  return (
    pair(0, 'CIRCLE') + pair(8, layer) +
    pair(10, x) + pair(20, y) + pair(30, 0) + pair(40, r)
  );
}

/** ARC — 파서가 처리하지 않는 엔티티. 오검출/무시 여부 관찰용. */
export function arc(x, y, r, startAngle, endAngle, layer = 'SYMBOL') {
  return (
    pair(0, 'ARC') + pair(8, layer) +
    pair(10, x) + pair(20, y) + pair(30, 0) + pair(40, r) +
    pair(50, startAngle) + pair(51, endAngle)
  );
}

/**
 * BLOCKS 섹션 — 블록 정의. entities는 블록 로컬 좌표 기준.
 * 중첩 블록(블록 정의 안의 INSERT)을 만들 수 있어 Pass-1이 모델스페이스만
 * 순회하는지 검증하는 데 쓴다.
 */
export function blockDef(name, entities) {
  return (
    pair(0, 'BLOCK') + pair(8, '0') + pair(2, name) + pair(70, 0) +
    pair(10, 0) + pair(20, 0) + pair(30, 0) + pair(3, name) +
    entities.join('') +
    pair(0, 'ENDBLK') + pair(8, '0')
  );
}

/**
 * 완성된 DXF 문서.
 * @param {object} opts
 * @param {string[]} opts.entities  모델스페이스 엔티티
 * @param {string[]} [opts.blocks]  블록 정의
 * @param {string}  [opts.version]  AC1009(R12) | AC1015(2000)
 * @param {number}  [opts.insunits] 단위 코드 (4=mm, 6=m)
 */
export function dxfDocument({ entities, blocks = [], version = 'AC1015', insunits = 4 }) {
  const header =
    pair(0, 'SECTION') + pair(2, 'HEADER') +
    pair(9, '$ACADVER') + pair(1, version) +
    pair(9, '$INSUNITS') + pair(70, insunits) +
    pair(0, 'ENDSEC');

  const blocksSection = blocks.length
    ? pair(0, 'SECTION') + pair(2, 'BLOCKS') + blocks.join('') + pair(0, 'ENDSEC')
    : '';

  const entitiesSection =
    pair(0, 'SECTION') + pair(2, 'ENTITIES') + entities.join('') + pair(0, 'ENDSEC');

  return header + blocksSection + entitiesSection + pair(0, 'EOF');
}
