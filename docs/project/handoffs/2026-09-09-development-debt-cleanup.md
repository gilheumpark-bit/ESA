# 2026-09-09 개발 잔재·기술부채 정리

## 출발점과 범위

제품 출발 SHA는 `690ad046dd7f77cb84d5517a5b197fa7d8663752`, 작업 브랜치는 `feat/ax-precision-20260907`다. PR #71에 후속 반영하며 main 병합·운영 배포는 포함하지 않는다. 유지보수 작업이며 독립 실도면 정확도·실제 외부 서비스 검증을 대신하지 않는다.

조사 실행 `34316943116`에서 Git 추적 파일 전체, TypeScript `--noUnusedLocals --noUnusedParameters` 진단, 개발 의존성 포함 npm 감사 원문을 보존했다. 기존 임시 실험 workflow·전송 폴더는 제품 브랜치에 없었다. `.claude/launch.json`과 `.ui-craft/brief.md`는 유지하는 개발 설정·설계 기준으로 보존했다.

## 코드·의존성 정리

미사용 TypeScript 진단 27건의 import·지역 변수·계산식·비호출 XML helper를 정리했다. 호환 콜백 인자는 `_name`으로 의도를 표시하고 표준 레지스트리의 공개 재수출, 테스트 spy 생성 및 실제 단언은 유지했다. 출력하지 않던 보조 계전 값·피크전류 옛 식을 지웠지만 실제 결과식·판정은 바꾸지 않았다.

`noUnusedLocals`와 `noUnusedParameters`를 기본 타입 검사에 켰다. 기존 tsconfig 범위를 유지하므로 제외돼 있던 e2e를 전부 TypeScript 정적 검증했다고 주장하지 않는다. 모델·추론·해상도·단자 허용거리·규정값·권한·라이선스는 변경하지 않는다.

`@google/genai`와 `@tanstack/react-query`는 전체 추적 텍스트에서 package 선언·잠금파일 외 참조가 없어 직접 의존성에서 제거했다. 실제 Google AI 전송은 별도 경로이며 변경하지 않는다. 필요한 전이 의존성은 npm이 유지한다.

기준선 전체 감사는 `browserslist`, `fast-uri`, `js-yaml` 세 패키지의 high를 보고했다. 패키지 단위 집계이며 복수 advisory를 별도 패키지로 더하지 않는다. `npm update browserslist fast-uri js-yaml --package-lock-only --ignore-scripts`로 부모 버전 제약 안에서 잠금파일을 갱신하고 `npm ci`·전체/운영 감사를 수행한다. `--force`나 감사 허용치 상향은 사용하지 않는다. 최종 버전·실제 판정은 이번 검증 artifact와 PR 댓글을 따른다.

## 감사 게이트의 실행 실패 처리

기존 CLI는 npm이 exit 2로 실패해도 stdout이 정상 모양의 0건 JSON이면 exit 0으로 통과했다. 동일한 가짜 npm 입력을 실제 CLI로 실행해 **수리 전 exit 0 / 수리 후 exit 2**를 로컬에서 확인했다. 실행 실패 처리 결함이며 실제 기존 감사 보고서가 위조됐다는 주장은 아니다.

새 정책은 종료 코드·시그널·timeout·spawn 오류, npm 오류 응답, 지원 보고서 형식과 집계 일관성을 확인한다. 판정 불가는 INDETERMINATE/2, high·critical은 FAIL/1, 허용 집계는 PASS/0이다. 낮은 심각도는 total에 남기며 기존 critical/high 허용치 0을 유지한다. 원문 stderr·자격증명은 출력하지 않는다.

`gate:audit`는 운영 범위, `gate:audit:all`은 개발 의존성 포함 범위다. Windows에서도 실제 npm CLI를 Node로 실행하고 shell 재해석을 사용하지 않는다. 0 기준선에서 불가능하던 과거 ratchet 분기도 제거했다.

## 재유입 방지·증거 보존

`gate:hygiene`는 Git 인덱스의 임시 전송/실험 폴더·환경 파일·빌드/편집 잔재를 검사한다. 로컬 파일을 지우지 않으며 Git 목록을 읽을 수 없으면 exit 2다. ignore·CI·Windows 진입점에 연결했다.

교보재, 과거 회귀/실증, `output/manual/`의 기존 매뉴얼과 유지하는 설정은 나이나 용량만 보고 삭제하지 않았다. Git 이력을 재작성하거나 비밀정보 유출 전수 심사를 완료한 작업도 아니다.

새 유지보수 계약 42개는 실제 CLI의 두 감사 범위, 실패/JSON/집계 오류, 실제 Git staged 파일, 설정·교보재 보존을 검사하며 로컬 Node22에서 통과했다. 같은 계약을 표준 Jest 경로에도 연결했다.

Playwright가 재시도 후 통과하더라도 trace·JSON을 보존하도록 CI의 always artifact를 추가했다. 기존 timeout·retry 정책·단언은 유지하며 증거 보존만으로 `UIV-001`을 해결했다고 하지 않는다.

## 상태 문서·남은 부채

`PROJECT_STATE.md`는 최신 연결 구조·검증 경계·남은 작업의 요약으로 바꿨다. 이전 본문 전체는 [보존본](2026-09-09-project-state-before-cleanup.md)에 남기고 상대 링크만 이동했다. `codeBaselineCommit`은 미래의 문서 커밋이 아니라 실제 출발 SHA다. 열린 항목 집계와 OPEN 행이 어긋나면 문서 검사에서 실패한다.

활성 부채는 `DEBT-SAFETY-001`, `DEBT-UI-001`/`UIV-001`, `DEBT-ARCH-001` 세 건이다. 안전 상수의 판본·근거 화면, 재계산 간헐 실패, 빠른/전체 작업 통합은 이번에 닫지 않았다. TODO를 지우거나 환경 미구성을 완료로 표시하지 않는다.

`role-runner.ts`는 barrel 재수출과 Google 전송 회귀가 있어 보존했다. production 호출은 없으며 현재 council과 별개 호환 모듈임을 휴면 대장에 명시했다.

## 재실행과 최종 판정

```bash
npm ci
npm run gate:hygiene
npm run check:docs
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test -- --ci --coverage --forceExit
npm run test:scripts
npm run gate:audit
npm run gate:audit:all
npm run gate:sld-v3-contract
npm run gate:snapshot
npm run build
```

PDF·Playwright는 독립 production 서버를 사용한다. 최종 제품 파일을 시험한 실행과 반영 커밋, 실제 검사·감사·빌드·PDF·브라우저 결과는 PR #71 검증 댓글과 원시 artifact를 따른다. 실패·미실행을 통과로 집계하지 않고 실행별 수를 중복 합산하지 않는다.

PowerShell 실행 목록을 갱신했지만 Windows 실실행 여부는 별도다. 실제 AI·계정·DB·결제는 이번 유지보수 검사의 범위가 아니다.
