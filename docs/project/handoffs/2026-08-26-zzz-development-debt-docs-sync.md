---
schemaVersion: 1
project: ESA
status: active
baselineBranch: main
codeBaselineCommit: 430e2f0edbc3246b323561cafe47c31e512c4218
updatedAt: 2026-08-26T02:54:01+09:00
trigger: files
changedDomains: [app, components, engine, scripts, config, docs]
---

# 개발 부채·문서 정본화 인수인계

## 결론

실행 결과와 어긋난 감사 기준선, 서버·브라우저가 갈릴 수 있던 환경 예제, 코드에만
남아 있던 안전 TODO, 이전 코드 기준선을 가리키던 핵심 문서를 정리했다. 활성 부채,
휴면 기능, 부분 구현·미실증을 서로 다른 정본으로 분리해 다음 작업자가 한 목록을
완료 목록으로 오독하지 않게 했다.

## 변경

- 운영 의존성 감사 기준선을 실제 `critical 0 · high 0`으로 내렸다. Windows에서
  `npm.cmd`를 셸로 호출하지 않고 현재 npm CLI 파일을 Node가 직접 실행한다.
- 감사 실행 실패, 빈 출력, 비JSON, `metadata.vulnerabilities` 형식 변경, 잘못된
  취약점 수는 모두 판정 불가 exit 2로 닫는다.
- `.env.example`에 `OPEN_BETA`와 `NEXT_PUBLIC_OPEN_BETA`를 같은 값으로 싣고,
  문서 게이트가 두 키의 존재·동일 값을 검사한다.
- `DEBT-SAFETY-001`을 `docs/TECHNICAL_DEBT.md`에 등록했다. 절연장갑 Class 1~4
  값은 이번 배치에서 임의 수정하거나 검증 완료로 올리지 않았다.
- `ARCHITECTURE`, `API_REFERENCE`, `IMPLEMENTATION_MAP`, `PROJECT_STATE`,
  `README`, `CHANGELOG`, 문서·인수인계 색인을 현재 코드 기준선에 맞췄다.
- AI 연결 화면은 ChatGPT 계정, 공급자 API 키, 로컬 AI 서버의 세 구역이라는 현재
  UI와 저장 경계를 문서에도 동일하게 반영했다.

## 이유

감사 게이트가 이미 사라진 취약점 9건을 계속 허용하면 새 high 취약점 일부가 들어와도
기준선 아래에서 통과할 수 있다. 또한 `OPEN_BETA` 한쪽만 예제에 두면 API는 열리고
브라우저 제어는 닫히는 배포가 생길 수 있다. 안전 상수 TODO는 삭제하면 위험이
숨고, 근거 없이 값을 바꾸면 더 위험하므로 폐쇄 조건이 있는 식별자로 전환했다.

## 사용자 소유 변경

회사 도면, 실제 API 키, 계정 토큰, 로컬 평가 영수증은 읽거나 커밋하지 않았다.
기존 사용자의 제품 코드와 문서는 되돌리지 않았고, 현재 main의 연결 설정 변경을
문서 정본에 반영했다.

## 완료

- 감사 기준선과 실행 방식 수리.
- 오픈베타 환경 예제와 자동 문서 검사 수리.
- 열린 활성 코드 부채의 식별자·억제책·폐쇄 조건 정본화.
- 휴면·부분 구현·미검증·활성 기술부채의 문서 경계 분리.
- AI 연결 관리와 핵심 문서 기준 커밋 동기화.

## 부분 완료

`DEBT-SAFETY-001`은 추적과 억제책을 정리했지만 값의 최신 표준 판본 대조와 앱 내부
근거 화면은 만들지 않았다. 이 항목은 숨기거나 임의 종결하지 않고 열린 부채로 남긴다.

## 미검증

- IEC 60903의 적용 판본과 Class 1~4 값에 대한 공식 원문 대조.
- 기존 `PROJECT_STATE`에 기록된 외부 모델 반복 정확도, 운영 Supabase·Stripe·
  Weaviate 왕복은 이번 문서 정리 범위에서 재실행하지 않았다.

## 보류

- 열린 개발 부채는 `DEBT-SAFETY-001` 1건이다. 공신력 있는 판본과 제품 내 근거
  경로가 정해지기 전에는 닫지 않는다.
- 기존 부분 구현·휴면 기능·외부 실증 항목은 이번 정리로 상태가 바뀌지 않았다.

## 검증

- `npm run gate:audit`: critical 0 · high 0, exit 0, DEP0190 경고 없음.
- `npm run check:docs`: 82개 문서 링크·색인과 환경 키 계약, exit 0.
- 수정 스크립트·안전 상수의 ESLint: 경고 없이 exit 0.
- `scripts/enforce.ps1`: 문서, TypeScript, 무경고 전체 ESLint, 전체 Jest
  349 suites·4,269 tests, production build 66페이지까지 통과했다. 마지막 PDF 단계는
  검증 서버 미기동으로 exit 2였다.
- 같은 production build를 3010 포트에 기동한 뒤 `npm run gate:pdf`를 보충 실행해
  실제 `/api/pdf-drawing` 17/17·exit 0을 확인하고 서버를 종료했다.

## 다음 첫 행동

`DEBT-SAFETY-001`에 적용할 IEC 60903 판본과 공신력 있는 원문을 고정한다. 같은 근거를
기준 화면과 출력 영수증에서 조회할 수 있게 만들 수 없다면 Class 1~4를 앱 주장
상수에서 제거한다.
