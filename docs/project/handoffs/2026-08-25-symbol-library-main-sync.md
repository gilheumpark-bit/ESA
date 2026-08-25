---
schemaVersion: 1
project: ESA
status: active
baselineBranch: main
codeBaselineCommit: 2da4bd46d459ffc79cad193709637c1eadfa71ca
updatedAt: 2026-08-25T23:59:41+09:00
trigger: files
changedDomains: [agent, app, engine, lib, docs]
---

# 고객사 심볼 라이브러리·메인 동기화 인수인계

## 변경

- AI 연결이 없는 벡터 DXF·PDF도 V3 전체 문서 경로를 실행하는 `vectorOnly` 모드를 연결했다.
- 고객사별 DXF 블록을 기하 지문과 블록명 별칭으로 등록·재사용하는 이동식 JSON 라이브러리를 추가했다.
- 미인식 블록을 이름·지문·개수로 반환하고, SLD 화면에서 다음 등록에 쓸 JSON을 제공한다.
- 동기 V3 분석이 PARTIAL 뒤 재개될 때 최초 심볼 라이브러리가 작업 메타데이터에서 빠지던 결함을 회귀 테스트로 재현하고 수리했다.
- 계산기 단계 입력의 최솟값 위반이 조용히 무시되는 경로와 검색 화면의 모바일 수평 넘침을 수리했다.
- 2026-08-21 상태 기준선 이후 7개 제품 커밋·26개 파일 변경을 현재 정본 문서에 반영했다.

## 이유

회사마다 CAD 블록명은 달라도 블록 정의 기하는 반복된다. 일반 이름 휴리스틱만 쓰면 낯선 블록을 부하로 뭉개고 계산까지 오염시킬 수 있으므로, 사용자가 확정한 회사별 지식을 일반 추정보다 먼저 적용하고 모르는 항목은 다음 등록 재료로 남기는 축적 루프가 필요했다. 최신본 검증 중 최초 분석에는 적용된 라이브러리가 재개 경로에서 소실되는 마지막 배선 결함도 확인됐다.

## 사용자 소유 변경

회사 도면, 테스트 키, 계정 토큰과 로컬 평가 영수증은 읽거나 커밋하지 않았다. 원격 Dependabot 브랜치와 사용자의 다른 작업 브랜치는 수정·삭제하지 않았다.

## 완료

- 매칭 우선순위는 기하 지문→블록명 별칭→내장 휴리스틱→미식별 보고다.
- 라이브러리는 `/api/dxf`와 `/api/drawing-jobs`에서 같은 검증 계약을 사용하며 1MB 초과·무효 JSON은 400으로 닫힌다.
- V3 최초 실행, deferred run, 동기 PARTIAL 저장과 resume가 같은 검증본을 사용한다.
- 최신 제품 코드 수리는 `72cb32231207a7bad84707239e33ab163d8dd9f6`, 이를 설명하는 프로젝트 기준선은 `2da4bd46d459ffc79cad193709637c1eadfa71ca`로 고정했다.

## 부분 완료

고객사 심볼 라이브러리는 DXF `INSERT`와 블록 정의에만 적용된다. 이미지·래스터 PDF 심볼은 기존 Vision 판독 범위이며, JSON 라이브러리를 픽셀 학습 데이터로 사용하지 않는다.

## 미검증

- 서로 다른 공개 DXF 묶음에서 지문 충돌률, 별칭 오분류율과 미식별 회수율을 독립 라벨로 대조하지 않았다.
- 실제 고객사 파일을 사용하지 않았으므로 회사별 일반화 성능은 주장하지 않는다.

## 보류

GitHub Dependabot PR #61~#70은 Verify 통과 뒤 Live gates가 실패한 `UNSTABLE` 상태다. 실패 원인을 분리하지 않은 채 main에 병합하지 않았다.

## 검증

- 재개 회귀 테스트는 수리 전 라이브러리 없는 `sourceMetadata`를 받아 실패했고, 수리 후 통과했다.
- 코드 기준선 `72cb322`에서 전체 Jest, `npx tsc --noEmit`, 수정 파일 ESLint `--max-warnings=0`, Next.js production build가 exit 0이었다.
- `npm run check:docs`는 현재 Markdown 링크와 색인을 모두 확인하고 exit 0이었다.
- 부모 기능 커밋 `64619d0`의 standalone `/api/dxf`에 합성 DXF와 고객사 라이브러리를 실제 multipart 업로드해 HTTP 성공, 라이브러리 매칭 1건, 기기 5개, 관계 4개, confidence 0.95를 확인했다.
- `64619d0` GitHub Actions Verify는 성공했다. 최종 문서 커밋은 push 뒤 같은 CI로 다시 확인한다.

## 다음 첫 행동

공개 DXF를 작도 관례별로 나누고 독립 기기 라벨을 붙인 뒤, 회사별 라이브러리의 지문 충돌·별칭 오분류·미식별 회수율을 측정한다. Dependabot PR은 각 Live gate 실패 원인을 재현해 green이 된 항목만 별도 병합한다.
