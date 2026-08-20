/**
 * 업로드 파일 → 분석기 선택
 * ─────────────────────────────────────────────────────────────────────────
 * MIME 을 먼저 보면 안 된다. freedesktop shared-mime-info 는 `.dxf` 를
 * `image/vnd.dxf` 로 매핑하므로 Linux 브라우저에서 DXF 도면의 `file.type` 이
 * `image/` 로 시작한다. MIME 우선 분기는 그 도면을 이미지 AI 경로로 흘려보내고,
 * 이미지 경로는 `setAnalysis(null)` 을 하므로 화면에 결과가 아예 나오지 않는다.
 *
 * 실측(CI run 30133249333, ubuntu-latest): DXF 업로드 후 `/api/dxf` 요청이
 * **한 건도 발생하지 않았고** 결과 헤딩이 렌더되지 않았다. 같은 커밋이 Windows
 * 로컬에서는 통과했다 — Windows 는 `.dxf` 에 MIME 매핑이 없어 `file.type` 이
 * 빈 문자열이라 확장자 분기까지 도달했기 때문이다. 같은 파일이 OS 에 따라 다른
 * 분석기로 갔다.
 *
 * 그래서 확장자가 정본이다. 이 앱의 입력은 `accept=".dxf"` · `accept=".pdf"` 로
 * 확장자를 계약으로 걸고 있고, 벡터 파서도 확장자로 분기한다. MIME 은 확장자가
 * 벡터 형식을 지목하지 않을 때만 본다.
 */

export type DocumentKind = 'dxf' | 'pdf' | 'image' | 'dwg' | null;

/** File 전체가 아니라 판단에 쓰는 두 필드만 받는다 — 브라우저 밖에서 검증 가능해야 한다. */
export interface DocumentKindInput {
  name: string;
  type: string;
}

export function documentKindOf(file: DocumentKindInput): DocumentKind {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'dxf') return 'dxf';
  if (extension === 'pdf') return 'pdf';
  // ZWCAD·AutoCAD·CADian 의 원본 저장 형식. 파싱하지 않지만 **인식은 한다** —
  // 확장자를 accept 에서 걸러 버리면 사용자는 「미지원」으로 읽고 떠나고,
  // 받아서 정확한 안내(DXF 로 저장 → 동일 분석)를 주면 10초짜리 우회로가 된다.
  if (extension === 'dwg') return 'dwg';
  if (file.type.startsWith('image/')) return 'image';
  return null;
}

/**
 * DWG 를 왜 직접 파싱하지 않는지, 대신 무엇을 하면 되는지 — 한 곳의 정본.
 *
 * DWG 는 Autodesk 비공개 바이너리 포맷이다. 공개 파서(LibreDWG)는 GPL 이라
 * 이 저장소에 들일 수 없고, 되는 척하는 부분 구현은 도면 판정 제품에서
 * 최악의 선택이다(§2.10 — 조용히 틀린 판정). ZWCAD·AutoCAD·CADian 모두
 * DXF 저장을 기본 지원하므로 정직한 경로는 변환 안내다.
 */
export const DWG_GUIDANCE =
  'DWG는 비공개 바이너리 형식이라 직접 분석하지 않습니다. '
  + 'CAD에서 DXF로 저장하면 동일하게 분석됩니다 — '
  + 'ZWCAD/AutoCAD/CADian: 파일 → 다른 이름으로 저장 → 파일 형식에서 DXF 선택(ASCII DXF 권장) 후 다시 업로드해 주세요.';

/**
 * 파일 머리가 DWG 바이너리인가 — **확장자를 속인 파일**을 서버에서 잡는 층.
 *
 * DWG 는 첫 6바이트가 버전 표식 `AC1nnn`(AC1006~AC1032…)이다. DXF 텍스트는
 * `0` + 개행 + `SECTION` 으로 시작하므로 겹치지 않는다. `.dxf` 로 이름만 바꾼
 * DWG 를 텍스트 파서에 넣으면 알 수 없는 파싱 오류가 나가는데, 그건 사용자가
 * 고칠 수 없는 메시지다 — 여기서 잡아 DWG_GUIDANCE 로 돌려보낸다.
 */
