---
schemaVersion: 1
project: ESA
status: active
baselineBranch: codex/sld-v3-completion
codeBaselineCommit: 896ae31f5faf764aa3b44acfd8573c9d4a0cec77
updatedAt: 2026-07-21T06:53:49.8775095+09:00
trigger: architecture
changedDomains: [agent, app]
---

# ESA 프로젝트 상태

## 목적과 현재 범위

ESA는 전기 엔지니어가 계산 입력·공식·판본·경고를 재검토할 수 있는 검색, 계산, 도면 분석, 전문팀 검토 작업대다. 현재 기준선에는 SLD 전체 문서 열거와 예산 내 페이지 렌더, `symbols`·`connections`·`text`·`logic`·coverage auditor 역할별 심사, 공간 근거 그래프, 수량·관계·계산·제안, 취소·재개·정정, 외부 서명 평가 게이트가 연결돼 있다.

## 현재 구조 요약

- `src/app`은 사용자 페이지와 서버 Route Handler의 production entry다.
- `src/agent/vision`은 전체 도면·구획·업스케일 변형을 역할별로 선택하고 독립 심사 봉투를 만든다.
- `src/agent/electrical`은 기호·문자·선의 출처를 정규화하고 전압 영역, 전원-부하 경로, 보호·접지·계산 입력을 교차검증한다.
- `src/agent/report`는 현재 도면에 유일하게 결박된 근거만 보고서와 95% 게이트에 전달한다.
- `src/agent/drawing`은 V3 전체 문서 작업, PDF/DXF 전체 좌표 문자, 페이지·구획 ledger, 교차 페이지 관계, 수량·제안·정정·평가기 계약을 소유한다.
- `DRAWING_JOB_STORE_DIR`은 다중 인스턴스가 공유하는 작업·암호화 원본 임대 볼륨이다. 운영 미설정 시 취소·재개는 503으로 닫힌다.
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
- V3 전체 문서 API(`/api/drawing-jobs`, `run`, `resume`, `corrections`)와 `/tools/sld` 작업 상태·폴링·새로고침 복구를 연결했다.
- PDF는 요청 페이지·페이지 수·총 픽셀·시간·취소 예산 안에서만 순차 렌더하며, 벡터 역할별 감사 영수증이 빠지면 COMPLETE가 되지 않는다.
- PDF/DXF 파서의 모든 좌표 문자를 V3 근거 그래프에 전달하고, PT/PPT 부분문자 병합·모호 OCR 페이지 참조·전압 없는 자동 연결을 차단했다.
- 부분 coverage에서는 접지 없음·보호기 없음·고아 장치를 SUPPORTED로 확정하지 않고 HOLD한다.
- 정정 API에 문서 버전 compare-and-swap, 요청 고유키, 문자/종류/기기명 분리, 전후 재계산 영수증을 넣었다.
- V3 평가기는 문자 공간, 관계·페이지 방향, 실제 3회 반복 영수증, 서명 지표 재계산을 검증하며 구형 manifest gate와 분리된다.
- 다중 페이지 PDF 파서에 페이지별 소유 바이트를 전달해 첫 페이지 뒤 원본 버퍼가 분리되는 결함을 막고, 총 픽셀 예산을 요청 페이지 전체에 분배해 뒤 페이지 탈락을 막았다.
- 반복 정격을 고유 기기 태그로 오인하던 교차 페이지 조합을 차단하고, 모호한 기호·선·문자·관계가 남으면 페이지 처리가 끝나도 판독 상태를 HOLD로 표시한다.
- JSON 왕복 해시, `0.400kV`·`6.600kV` 전압 파싱과 800kV 계산 경계, 선분 기하 방향 오독, 다단 보호 경로를 반증 테스트로 수리했다. 방향·보호가 확정되지 않으면 FAIL 대신 HOLD로 남긴다.
- 길이·케이블 규격·계통전압·전류·도체·상·역률이 모두 원본에 있을 때만 정본 전압강하 계산기를 호출하며, 누락 입력의 SKIPPED 영수증과 사유를 최종 합성까지 보존한다.
- 실행 중 정정은 409로 차단하고 stale 파일락을 복구하며, VLM 예산을 재개 횟수 전체에 누적한다. 요청 연결이 끊겨도 작업을 자동 취소하거나 재개용 원본 임대를 즉시 소각하지 않는다.
- 벡터 감사는 실제 검출·토폴로지 결과에 따라 역할별로 기록하고, 저장소 미구성 동기 API는 불투명 500 대신 503을 반환한다.
- V3 화면의 작업·페이지·확신·제안 상태를 한국어화하고 수정 연타를 차단했다. SVG 오버레이는 의미 토큰과 키보드 초점 표식을 사용한다.
- 체크인된 합성 DXF를 production 분석기→V3 평가기→예측·영수증 writer로 실행하는 `npm run test:sld-benchmark` 진입점과 브라우저 업로드→기기 5개·관계 4개 E2E를 연결했다.

## 부분 완료

