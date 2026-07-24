---
schemaVersion: 1
project: ESA
status: active
baselineBranch: main
codeBaselineCommit: fef43524ee1d1649a1955feaea1d72a81897f94f
updatedAt: 2026-07-25T02:40:15+09:00
trigger: ci
changedDomains: [docs, scripts, ci]
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
- `src/lib/electrical-chat-client.ts`는 홈 검색 AI와 Studio 텍스트 질문의 BYOK·온프렘 선택, SSE 조립, 계산기 실행 영수증을 단일 경로로 처리한다.
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
- 4×4 논리 구획에 `Pxx-Axx`, 구획 경계 선에 `Pxx-Cxxx`, 연결 불확정 끝에 `Pxx-Uxxx`를 부여했다. 구획 crop은 겹치되 논리 면은 겹치지 않으며, 전체선→정밀 구획→정확한 원본선 ID 교차검증 뒤에만 선을 합친다.
- 꼭짓점이 경계에 정확히 놓인 선, 일부 구간만 경계와 나란한 선, 5px 근접 평행선의 C 번호 뒤바뀜을 반증 테스트로 수리했다. 불일치·짝 부재는 오병합하지 않고 U와 HOLD 영수증으로 남긴다.
- PDF.js worker뿐 아니라 CMap·표준 폰트·JBIG2/OpenJPEG WASM을 브라우저 loader와 standalone 배포물에 연결했다. 벡터 PDF에 Vision 심사가 붙는 경우 공급자·모델도 페이지 재사용 지문에 포함한다.
- 반복 schedule 표제는 페이지 전체가 아닌 표제 주변 구역만 비계수 처리하고, 표제란은 복수 마커의 실제 경계만 제외한다. A/C/U와 stitch 영수증은 durable JSON 왕복에서 보존된다.
- 홈의 일반 질문은 검색 결과와 함께 AI 답변 표면을 자동으로 열고, Studio의 무파일 질문은 검색 스니펫 폴백 대신 실제 `/api/chat`을 호출한다.
- 채팅 시스템 지침은 서버가 생성해 사용자 질의와 분리한다. 완전한 계산 질의는 ESA 계산기 레지스트리를 먼저 실행하고 계산기 ID·입력·결과 영수증을 모델 답변보다 앞선 SSE 이벤트로 반환한다.
- Groq·Ollama·LM Studio·온프렘 OpenAI 호환 공급자는 Responses API가 아닌 Chat Completions 모델을 사용한다. `gate:chat-live`가 production 서버→정본 계산기 결과→모델 입력 영수증→로컬 호환 모델 답변 순서를 검증한다.
- 기준서 원문을 담지 않는 제약 위에서 인용 경로를 정본화했다. 발행기관 16곳의 원문 확보 경로와 허용 조항 72건을 `engine/standards/citation-registry.ts`에 모으고, `createSource`가 영수증에 원문 경로를 자동으로 붙인다. production 인용 126건(고유 71쌍)을 전수 대조하는 계약 테스트로 조항 번호 드리프트를 막는다.
- 도면 제안 계층의 근거 결박 결함 3건을 수리했다. 차단기 정격 보류가 문서 전역 조건으로 사라지던 것을 기기 결박으로 바꾸고, 종류 미확정 기호의 추측 분류가 SUPPORTED를 만들지 못하게 했으며, 자유 문구 표준 근거가 SUPPORTED를 통과시키던 것을 내부 규칙 식별자 또는 해석 가능한 조항으로 제한했다.
- 조건이 0개인 조항이 어떤 입력에도 PASS를 내보내던 경로를 `makeBlock`으로 차단했다. `BLOCK` 판정과 헬퍼는 정의돼 있었으나 호출처가 0이었다.
- 보안 경계와 도면 파서를 하드닝했다(`134fd80`).
- 표 스케줄 판독을 판정에 결박하고 FLC 미검증을 표기하며 계층 위반을 제거했다(`923d25e`).
- H7 도메인 심사 결함을 수리했다(`fef4352`). 절연 종류 미기재 시 XLPE 낙관 대신 UNKNOWN, 다심 `16sq×4C`의 코어 수를 병렬 조수로 오독하던 허용전류 ×4, 알루미늄 도체의 Cu 판정(약 28% 과대)을 차단해 안전 방향 false-PASS 2건을 막았다. 공백 포함 `200AF 225AT` 미매칭, 날짜 `12/2021`의 정격 발명, remark 공백 시 부하전류의 트립 승격도 함께 수리하고 회귀 테스트로 잠갔다.
- CI를 `verify`(모든 push·PR)와 `live-gates`(PR·주간 예약·수동)로 분리하고 같은 ref의 중복 run을 취소하도록 concurrency를 걸었다. 브라우저 설치와 production 서버 기동이 필요한 게이트는 push마다 돌지 않는다.

