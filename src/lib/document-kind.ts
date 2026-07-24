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

export type DocumentKind = 'dxf' | 'pdf' | 'image' | null;

/** File 전체가 아니라 판단에 쓰는 두 필드만 받는다 — 브라우저 밖에서 검증 가능해야 한다. */
export interface DocumentKindInput {
  name: string;
  type: string;
}

export function documentKindOf(file: DocumentKindInput): DocumentKind {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'dxf') return 'dxf';
  if (extension === 'pdf') return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  return null;
}

// IDENTITY_SEAL: lib/document-kind | role=업로드 파일의 분석기 선택(확장자 우선) | inputs=name,type | outputs=DocumentKind
