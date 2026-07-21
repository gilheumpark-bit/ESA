/**
 * 케이블 스케줄 표 파서 — 분전반 간선 일람표를 행 단위 구조 데이터로 추출한다.
 * ─────────────────────────────────────────────────────────────────────────
 * 설계 정본: docs/project/design/2026-07-21-drawing-review-ladder.md (중급).
 *
 * 실발주 도면(KIMM EE-007)의 CABLE SCHEDULE 표는 각 행이 한 피더다:
 *   PANEL NO · NO · FROM · TO · 전원방식 · 외함크기 · CABLE SCHEDULE · REMARK
 * REMARK 열에 차단기(MCCB 3P 125/50), CABLE SCHEDULE 열에 케이블(42C FCV 16sq)이
 * 있어 — SLD 결선도에서 UNKNOWN이던 분기 케이블-차단기 쌍이 여기 다 있다.
 *
 * 표는 회로가 아니므로(topology 신뢰 불가·§2.10) confidence 강등 대상이지만,
 * 그 안의 행 데이터는 검토(CABLE-AMPACITY)의 최고 입력원이다 — 표를 버리지 않고
 * 데이터로 읽는다. 좌표 기하만 쓰고 값은 인쇄된 것만 취한다(무발명).
 */

export interface TableText {
  s: string;
  x: number;
  y: number;
}

export interface ScheduleRow {
  /** 열 이름 → 셀 텍스트(다중 라인은 공백 결합) */
  cells: Record<string, string>;
}

export interface ScheduleTable {
  title: string;
  columns: Array<{ name: string; xStart: number; xEnd: number }>;
  rows: ScheduleRow[];
}

// 헤더 토큰 → 정규 열 이름. 실발주 표기 변형 흡수.
const HEADER_TOKENS: Array<{ re: RegExp; name: string }> = [
  { re: /^PANEL\s*NO/i, name: 'panelNo' },
  { re: /^NO$/i, name: 'no' },
  { re: /^FROM$/i, name: 'from' },
  { re: /^TO$/i, name: 'to' },
  { re: /전원방식/, name: 'powerType' },
  { re: /외함크기|외형크기/, name: 'enclosure' },
  // "SCHED" 접두로 매칭 — 실발주 도면이 헤더를 "CABLE SCHEDLE"로 오타(U 누락)낸
  // 실측(KIMM EE-007). 도면의 오탈자에 강건해야 데이터를 놓치지 않는다.
  { re: /CABLE\s*SCHED|케이블\s*규격|전선규격/i, name: 'cable' },
  { re: /REMARK|비고|차단기/i, name: 'remark' },
];

const SCHEDULE_TITLE = /(CABLE\s*SCHED|일람표|부하집계표)/i;
const ROW_Y_TOLERANCE = 8; // 한 논리 행의 세로 밴드(2줄 셀 포함)

function clusterByY(items: TableText[], tol: number): TableText[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TableText[][] = [];
  let cur: TableText[] = [];
  // 클러스터 **앵커(첫 y)** 기준. 직전 항목 기준이면 조밀한 표에서 y가 연쇄로
  // 이어져(single-linkage chaining) 여러 물리 행이 하나로 병합됐다(p9 실측:
  // 15px 피치 행 3개가 한 행으로). 앵커 고정으로 행 경계를 지킨다.
  let anchorY: number | null = null;
  for (const it of sorted) {
    if (anchorY === null || it.y - anchorY <= tol) {
      cur.push(it);
      if (anchorY === null) anchorY = it.y;
    } else {
      rows.push(cur);
      cur = [it];
      anchorY = it.y;
    }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

/** 헤더 행 후보: 알려진 헤더 토큰을 3개 이상 담은 y-클러스터 */
function findHeaderRows(items: TableText[]): TableText[][] {
  return clusterByY(items, 4).filter((row) => {
    const hits = new Set<string>();
    for (const it of row) {
      for (const { re, name } of HEADER_TOKENS) if (re.test(it.s)) hits.add(name);
    }
    return hits.size >= 3;
  });
}

/** 헤더 행 → 열 경계(인접 헤더 중점) */
function columnsFromHeader(header: TableText[]): ScheduleTable['columns'] {
  const cols: Array<{ name: string; x: number }> = [];
  for (const it of header) {
    for (const { re, name } of HEADER_TOKENS) {
      if (re.test(it.s) && !cols.some((c) => c.name === name)) cols.push({ name, x: it.x });
    }
  }
  cols.sort((a, b) => a.x - b.x);
  return cols.map((c, i) => {
    const prev = cols[i - 1];
    const next = cols[i + 1];
    return {
      name: c.name,
      xStart: prev ? Math.round((prev.x + c.x) / 2) : c.x - 40,
      xEnd: next ? Math.round((c.x + next.x) / 2) : c.x + 80,
    };
  });
}

/**
 * 표 전체를 파싱한다. 표제(SCHEDULE_TITLE)가 2회 이상인 문서에서만 동작(§표 문서
 * 판정과 정합). 각 헤더 행마다 그 아래를 한 표 블록으로 보고 행을 추출한다.
 */
export function parseScheduleTables(texts: readonly TableText[], pageHeight: number): ScheduleTable[] {
  const items = texts.filter((t) => t.s.trim().length > 0);
  const titleCount = items.filter((t) => SCHEDULE_TITLE.test(t.s)).length;
  if (titleCount < 2) return [];

  const headers = findHeaderRows(items);
  if (headers.length === 0) return [];

  const tables: ScheduleTable[] = [];
  for (const header of headers) {
    const columns = columnsFromHeader(header);
    if (columns.length < 3) continue;
    const headerY = Math.max(...header.map((h) => h.y));
    const xMin = Math.min(...columns.map((c) => c.xStart));
    const xMax = Math.max(...columns.map((c) => c.xEnd));

    // 이 헤더 아래(다음 헤더/표제 전까지) 이 블록 x-범위 안의 항목
    const nextHeaderY = headers
      .map((h) => Math.min(...h.map((t) => t.y)))
      .filter((y) => y > headerY)
      .sort((a, b) => a - b)[0] ?? pageHeight;

    const body = items.filter((t) =>
      t.y > headerY + 2 && t.y < nextHeaderY - 2 &&
      t.x >= xMin - 20 && t.x <= xMax + 20 &&
      !SCHEDULE_TITLE.test(t.s) && !HEADER_TOKENS.some(({ re }) => re.test(t.s)),
    );

    const rows: ScheduleRow[] = [];
    for (const cluster of clusterByY(body, ROW_Y_TOLERANCE)) {
      const cells: Record<string, string> = {};
      for (const it of cluster.sort((a, b) => a.x - b.x)) {
        const col = columns.find((c) => it.x >= c.xStart && it.x < c.xEnd);
        const key = col ? col.name : 'other';
        cells[key] = cells[key] ? `${cells[key]} ${it.s}` : it.s;
      }
      // 빈/장식 행 제외: 유효 셀 2개 미만이면 버린다.
      if (Object.keys(cells).filter((k) => k !== 'other').length >= 2) {
        rows.push({ cells });
      }
    }
    if (rows.length > 0) tables.push({ title: 'CABLE SCHEDULE', columns, rows });
  }
  return tables;
}

// IDENTITY_SEAL: topology/schedule-table-parser | role=케이블 스케줄 표 행 추출(중급) | inputs=texts,pageHeight | outputs=ScheduleTable[]