export function isDwgBinary(head: Uint8Array): boolean {
  if (head.length < 6) return false;
  let sentinel = '';
  for (let i = 0; i < 6; i += 1) sentinel += String.fromCharCode(head[i]);
  return /^AC1\d{3}$/.test(sentinel);
}

/**
 * 바이너리 DXF — 표준이 정의한 22바이트 표식으로 시작한다.
 *
 * ZWCAD·AutoCAD 의 저장 대화상자에서 「바이너리 DXF」를 고르면 이 형식이
 * 나온다. 확장자는 같은 .dxf 라 확장자 분기로는 못 가르고, 텍스트 파서에
 * 넣으면 조용히 빈 결과가 된다 — 사용자는 「인식 못 함」만 본다.
 */
const BINARY_DXF_SENTINEL = 'AutoCAD Binary DXF';

export function isBinaryDxf(head: Uint8Array): boolean {
  if (head.length < BINARY_DXF_SENTINEL.length) return false;
  let s = '';
  for (let i = 0; i < BINARY_DXF_SENTINEL.length; i += 1) s += String.fromCharCode(head[i]);
  return s === BINARY_DXF_SENTINEL;
}

export const BINARY_DXF_GUIDANCE =
  '바이너리 DXF입니다. 저장할 때 파일 형식에서 「ASCII DXF」(텍스트 DXF)를 '
  + '선택해 다시 저장한 뒤 업로드해 주세요 — ZWCAD/AutoCAD 모두 저장 대화상자에 선택지가 있습니다.';

/**
 * .dxf 인데 DXF 텍스트 구조가 아예 안 보이는 파일 — **사내 문서보안(DRM)** 이
 * 가장 흔한 원인이다.
 *
 * 한국 기업 다수가 Fasoo·MarkAny·SoftCamp 류 DRM 을 쓰고, 이런 파일은
 * 확장자와 무관하게 내용이 암호문이다. 사내 PC 에서는 CAD 가 투명 복호화로
 * 열어 주니 사용자는 자기 파일이 암호화돼 있다는 사실 자체를 모른다 —
 * 그 파일을 웹에 올리면 서버가 읽을 수 없고, 원인을 말해 주지 않으면
 * 사용자가 고칠 방법이 없다.
 *
 * 판정은 보수적으로: 표본 안에 `SECTION` 도, DXF 그룹코드 줄 구조(숫자 줄 +
 * 값 줄 반복)도 없을 때만. 정상 DXF 는 최소 구성이어도 `0\nSECTION` 으로
 * 시작하므로 오탐 여지가 좁다.
 */
export function looksLikeDxfText(sample: string): boolean {
  if (sample.includes('SECTION')) return true;
  // 그룹코드 구조 — 공백 채운 숫자 줄이 연속되는 꼴을 관대하게 본다.
  return /^\s*\d{1,4}\s*\r?\n/.test(sample) && /\r?\n\s*\d{1,4}\s*\r?\n/.test(sample);
}

export const UNREADABLE_DXF_GUIDANCE =
  'DXF 텍스트 구조가 보이지 않습니다. 사내 문서보안(DRM — Fasoo·MarkAny·SoftCamp 등)이 '
  + '적용된 파일이면 회사 밖 서버는 내용을 읽을 수 없습니다. 보안 해제(반출 승인)된 사본으로 '
  + '업로드하거나, CAD에서 「ASCII DXF」로 다시 저장한 파일인지 확인해 주세요.';

// IDENTITY_SEAL: lib/document-kind | role=업로드 파일의 분석기 선택(확장자 우선)+판독 가능성 표식 | inputs=name,type,head | outputs=DocumentKind,guidances