## 부분 완료

- 이미지·DXF·PDF의 코드 경로와 공개 PDF 전체 페이지 왕복은 닫혔다. 외부 AI 공급자별 정밀 판독 정확도는 같은 공개 자료의 독립 정답 라벨과 실제 키가 준비돼야 계량할 수 있다.
- 이메일·푸시 알림은 수신 설정과 인앱 저장만 있으며 실제 발송자는 연결하지 않았다.
- 기준서 화면은 저장소 스냅샷을 탐색하지만 관할 기관 최신 원문을 자동 동기화하지 않는다.
- 공유 인메모리 레이트 리밋은 단일 프로세스 보호만 제공한다. V3 작업 저장은 내구 볼륨으로 전환했지만 전역 레이트 리밋은 별도다.
- 비로그인 팀 검토 보고서는 현재 브라우저 `sessionStorage`에서만 다시 열 수 있다. `/api/reports/[id]` reader는 있지만 이 경로의 서버 writer는 없으며 화면도 다른 세션 보관을 약속하지 않는다.
- 경계 위 3·4방향 junction은 현재 자동 병합 대상이 아니며, 두 조각 계약을 벗어나면 안전하게 HOLD한다. junction 자동 합산은 별도 그래프 계약과 라벨 fixture가 필요하다.
- 일반 채팅은 계산 영수증을 결박하지만 기준서 검색 결과를 같은 모델 호출의 검색 근거로 자동 합성하는 RAG 도구 호출은 아직 분리돼 있다. 정확한 조항 답변은 원문 조회 필요 상태를 유지한다.

## 미검증

- 독립 정답을 붙인 공개 교보재 데이터셋에서 symbol macro-F1, text field accuracy, edge-F1, junction accuracy, critical logic recall을 재현하는 외부 평가.
- 실제 OpenAI, Gemini, Claude 키로 같은 도면을 반복 호출한 공급자별 누락·오탐·비용·timeout.
- 대상 Supabase 마이그레이션 적용 뒤 새 세션에서 원본 메타데이터·보고서·티어를 읽는 왕복.
- Stripe 테스트 모드 Checkout→서명 웹훅→티어 반영→새 로그인→Portal 전체 흐름.
- 실제 Weaviate 컬렉션의 insert→검색→재연결과 전용 보안 스캐너 결과.
- 실제 Gemini·OpenAI·Claude로 초급·중급·고급 일반 전기 질문을 반복 호출한 정답성·근거성·제안 품질 비교.

## 보류

