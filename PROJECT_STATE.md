---
schemaVersion: 1
project: ESA
status: active
baselineBranch: codex/sld-95-intelligence
codeBaselineCommit: e29ced9b3435f367be0e4a2e92cab40b39f699d3
updatedAt: 2026-07-20T20:25:52.9400811+09:00
trigger: architecture
changedDomains: [agent, app, components, lib, scripts]
---

# ESA 프로젝트 상태

## 목적과 현재 범위

ESA는 전기 엔지니어가 계산 입력·공식·판본·경고를 재검토할 수 있는 검색, 계산, 도면 분석, 전문팀 검토 작업대다. 현재 기준선에는 SLD 전체 스캔과 구획별 정밀 판독, `symbols`·`connections`·`text`·`logic` 4개 원본 격리 심사, 전기 불변식 교차검증, 근거 번호가 붙은 원본 오버레이와 보고서, 서명된 실도면 골든 게이트가 연결돼 있다.

## 현재 구조 요약

- `src/app`은 사용자 페이지와 서버 Route Handler의 production entry다.
- `src/agent/vision`은 전체 도면·구획·업스케일 변형을 역할별로 선택하고 독립 심사 봉투를 만든다.
- `src/agent/electrical`은 기호·문자·선의 출처를 정규화하고 전압 영역, 전원-부하 경로, 보호·접지·계산 입력을 교차검증한다.
- `src/agent/report`는 현재 도면에 유일하게 결박된 근거만 보고서와 95% 게이트에 전달한다.
- `src/lib/drawing-asset-store.ts`는 원본을 브라우저 IndexedDB에만 보관하고 SHA-256 재검증 뒤 같은 브라우저에서 다시 연다.
- `scripts/enforce.ps1`은 타입, 무경고 린트, 전체 Jest, production build, PDF fixture를 순차 차단한다.
- 상세 배선과 구조 결정은 아래 프로젝트 문서가 정본이며, 휴면 기능은 `docs/DORMANT_MANIFEST.md`에만 남긴다.

## 완료

- `symbols`·`connections`·`text`·`logic`을 서로 다른 호출·프롬프트·소스 계획으로 실행하고, 역할 누락·봉투 해시 불일치·출처 격리 실패를 합산 단계에서 HOLD로 차단했다.
- 기호, 선, 문자, 페이지, 원본 ID를 정규화한 뒤 전원-부하 방향, 다중 경로, 보호기, 전압 영역, 접지 경로와 논리 판독을 상호 대조한다.
- 실제 계산기는 현재 도면의 유일한 owner·page·edge 근거로 필수 입력이 모두 결박된 경우에만 호출하며, 모호하거나 거부된 선택 입력도 조용히 버리지 않는다.
- 보고서 원본 이미지와 기호·관계·수량에 `Sxx`·`Lxx` 번호를 부여하고 표와 오버레이의 양방향 선택을 연결했다.
- 원본 도면은 서버·보고서 JSON에 복제하지 않고 브라우저 로컬 저장소에 해시 결박해 보관한다. CSP는 이미지 `blob:`만 허용한다.
- 보고서 모바일 폭 넘침, 반복 계산 비용, 기준서 검색 결과의 접기·펼치기, 존재하지 않는 데모 보고서의 가짜 점수 노출을 수리했다.
- 95% 주장은 정확한 데이터셋 집합, 실도면 독립 라벨, 예측 해시, 평가기 버전, Ed25519 서명, 최신 영수증이 모두 맞을 때만 `verified95=true`가 된다.
- E2E 서버를 독립 포트에 결박하고 health 200/503, 계산 입력 422, 실제 필터·탭·메뉴·반응형·접근성 계약을 검증하도록 오래된 smoke 검사를 교체했다.
- 저장소에 없던 Windows 전체 게이트를 구현해 문서상 검증과 실제 실행을 일치시켰다.

## 부분 완료

