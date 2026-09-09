# ESA 기술부채 대장

> 기준 코드: `690ad046dd7f77cb84d5517a5b197fa7d8663752` · 2026-09-09 (이번 정리의 출발점)
> 열린 활성 코드 부채: 3건

이 문서는 production 경로에 남아 있지만 현재 배치에서 안전하게 제거할 수 없는
개발 부채만 추적합니다. 의도적으로 꺼 둔 기능은 [휴면 기능 대장](DORMANT_MANIFEST.md),
외부 실증이 필요한 성능·운영 항목은 [현재 프로젝트 상태](../PROJECT_STATE.md), 과거에
닫힌 작업의 상세는 [변경 이력](../CHANGELOG.md)과 [인수인계 색인](project/HANDOFFS.md)이
맡습니다.

## 열린 부채

| ID | 위험·영향 | 위치 | 현재 억제책 | 폐쇄 조건 | 상태 |
|---|---|---|---|---|---|
| `DEBT-SAFETY-001` | 절연장갑 Class 1~4 값은 채팅 출력 교차검증에 쓰이지만 앱의 다른 기준 화면에는 같은 값을 확인할 경로가 없다. 따라서 앱 내부 상수가 사실상 출처가 될 수 있다. | `src/engine/llm/app-asserted-constants.ts` | 등급 식별자 없는 전압은 통과시키지 않고, 사용자가 적은 값과 상충하면 출력 필터가 차단한다. 현재 값 자체의 최신 판본 대조는 이번 배치에서 수행하지 않았다. | 적용할 IEC 60903 판본과 공신력 있는 원문을 고정하고, 기준 화면·근거 영수증에서 같은 출처를 조회하게 한 뒤 상충·판본 회귀를 추가한다. 그 경로를 만들지 않으면 Class 1~4를 앱 주장 상수에서 제거한다. | `OPEN` · 도메인/안전 검토 필요 |

| `DEBT-UI-001` (`UIV-001`) | 재계산 후 결과 영수증이 제한시간 안에 사라지지 않는 간헐 현상. | `src/hooks/useCalculator.ts`, `src/components/CalculatorForm.tsx`, `e2e/frontend-public-workflows.spec.ts` | 입력/요청 소유권·취소를 유지하고 실패 trace·JSON을 CI 성공 여부와 무관하게 보존한다. 기존 재시도 수·타임아웃은 늘리지 않는다. | 추적으로 원인을 특정하고 수리 전 실패/수리 후 반복 통과를 확인한다. 단순 미재현으로 닫지 않는다. | `OPEN` · 프런트엔드/QA |
| `DEBT-ARCH-001` | 빠른 분석과 V3가 별도 업로드/실행 경로라 공통 파싱·작업 상태의 중복 가능성이 있다. 중복 비용 비율은 아직 측정하지 않았다. | `src/app/(with-nav)/tools/sld/page.tsx`, `src/app/api/dxf/route.ts`, `src/app/api/drawing-jobs/route.ts` | 기존 결과·취소·재개를 유지하고 동일 문서 실행 안의 준비 결과만 재사용한다. | 단일 작업의 빠른/정밀 결과, 권한·버전·취소·재개·사용량 회귀와 실측 비교를 통과한다. | `OPEN` · 분석/플랫폼 |

## 이번 배치에서 닫은 부채

| ID | 종결 내용 | 증거 |
|---|---|---|
| `DEBT-OPS-001` | 실제 취약점이 0건인데 `high 9`를 허용하던 감사 기준선을 0으로 내리고, Windows의 `shell: true` npm 호출을 현재 npm CLI의 Node 직접 실행으로 교체했다. 실행 실패·비JSON·형식 변경도 판정 불가로 닫는다. | `npm run gate:audit` → critical 0 · high 0 · exit 0, DEP0190 경고 없음 |
| `DEBT-CONFIG-001` | 서버 `OPEN_BETA`만 예제에 있어 브라우저 기능 게이트와 어긋날 수 있던 설정을 `NEXT_PUBLIC_OPEN_BETA`와 한 쌍으로 만들었다. | `scripts/check-docs.mjs`가 두 키의 존재·동일 값을 검사, `npm run check:docs` exit 0 |

### 2026-09-09 정리

| ID | 처리 내용 | 폐쇄 확인 |
|---|---|---|
| `DEBT-CODE-001` | 미사용 지역 선언·import·계산식·XML helper 제거. 호환 인자는 명시적으로 미사용 표시. | noUnusedLocals/noUnusedParameters를 기본 타입 검사에 연결. 기존 계산/도면 결과 회귀와 함께 확인. |
| `DEBT-OPS-002` | 개발 의존성까지 critical/high 0 정책 확대. URI/YAML/브라우저리스트 잠금 의존성을 부모 제약 내 패치. | npm ci, gate:audit:all, raw audit의 최종 버전·판정은 이번 인수인계와 CI를 따른다. |
| `DEBT-CI-001` | npm 프로세스 실패인데 정상 모양 JSON만 읽고 통과하던 경로 차단. | 실제 CLI에 npm exit 2/zero JSON을 주면 기존 exit 0, 수정 후 exit 2. 회귀 검사 추가. |
| `DEBT-MAINT-001` | 임시 작업공간·생성물의 재커밋 차단, 오래된 상태 문서 보존·현재 정본 분리. | gate:hygiene, 실제 Git 인덱스 회귀, check:docs. 과거 실증·교보재·매뉴얼을 삭제하지 않는다. |

이번 변경의 정확한 최종 검증은 [개발 부채 정리 인수인계](project/handoffs/2026-09-09-development-debt-cleanup.md)와 해당 HEAD의 CI를 따른다. 미실행 운영 조건을 완료로 합산하지 않는다.

## 갱신 규칙

- 열린 항목에는 반드시 코드 위치, 현재 억제책, 폐쇄 조건을 적습니다.
- `TODO`·`FIXME`를 단순 삭제해 부채를 숨기지 않습니다. 안전하게 닫지 못한 항목은
  `DEBT-*` 식별자와 이 문서를 함께 갱신합니다.
- 코드에서 제거하거나 폐쇄 조건을 충족한 항목만 닫힌 부채로 이동합니다.
- 부분 구현, 휴면, 미실증을 이 문서에 중복 등록하지 않습니다.