- 현재 골든 manifest는 `claimEligible=false`이고 합성 데이터만 가리킨다. 평가 키, 예측 파일, 실도면 독립 라벨이 없으므로 `npm run gate:sld-golden`은 의도대로 exit 1이며 **95% 달성 주장은 HOLD**다.
- 운영 DB, 실결제, 외부 AI 키, 회사 도면을 사용하지 않았다. 도면 왕복은 출처가 기록된 공개 PDF와 비민감 합성 SLD로 수행했다.
- **KEC 232.52의 발행기관 원문 대조가 남아 있다.** 저장소 안에서는 232.52로 통일했으나(기준서 엔진·전문팀·테스트가 이미 232.52였고 계산기 계층만 232.51이었다), 산업통상자원부 공고 원문에서 전압강하 조항 번호를 확인하지는 않았다. 저장소 내 통일과 원문 확인은 다른 것이므로 `citation-registry.ts`의 `UNVERIFIED_AGAINST_ORIGIN`에 구분해 남겼다.
- **`gate:pdf`가 Linux CI에서 6/17 실패한다(R1/R2/R5·R9·R11·R12·R13·R13b). 실패 표면은 게이트의 합성 fixture에 국한되며, 실도면 경로가 아니다.**
  - **정정(2026-07-24).** 이 항목은 처음에 "텍스트는 추출되는데 선분이 0개 — 기하 추출 회귀 의심"으로 적혀 있었다. 게이트 실패 하나에서 능력 전체를 일반화한 잘못된 기술이었다. 같은 run에서 **R7 격자 fixture는 결선>0으로 통과**하고, 저장소에 체크인된 실도면 출력이 반증한다: `fixtures/drawings/realworld/results{,-after}/`의 5개 실도면이 각각 선분 149·498·556·588·1987개, 엣지 120개를 기록한다(`bd62fb9`·`f88d9c2`). 기하 추출은 죽어 있지 않다.
  - **롤백 대상 커밋이 없다.** `docs/VALIDATION_EVIDENCE.md` 65행이 지시하는 전후 차분을 3차 실증(`bd62fb9`) 이후 구간에 대해 수행한 결과, 이 경로의 구성요소가 **전부 무변경**이다 — 선분 추출 로직(`STROKE_PAINTS`·`pushSeg`·`constructPath` 소비), `engine/topology/endpoint-snap.ts`(커밋 0건), 게이트의 `circuit` fixture 정의, R1 기대값(`conf 0.85`, `0f4b682` 이후 무변경), `pdfjs-dist` lockfile 고정 버전(`6.1.200`, 실증 시점과 동일). 그 구간에서 `pdf-vector-parser.ts`를 건드린 유일한 커밋 `134fd80`은 자원 상한 사전 스캔만 추가했고 추출 로직을 바꾸지 않았다.
  - 따라서 롤백이 아니라 **게이트 fixture와 파이프라인 계약의 불일치**가 남은 가설이다(원장 64행의 "게이트 자체의 결함 의심" 분기). 실패 fixture는 좁다 — `circuit`(4pt 간격 평행 수직선 2개, R1·R11이 사용)과 `rotated`(R12), `table-doc`(R9). 통과하는 `grid`는 끝점이 서로 맞물리는 닫힌 사각형이다.
  - **게이트 기대값은 건드리지 않았다.** 실행 없이 기대값을 낮추는 것은 검증이 아니라 게이트 약화다. 다음 행동은 `npm ci` 가능한 환경에서 `gate:pdf`를 재현하고, `circuit.pdf`에 대한 파서 출력(`lines.length`, `snap.stats`)을 실측해 파이프라인과 기대값 중 어느 쪽이 틀렸는지 가리는 것이다.
- **lint 엄격도 불일치는 미해결이다.** `scripts/enforce.ps1`은 `--max-warnings=0`으로 돌리는데 `eslint.config.mjs`는 react-hooks 규칙 4종을 "숨기지 않고 warn으로 남겨 가시화한다"는 이유로 의도적으로 `warn`에 둔다. 두 계약은 현재 경고가 0건일 때만 동시에 참이다. CI에 `--max-warnings=0`을 붙이면 이 4종이 차단 요인이 되므로, lint를 실제로 돌려 경고 수를 확인하기 전까지 CI는 `npm run lint`(비차단)로 둔다. 검증 없이 게이트 강도를 올리지도, 내리지도 않았다.
- 현재 제품 코드 기준선은 frontmatter의 `codeBaselineCommit`(`fef4352`)이 정본이다. 생성된 `.next/`, `test-results/`, 검증용 작업 JSON과 브라우저 임시 업로드는 Git에 포함하지 않았다.

## 검증

> 2026-07-24 정정: 아래 exit 0 기록은 모두 **로컬(Windows) 실행 결과**다. 같은 기간
> GitHub Actions CI는 최근 30 run이 전부 red였고, 실패 지점 이후 단계는 `skipped`였다.
> 즉 이 저장소의 커밋은 CI에서 기계 검증된 적이 없다. 원인 2건은 아래에 기록했고
> 이번 배치에서 수리했다.

- **CI 차단 1 — `check:docs`**: `docs/README.md`가 저장소에서 제외된 `NOA_RULES_v1.2.md`를 링크해 exit 1. `f966c6e`가 링크를 다시 넣은 뒤 CI 5단계에서 죽고 tsc·lint·test·build·게이트가 전부 skip됐다. 링크 제거 후 `node scripts/check-docs.mjs` exit 0, `59 markdown files, links and indexes OK` 실측.
- **CI 차단 2 — `npm test`가 clean install에서 실행 불가**: `jest.config.ts`(TS 설정 파일)는 Jest가 파싱할 때 `ts-node`를 요구하는데 `ts-node`는 package.json·package-lock.json 어디에도 없다(`ts-jest`만 존재). CI job 88758241613이 `Cannot find package 'ts-node'`로 0초 만에 실패했다. 설정을 `jest.config.mjs`로 옮겨 ts-node 요구를 제거했다(테스트 변환은 그대로 ts-jest 담당).
- 위 두 건의 귀결: 아래 "1,115개"·"1,412개" 테스트 통과 기록은 ts-node가 별도로 존재하던 개발 머신에서만 재현된다. 최신 실측치는 `fef4352` 커밋 기록의 183 스위트·1,463 테스트다.
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
- 2026-07-23 경계 연속성 배치: `test:drawing-v3` 27개 스위트·138개, vision/UI 13개 스위트·130개, 4×4 production integration 1개 모두 통과했다. `npx tsc --noEmit --incremental false`, 수정 파일 ESLint, `npm run build`도 exit 0이며 65개 페이지를 생성했다.
- standalone과 브라우저 공개 자산에서 `jbig2.wasm` 104,852B, `FoxitFixed.pfb` 17,597B, `78-H.bcmap` 2,379B, worker 1,304,896B를 non-empty로 확인했다.
- 2026-07-23 답변 경로 배치: 전체 Jest 175개 스위트·1,412개, 전체 ESLint, `npx tsc --noEmit --incremental false`, 65페이지 production build가 모두 exit 0이었다.
- `npm run gate:chat-live`: HTTP 200, 입력 `3상 380V·100A·50m·35mm² Cu·PF 0.9`가 정본 `voltage-drop` 계산기에서 `4.14V·1.09%·PASS`로 실행됐고, 같은 영수증이 모델 요청에 들어간 뒤 UI용 SSE 영수증→답변 순서로 전송됐다.