- 이미지·DXF·PDF의 코드 경로와 합성 fixture는 닫혔지만 공급자별 현장 도면 정확도는 실도면 독립 라벨이 준비돼야 계량할 수 있다.
- 이메일·푸시 알림은 수신 설정과 인앱 저장만 있으며 실제 발송자는 연결하지 않았다.
- 기준서 화면은 저장소 스냅샷을 탐색하지만 관할 기관 최신 원문을 자동 동기화하지 않는다.
- 공유 인메모리 레이트 리밋은 단일 프로세스 보호만 제공한다.

## 미검증

- 서명된 `real-adjudicated` 현장 도면 데이터셋에서 symbol macro-F1, text field accuracy, edge-F1, junction accuracy, critical logic recall을 재현하는 외부 실증.
- 실제 OpenAI, Gemini, Claude 키로 같은 도면을 반복 호출한 공급자별 누락·오탐·비용·timeout.
- 대상 Supabase 마이그레이션 적용 뒤 새 세션에서 원본 메타데이터·보고서·티어를 읽는 왕복.
- Stripe 테스트 모드 Checkout→서명 웹훅→티어 반영→새 로그인→Portal 전체 흐름.
- 실제 Weaviate 컬렉션의 insert→검색→재연결과 전용 보안 스캐너 결과.

## 보류

- 현재 골든 manifest는 `claimEligible=false`이고 합성 데이터만 가리킨다. 평가 키, 예측 파일, 실도면 독립 라벨이 없으므로 `npm run gate:sld-golden`은 의도대로 exit 1이며 **95% 달성 주장은 HOLD**다.
- 운영 DB, 실결제, 외부 AI 키, 회사 도면을 사용하지 않았다. 브라우저 실증은 로컬에서 만든 비민감 합성 SLD로 수행했다.
- 코드 기준선은 `e29ced9`다. 생성된 `.next/`, `test-results/`, 이동 보관한 `.next/dev-stale-20260720`은 모두 Git ignore 범위이며 커밋하지 않는다.

## 검증

- `pwsh -NoProfile -File scripts/enforce.ps1`: exit 0.
- `npx tsc --noEmit`: exit 0.
- `npm run lint -- --max-warnings=0`: exit 0.
- `npm test -- --runInBand`: exit 0, 112개 스위트·1,015개 테스트 통과.
- `npm run build`: exit 0, Next.js 16.2.10 production build와 64개 route 항목 생성, Turbopack 경고 0건.
- `npm run gate:pdf`: exit 0, 회로·표제란·격자·오탐·12MB·비PDF 거부 fixture 9/9 통과.
- Playwright smoke: 29/29 통과. 독립 포트, 데모 fail-closed, 계산 API, 모바일 메뉴, 기준서 검색 접기·펼치기, SLD 탭, 반응형과 접근성을 확인했다.
- 브라우저 실증: 합성 SLD 원본이 1200×700으로 로드되고 데스크톱·375px 모바일에서 페이지 수평 넘침 0, 기기→표와 관계→관련 기기 양방향 선택을 확인했다.
- 독립 코드·회귀·비밀자료 심사에서 최종 P0~P2와 회사 원본·키·대형 생성물 유입 0건을 확인했다.
- `npm run gate:sld-golden`: exit 1, `verified95=false`; 실패 사유는 키·예측·실도면 데이터 부재와 claim 비활성이다.

## 다음 첫 행동

1. 회사 기밀을 제거한 대표 실도면을 별도 라벨러가 판정하고 `real-adjudicated` 데이터셋·예측·평가 서명을 만든다.
2. 골든 manifest의 정확한 데이터셋 집합과 키 지문을 승인한 뒤 receipt 생성→새 프로세스 검증→95% gate를 재실행한다.
3. 스테이징 자격증명이 준비되면 Supabase, Stripe, Weaviate, AI 공급자 순으로 write→persist→새 세션 read-back을 검증한다.

## 상세 문서

- [기능 배선 지도](docs/project/IMPLEMENTATION_MAP.md)
- [구조 결정 기록](docs/project/DECISIONS.md)
- [최신 인수인계](docs/project/handoffs/2026-07-20-sld-95-intelligence.md)
- [휴면 기능 대장](docs/DORMANT_MANIFEST.md)
- [현실화 게이트](docs/REALIZATION_PLAN.md)
