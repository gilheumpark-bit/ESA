---
schemaVersion: 1
project: ESA
status: active
baselineBranch: main
codeBaselineCommit: 76b85b804f8ea6fb86e10a5e55fa999a4883ef56
updatedAt: 2026-08-08T16:16:33+09:00
trigger: commits
changedDomains: [agent, engine, lib, docs, scripts]
---

# 8월 7일 Claude 작업 검증 결함 수리 인수인계

## 변경

- 로컬 ChatGPT 실패 메시지에서 공급자 자유 문자열을 제거하고 알려진 상태·오류 코드만 허용했다.
- stderr 진단 코드를 시작 중이거나 실행 중인 단일 턴에만 귀속시켜 다음 턴으로 남지 않게 했다.
- 서로 다른 미등록 기기 타입이 모두 `other`로 정본화되더라도 공간 그래프에서 합쳐지지 않게 하고 원래 타입 후보를 보존했다.
- `cutout_switch`를 `fuse` 골든 축으로 집계하고 전체 닫힌 기기 타입의 골든 축을 제품 어휘와 교차검증했다.
- 모델 매트릭스 재개 조건에 요청 반복 횟수를 포함했다.
- PDF.js 임의 JavaScript 실행 취약 범위를 벗어나도록 `pdfjs-dist`를 6.2.108로 올리고, PostCSS와 취약 간접 의존성을 안전 패치 버전으로 갱신했다.
- Next.js 16.3에서 제거된 `experimental.viewTransition` 플래그를 삭제했다. 앱은 View Transition 컴포넌트를 사용하지 않고 CSS의 브라우저 지원 가상 요소만 유지한다.
- GitHub 공식 최신 `actions/checkout` v7을 두 CI job에 적용해 Node 20 지원 종료 경고를 제거했다.

## 이유

2026-08-07 Claude 변경을 현재 원격 기준에서 독립 재검증한 결과, 기존 정상 경로 테스트가 놓친 보안·공간 병합·평가·반복 실험 경계 결함 5건이 실제로 재현됐다. 원인별 회귀 테스트가 기존 코드에서 실패하는 것을 먼저 확인한 뒤 제품 경계에서 수리했다.

## 사용자 소유 변경

기존 `main`, Claude 작업 트리, 테스트 키, 로컬 도면, 생성된 모델 영수증은 수정하거나 커밋하지 않았다. 수리는 원격 최신 커밋에서 분리한 `codex/aug7-verified-fixes` 작업 트리에서 수행했다.

## 완료

- 키 모양의 짧은 실패 사유가 오류 메시지에 노출되지 않는다.
- 이전 턴의 사용량 제한 진단이 다음 실패 턴에 붙지 않는다.
- 겹친 `mystery_sensor`와 `custom_actuator`가 한 `other` 기기로 병합되지 않는다.
- `cutout_switch` 최소 수량이 `fuse` 축에서 판정된다.
- `--repeat=3 --resume`은 `runCount=3` 영수증만 재사용하며 기존 단일 실행 영수증은 재실행 대상으로 남긴다.
- `npm audit`에서 검출된 고위험 5건·보통 2건이 모두 제거됐고 PDF 업로드 실경로가 같은 fixture 계약을 유지한다.

## 부분 완료

실시간 공급자 호출 없이 결정론 경계와 로컬 프로토콜을 수리했다. 로컬 ChatGPT의 실제 할당량·미로그인·모델 거부 메시지는 기존 실측 근거를 유지하지만 이번 배치에서 계정 호출을 추가하지 않았다.

## 미검증

- 실제 로컬 ChatGPT 프로세스가 동시 여러 턴의 stderr에 턴 식별자를 제공하는지는 프로토콜에 보장되지 않는다. 그래서 동시 턴에서는 오진 대신 분류를 생략하도록 닫았다.
- 외부 모델별 도면 정확도·비용·시간은 이번 수리 범위가 아니며 재측정하지 않았다.

## 보류

Gemini 크레딧이 소진되어 사용자 지시대로 Google 모델 호출을 수행하지 않았다. 이 제외는 결정론 수리와 회귀검증의 통과 여부에는 영향을 주지 않지만 공급자별 실증 근거를 갱신하지 않는다.

## 검증

- 재현 단계: 신규 보안·stderr·미등록 타입·COS/fuse·반복 재개 테스트가 수리 전 각각 실패했다.
- `src/lib/__tests__/chatgpt-local-protocol.test.ts`: 18/18 통과.
- `src/agent/vision/__tests__/spatial-graph.test.ts`: 20/20 통과.
- `npm run test:scripts`: 59/59 통과.
- `npx tsc --noEmit --incremental false`: exit 0.
- 전체 ESLint `--max-warnings=0`: exit 0.
- 전체 Jest: 341 suites·4,164 tests 통과, 2 suites·7 tests skip.
- `npm run check:docs`: 73개 Markdown 링크·색인 통과.
- `npm run build`: Next.js 16.3 production build 66페이지, exit 0.
- `npm run gate:pdf`: 로컬 production API 왕복 17/17 통과.
- `npm audit --audit-level=moderate`: 취약점 0건.

## 다음 첫 행동

현재 공개 도면 병목은 코드가 자동으로 만들 수 없는 독립 기호·문자·관계 정답표다. 다음 품질 실험은 Gemini 호출을 재개하는 것이 아니라 기존 공개 교보재에 전기 실무자 2인 블라인드 라벨과 불일치 합의 로그를 먼저 고정한 뒤, 동일 snapshot에서 외부 모델을 비교하는 순서로 진행한다.