## 다음 첫 행동

0-설계. 알고리즘 리뷰에서 확인된 3건(스냅 허용반경의 도면 크기 의존, 기기 분류 부분 문자열 매칭, 경로 탐색 비용)의 수리 설계를 [토폴로지 스냅·분류 재설계](docs/project/design/2026-07-24-topology-snap-and-classification-redesign.md)로 확정했다. 반경 후보·결정 규칙·착수 순서(M0→S1→S2→S3)가 문서에 있으며, 판정 입력을 바꾸는 변경이므로 실측 없이 착지하지 않는다.
0. **`gate:pdf` 6/17 실패에서 파이프라인과 게이트 기대값 중 어느 쪽이 틀렸는지 가린다.** 전후 차분으로 롤백 대상이 없음은 확인했다(위 "보류" 참조). `npm ci` 가능한 환경에서 게이트를 재현하고, 실패 fixture인 `circuit.pdf`(4pt 간격 평행 수직선 2개)에 대한 `lines.length`와 `snap.stats`를 실측해 통과하는 `grid.pdf`(닫힌 사각형)와 대조한다. 파서가 옳으면 게이트 fixture가 실도면을 대표하지 못하는 것이고, 기대값이 옳으면 평행선 스냅 계약을 고친다. 실측 전에는 파서도 기대값도 수정하지 않는다.
   - 완료 기록: CI `verify` 레인이 2026-07-24 green이 됐다(run 30114111855, job 89550479905). docs·tsc·lint·jest·SLD V3 계약·build 6개 단계가 모두 success다. 다만 lint는 `--max-warnings=0` 없이 돌렸고 ESLint는 경고가 있어도 exit 0이므로, **이 success는 경고 0건을 뜻하지 않는다.** 위 "보류"의 불일치를 종결하려면 lint 로그의 경고 수를 직접 확인해야 한다.
1. 현재 공개 교보재 PDF의 기호·문자·관계 정답표를 별도 판정자가 작성해 자동 회귀 데이터셋으로 고정한다.
2. V3 `runBenchmarkSuite`로 실제 BYOK 공급자·모델별 동일 공개 데이터셋 3회 영수증을 만들고, 승인 공개키·필수 strata를 운영 설정에 결박한다.
3. 스테이징 자격증명이 준비되면 Supabase, Stripe, Weaviate, AI 공급자 순으로 write→persist→새 세션 read-back을 검증한다.
4. 초급·중급·고급 일반 전기 질문 정답 세트를 고정하고 공급자별 답변의 정답성·근거성·누락·제안 품질을 반복 채점한다.

## 상세 문서

- [문서 지도](docs/README.md)
- [기능 배선 지도](docs/project/IMPLEMENTATION_MAP.md)
- [구조 결정 기록](docs/project/DECISIONS.md)
- [SLD V3 §1–15 추적표](docs/project/SLD_V3_TRACEABILITY.md)
- [최신 인수인계](docs/project/handoffs/2026-07-23-z-ai-chat-calculator-and-docs.md)
- [휴면 기능 대장](docs/DORMANT_MANIFEST.md)
- [현실화 게이트](docs/REALIZATION_PLAN.md)
- [경계 연속성 설계](docs/superpowers/specs/2026-07-23-sld-region-continuity-integrated-recovery-design.md)
- [경계 연속성 구현 계획](docs/superpowers/plans/2026-07-23-sld-region-continuity-integrated-recovery.md)