- 이미지·DXF·PDF의 코드 경로와 공개 PDF 전체 페이지 왕복은 닫혔다. 외부 AI 공급자별 정밀 판독 정확도는 같은 공개 자료의 독립 정답 라벨과 실제 키가 준비돼야 계량할 수 있다.
- 이메일·푸시 알림은 수신 설정과 인앱 저장만 있으며 실제 발송자는 연결하지 않았다.
- 기준서 화면은 저장소 스냅샷을 탐색하지만 관할 기관 최신 원문을 자동 동기화하지 않는다.
- 공유 인메모리 레이트 리밋은 단일 프로세스 보호만 제공한다. V3 작업 저장은 내구 볼륨으로 전환했지만 전역 레이트 리밋은 별도다.
- 비로그인 팀 검토 보고서는 현재 브라우저 `sessionStorage`에서만 다시 열 수 있다. `/api/reports/[id]` reader는 있지만 이 경로의 서버 writer는 없으며 화면도 다른 세션 보관을 약속하지 않는다.

## 미검증

- 독립 정답을 붙인 공개 교보재 데이터셋에서 symbol macro-F1, text field accuracy, edge-F1, junction accuracy, critical logic recall을 재현하는 외부 평가.
- 실제 OpenAI, Gemini, Claude 키로 같은 도면을 반복 호출한 공급자별 누락·오탐·비용·timeout.
- 대상 Supabase 마이그레이션 적용 뒤 새 세션에서 원본 메타데이터·보고서·티어를 읽는 왕복.
- Stripe 테스트 모드 Checkout→서명 웹훅→티어 반영→새 로그인→Portal 전체 흐름.
- 실제 Weaviate 컬렉션의 insert→검색→재연결과 전용 보안 스캐너 결과.

## 보류

- 현재 골든 manifest는 `claimEligible=false`이고 합성 데이터만 가리킨다. 평가 키, 예측 파일, 실도면 독립 라벨이 없으므로 `npm run gate:sld-golden`은 의도대로 exit 1이며 **95% 달성 주장은 HOLD**다.
- 운영 DB, 실결제, 외부 AI 키, 회사 도면을 사용하지 않았다. 도면 왕복은 출처가 기록된 공개 PDF와 비민감 합성 SLD로 수행했다.
- 코드 기준선은 `896ae31`이다. 생성된 `.next/`, `test-results/`, 검증용 작업 JSON과 브라우저 임시 업로드는 Git에 포함하지 않았다.

## 검증

- `pwsh -NoProfile -File scripts/enforce.ps1`: exit 0.
- `npx tsc --noEmit`: exit 0.
- `npm run lint -- --max-warnings=0`: exit 0.
- `npm test -- --runInBand`: exit 0, 136개 스위트·1,115개 테스트 통과.
- `npm run build`: exit 0, Next.js 16.2.10 production build와 64개 route 항목 생성, Turbopack 경고 0건.
- `npm run gate:pdf`: exit 0, 회로·표제란·격자·오탐·12MB·비PDF 거부 fixture 9/9 통과.
- V3 전용: 21개 스위트·74개 테스트, topology 5개 스위트·77개 테스트, `gate:sld-v3-contract` 5/5 통과.
- 브라우저 실증: 운영 저장소 미설정 503 fail-closed, 명시적 로컬 모드 합성 DXF COMPLETE(1페이지·구획 1/1·미확정 0), 새로고침 결과 복구, 데스크톱·390px 모바일 수평 넘침 0을 확인했다.
- 브라우저 E2E: 체크인된 `L1-01-basic-radial.dxf` 업로드→`/api/dxf`→분석 결과→기기 5개·연결 4개 표시가 1/1 통과했다.
- 공개 PDF 생산 API: 대산전기 11/11페이지·관계 244건(HOLD, 저신뢰 관계 명시), 한국기계연구원 18/18페이지·확정 관계 1,168건(COMPLETE), 두 파일 모두 실패·빈 페이지 오판정·가짜 페이지 간 관계 0.
- 독립 코드·회귀·비밀자료 심사에서 최종 P0~P2와 회사 원본·키·대형 생성물 유입 0건을 확인했다.
- `npm run gate:sld-golden`: exit 1, `verified95=false`; 실패 사유는 키·예측·실도면 데이터 부재와 claim 비활성이다.

## 다음 첫 행동

1. 현재 공개 교보재 PDF의 기호·문자·관계 정답표를 별도 판정자가 작성해 자동 회귀 데이터셋으로 고정한다.
2. V3 `runBenchmarkSuite`로 실제 BYOK 공급자·모델별 동일 공개 데이터셋 3회 영수증을 만들고, 승인 공개키·필수 strata를 운영 설정에 결박한다.
3. 스테이징 자격증명이 준비되면 Supabase, Stripe, Weaviate, AI 공급자 순으로 write→persist→새 세션 read-back을 검증한다.

## 상세 문서

- [기능 배선 지도](docs/project/IMPLEMENTATION_MAP.md)
- [구조 결정 기록](docs/project/DECISIONS.md)
- [SLD V3 §1–15 추적표](docs/project/SLD_V3_TRACEABILITY.md)
- [최신 인수인계](docs/project/handoffs/2026-07-21-sld-v3-independent-review-repair.md)
- [휴면 기능 대장](docs/DORMANT_MANIFEST.md)
- [현실화 게이트](docs/REALIZATION_PLAN.md)
