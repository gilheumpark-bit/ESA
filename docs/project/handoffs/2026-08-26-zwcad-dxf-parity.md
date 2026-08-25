---
schemaVersion: 1
project: ESA
status: active
baselineBranch: main
codeBaselineCommit: 9ede686661d962155418200143eeb4e9e144717a
updatedAt: 2026-08-26T00:35:26+09:00
trigger: files
changedDomains: [agent, app, lib, docs]
---

# ZWCAD DXF 호환 경로 인수인계

## 결론

ZWCAD용 별도 분석기를 추가하지 않았다. 기존 AutoCAD 호환 ASCII DXF 입력을 공용 경계로 삼아 ZWCAD가 저장한 도면도 같은 ESA 파서→토폴로지→계산→제안 경로를 사용한다.

## 변경

- `$DWGCODEPAGE`를 읽는 공용 디코더를 추가해 한국어 `ANSI_949`를 포함한 지원 코드페이지를 대체문자 없이 복원한다.
- 빠른 `/api/dxf`, V3 `/api/drawing-jobs`, 계통도팀과 평면도팀의 DXF 판독을 같은 디코더로 통일했다.
- V3가 바이너리 DXF를 분석기로 넘겨 늦게 실패하던 경로를 빠른 API와 같은 400 안내로 닫았다.
- 응답 영수증에 실제 입력 인코딩과 선언 코드페이지를 남기고 OpenAPI·사용자 안내·구현 지도를 같은 범위로 맞췄다.

## 이유

기존 AutoCAD 지원은 제품 전용 연동이 아니라 ASCII DXF 공용 파서였다. ZWCAD도 같은 DXF 구조를 사용하지만 한국어 도면의 `ANSI_949` 바이트가 UTF-8로 읽혀 기하를 유지한 채 기기명·정격 문자만 깨질 수 있었고, V3는 바이너리 DXF를 파서까지 넘기는 실패 계약 차이가 있었다. CAD별 분석기를 복제하지 않고 이 두 입력 차이만 공용 경계에서 흡수했다.

## 사용자 소유 변경

회사 도면, API 키, 계정 토큰과 로컬 평가 영수증은 읽거나 커밋하지 않았다. 검증 입력은 코드 안에서 생성한 비민감 합성 DXF 바이트만 사용했으며, 원격 브랜치와 사용자의 다른 파일은 수정하지 않았다.

## 완료

- ZWCAD 한국어 `ANSI_949` 입력이 빠른 API와 V3·전문팀 경로에서 같은 문자열로 복원된다.
- 기호·문자·선은 기존 AutoCAD 호환 파서와 토폴로지로 들어가며 CAD 제품별 판정 분기는 없다.
- 미지원 코드페이지, DWG, 바이너리 DXF와 읽을 수 없는 DXF는 분석을 계속하지 않고 사용자가 고칠 수 있는 400 안내를 반환한다.

## 부분 완료

지원 범위는 ESA가 기존에 제공하던 AutoCAD 호환 ASCII DXF 범위다. ZWCAD 원본 DWG와 바이너리 DXF를 새로 해석하는 기능은 포함하지 않는다.

## 미검증

- 여러 ZWCAD 버전과 회사별 커스텀 블록을 가진 실제 저장본의 독립 라벨 정확도.
- `ANSI_949` 외 지원 코드페이지별 실제 ZWCAD 내보내기 왕복.

## 보류

DWG·바이너리 DXF 직접 파싱은 기존 AutoCAD 지원 범위 밖이며, 무료 ESA 공용 경로에서는 ASCII DXF 재저장 안내를 유지한다.

## 검증

- 전체 Jest 347 suites·4,242 tests, 타입 검사, 경고 0 ESLint, production build 66페이지가 통과했다.
- production 서버를 기동한 PDF 실경로 게이트는 17/17 통과했다.
- 실제 `/api/dxf`에 비민감 합성 ZWCAD형 `AC1027`·`ANSI_949` 파일을 multipart 업로드해 HTTP 200, 한글 보존, 변압기·VCB·모터 3기기, 결선 2건, topology valid와 issues 0을 확인했다.
- 수리 전에는 공용 디코더가 없었고 V3의 바이너리 DXF 입력이 500으로 진행되는 RED 회귀를 확인했다. 수리 후 관련 4 suites·26 tests가 통과했다.

## 다음 첫 행동

회사 기밀이 아닌 ZWCAD ASCII DXF 표본을 버전·코드페이지·블록 관례별로 모아, 기존 AutoCAD 표본과 동일한 기호·문자·관계 정답표로 비교한다.
