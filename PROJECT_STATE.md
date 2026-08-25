---
schemaVersion: 1
project: ESA
status: active
baselineBranch: main
codeBaselineCommit: 0a7d7dbda45a3d67ed3df095b8d122ef11665da1
updatedAt: 2026-08-26T01:40:40+09:00
trigger: files
changedDomains: [agent, app, engine, lib, docs]
---

# ESA 프로젝트 상태

## 목적과 현재 범위

ESA는 전기 엔지니어가 계산 입력·공식·판본·경고를 재검토할 수 있는 검색, 계산, 도면 분석, 전문팀 검토 작업대다. 현재 기준선에는 SLD 전체 문서 열거와 예산 내 페이지 렌더, `symbols`·`connections`·`text`·`logic`·coverage auditor 역할별 심사, 공간 근거 그래프, 수량·관계·계산·제안, 취소·재개·정정, 외부 서명 평가 게이트가 연결돼 있다.

## 현재 구조 요약

- `src/app`은 사용자 페이지와 서버 Route Handler의 production entry다.
- `src/agent/vision`은 전체 도면을 먼저 역할별로 조사하고, 저확신·복수 후보·고밀도 위치에 필요한 정밀 구획만 선택해 독립 심사 봉투와 조립 후 감사 결과를 만든다.
- `src/agent/electrical`은 기호·문자·선의 출처를 정규화하고 전압 영역, 전원-부하 경로, 보호·접지·계산 입력을 교차검증한다.
- `src/agent/report`는 현재 도면에 유일하게 결박된 근거만 보고서와 95% 게이트에 전달한다.
- `src/agent/drawing`은 V3 전체 문서 작업, PDF/DXF 전체 좌표 문자, 페이지·구획 ledger, 교차 페이지 관계, 수량·제안·정정·평가기 계약을 소유한다.
- `src/engine/topology/symbol-library.ts`는 고객사 DXF 블록 정의의 기하 지문과 별칭을 검증·색인하고, 미식별 블록을 다음 등록에 쓸 `unknownSymbols`로 반환한다.
- `src/lib/dxf-text.ts`는 AutoCAD·ZWCAD·CADian ASCII DXF의 `$DWGCODEPAGE`를 엄격하게 복원하며, 빠른 API·V3 전체 문서·계통도팀·평면도팀이 같은 디코더를 사용한다.
- `DRAWING_JOB_STORE_DIR`은 다중 인스턴스가 공유하는 작업·암호화 원본 임대 볼륨이다. 운영 미설정 시 취소·재개는 503으로 닫힌다.
- `src/lib/drawing-asset-store.ts`는 원본을 브라우저 IndexedDB에만 보관하고 SHA-256 재검증 뒤 같은 브라우저에서 다시 연다.
- `src/lib/electrical-chat-client.ts`는 홈 검색 AI와 Studio 텍스트 질문의 로컬 ChatGPT·BYOK·온프렘 선택, SSE 조립, 계산기 실행 영수증을 단일 경로로 처리한다.
- `src/lib/chatgpt-local-*`는 loopback ESA에서 같은 PC의 Codex app-server와 공식 ChatGPT 로그인을 사용한다. ESA는 계정 토큰을 읽지 않고 ephemeral 추론과 모델 목록만 좁게 사용한다.
- `src/lib/google-model-transport.ts`는 Gemini Developer API와 Google Agent Platform Express Mode의 고정 호스트·키 헤더·최종 응답 텍스트 정본을 분리한다.
- `src/lib/chat-decision-contract.ts`는 일반 채팅의 판단 책임 전가를 검출하고 1회 교정 입력과 실패 폐쇄 문구를 공급한다. 실제 공급자 재호출과 예산 정산은 `/api/chat`이 소유한다.
- `scripts/enforce.ps1`은 타입, 무경고 린트, 전체 Jest, production build, PDF fixture를 순차 차단한다.
- 상세 배선과 구조 결정은 아래 프로젝트 문서가 정본이며, 휴면 기능은 `docs/DORMANT_MANIFEST.md`에만 남긴다.

## 완료

- 2026-08-21 기준선 갱신 — 8/10 이후 반영분: DWG/바이너리 DXF/사내 DRM 판독 가능성 3층(업로드 실패의 세 원인을 화면이 직접 안내), 오픈 베타 요금제 봉인 전면화(+ 요금 문구 게이트), SLD 폴링 영구 잠금·getUserTier 무관측·모바일 터치 타깃 수리, 동시 세션 착지분(spatial-graph 거짓 UNBOUND/SELF 제거 + 충돌 선 기하 기록) 검증 수용과 T-접점 공회전 단언 교정, dependabot 21종. 상세는 CHANGELOG [Unreleased].
- 2026-08-25 기준선 갱신 — 벡터 DXF·PDF는 AI 키가 없어도 V3 `vectorOnly`로 파서·토폴로지·계산·제안 경로를 실행하며, 래스터 이미지는 Vision 연결 필요를 명시한다.
- 2026-08-26 기준선 갱신 — 기존 AutoCAD 호환 ASCII DXF 경로에 ZWCAD 한국어 `ANSI_949` 복원과 동일한 바이너리 DXF·DWG·DRM 실패 계약을 연결했다. 실제 production `/api/dxf` 왕복에서 변압기·VCB·모터 3기기, 결선 2건, 한글 문자와 유효 토폴로지를 확인했다.
- 고객사 DXF 심볼 라이브러리는 미식별 블록의 이름·지문·개수를 화면에 노출하고, 사용자가 아는 항목만 기기 종류로 확정해 회사별 브라우저 사전에 저장·즉시 재분석할 수 있다. 활성 회사는 새로고침, 빠른 분석·V3 전체 문서·정밀 검증과 다음 DXF에 동일하게 적용되며 JSON 반입·반출·삭제를 지원한다. 현행 `fp2`는 내부 선·곡선·중첩 형상을 정규화하며 지문·블록명 중 어느 키든 기기 종류가 충돌하면 그 키의 자동 판정을 중단한다. 기존 `fp1`은 정확한 블록명이 있는 항목만 호환하고 별칭 없는 항목은 재등록을 요구한다. 검증된 라이브러리는 V3 PARTIAL 작업의 저장·재개에도 같은 값으로 보존한다. 저장 catalog 일부가 손상돼도 정상 항목을 새 저장으로 덮지 않으며, 모든 쓰기를 차단한 뒤 사용자가 raw 원본 백업과 초기화를 확인한 경우에만 복구한다.
- 계산기 단계 입력의 `min` 위반을 조용히 무시하던 경로와 검색 화면의 모바일 수평 넘침을 수리했다.

- 로컬 ChatGPT 실패 응답은 허용된 상태·오류 코드만 노출하며 키 모양의 공급자 문자열을 제거한다. stderr 분류는 해당 단일 활성 턴에만 귀속되어 다음 턴이나 동시 턴으로 전파되지 않는다.
- 서로 다른 미등록 기기 타입은 정본 `other`로 닫히더라도 원래 타입 식별자를 보존하고 서로 합치지 않는다.
- 닫힌 기기 어휘의 골든 평가 축을 제품 계열 접기 규칙과 교차검증하고 `cutout_switch`를 `fuse` 수량에 포함한다.
- 모델 매트릭스 `--resume`은 요청 반복 횟수와 기존 `runSpread.runCount`가 일치할 때만 영수증을 재사용한다.
- PDF.js 임의 JavaScript 실행 취약 범위를 벗어난 `pdfjs-dist 6.2.108`과 안전한 PostCSS·간접 의존성 패치 버전을 잠갔다. Next.js 16.3에서 폐기된 실험 플래그도 제거해 빌드 계약을 맞췄다.
- GitHub Actions의 Node 20 런타임 종료 경고를 없애기 위해 두 CI job의 공식 `actions/checkout`을 v7로 갱신했다.
- `symbols`·`connections`·`text`·`logic`을 서로 다른 호출·프롬프트·소스 계획으로 실행하고, 역할 누락·봉투 해시 불일치·출처 격리 실패를 합산 단계에서 HOLD로 차단했다.
- 래스터 도면은 전체 페이지 4역할을 먼저 읽고 저확신·복수 후보·고밀도 근거가 있는 구획만 역할별로 정밀 판독한다. 정밀 결과를 원본 좌표로 조립한 그래프를 coverage auditor가 다시 보고, 재검사는 봉인된 이전 축을 보존한 채 실패 축·충돌 위치만 호출한다.
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
- `chatgpt-local` 공급자를 설정 카드, 채팅·계산 영수증, SLD V3 역할 심사, 구형 SLD·OCR, 전문팀 검토까지 연결했다. API 키를 받지 않으며 원격 Host와 same-origin 위반은 닫고, command·file change·MCP·웹·승인 이벤트가 발생한 turn은 폐기한다.
- `google-agent-platform` 공급자를 Cloud 크레딧 키, 채팅, SLD V3, 구형 SLD·OCR, 전문팀 검토까지 별도 경로로 연결했다. 실제 Express Mode가 요구하는 `contents[].role=user`와 Gemini thought-part 제거를 모든 Google 도면 호출에 적용했다.
- 도면의 `annotation`은 판독 결과에 보존하지만 전기 토폴로지 노드·고립 판정에서는 제외해, 문자를 더 많이 읽은 모델이 더 나쁜 연결망 점수를 받는 역전 현상을 막았다.
- 반복 기호 집계, 비회로 면 phantom 기기, V3 역할 오류 은폐, 절단 JSON·루트 배열·점 좌표, `pageIndex` bounds 별칭을 수리했다. 부분 복구에는 confidence 페널티를 남기고 지원하지 않는 필드는 필드명과 함께 거부한다.
- 동일 원인의 고아 기기·OCR·연속성 권고를 페이지별로 묶어 212건까지 폭증하던 제안을 6개 근거 묶음으로 줄이되 대상 ID는 보존했다.
- 도면 보고서에 현재 자동화된 AF/AT·KEC 케이블 허용전류·변압기 2차 전류와 미자동화된 단락·협조·접지·전압강하·단락내량·SPD·전동기 보호를 상시 표시한다.
- 도면의 모호·미판독 항목은 사용자 질문으로 넘기지 않고 ESA의 우선 후보 또는 판독 불가 판단을 낸다. 해당 항목만 확정 관계·안전 계산에서 보류하고 나머지 분석은 유지하며, 화면과 CSV·인쇄 반출물에 `ESA 판단`·`권장 조치`·`결론 변경 조건`을 함께 보존한다. 일반 채팅의 계산 입력 부족도 역질문 대신 조건부 결론과 결론 변경 입력으로 출력한다.
- 일반 채팅 모델이 “사용자가 판단”·“값을 알려 주면 판단” 형태로 책임을 되넘기면 같은 공급자·모델을 최대 한 번만 다시 호출한다. 교정 재실패·호출 실패·서버 예산 부족은 원답을 숨긴 `판단 미완결`로 닫고, 정상 답변은 추가 호출하지 않는다. 서버 키 교정 비용은 첫 생성과 별도 예약·정산하며 BYOK·로컬·온프레미스는 서버 예산에서 제외한다.
- 도면 추론 계약에 `low/medium/high/xhigh/max`를 추가했다. `xhigh/max`는 로컬 ChatGPT 전용으로 제한하고, 비로컬 Vision 공급자가 요청하면 잘못된 thinking level로 전달하지 않고 400으로 차단한다.
- 로컬 도면 역할은 8개 동시 호출, low/medium 75초, high/xhigh/max 180초로 제한한다. 명시한 추론 레벨의 문서 한도는 570초이며 사용자의 10분 기준은 캘리브레이션에서 통과/실패 경계로만 사용한다.
- GPT-5.5·GPT-5.6 Luna/Terra/Sol의 지원 조합 17개를 같은 중급 공개 결선도와 같은 snapshot에서 실행하고, 중단 재개·재채점·설정 지문·완결성 우선 후보 게이트를 가진 `validate:drawing-effort-calibration`을 추가했다.
- 공개 초급 단선도, 중급 3상 결선도, 고급 KIMM 수변전 단선도를 사전 고정 라벨로 묶은 3×3 high 추론 실행기와 재채점 가능한 영수증을 추가했다.
- 문서 제한시간을 실제 팀 호출에 전달하고 중단 시 완료 봉투를 보존한다. 로컬 Codex app-server가 멎으면 singleton을 폐기·재생성하며, 역할별 JSON Schema는 타 역할 컬렉션과 비엄격 선택 속성을 차단한다.
- `physicalEquipmentCount: null`이 판독된 장치 수를 0으로 덮던 평가 결함과 변압기 권선의 물리 장치 중복 집계를 회귀 테스트로 잠갔다.
- 역할 전체 판독 실패를 모든 정밀 구획 실패로 확대하던 재시도를 `full-source`와 `precision-region`으로 분리했다. 합산 재스캔 상한은 역할별 16개가 아니라 3역할 합계 48개로 수정하고, 같은 역할의 합성 `role` 실패는 실제 source 실패와 중복 예약하지 않는다.
- 실패 뒤 성공한 역할 호출은 최종 커버리지 실패에서 제외하고, 치명적이지 않은 보조 source 실패 하나가 coverage auditor 전체를 실패시키던 판정을 수리했다. 래스터 페이지의 종류가 `unknown`이어도 열거·판독이 완결되면 page-survey 자체는 PASS로 기록한다.
- 모델 비교 영수증은 서로 다른 working-tree snapshot이 섞이면 `MIXED_WORKSPACE_SNAPSHOTS`로 비교 불가를 봉인한다. 문서 호출 수는 예약량이 아니라 실제 시작한 provider 호출 수를 기록하고, graph conflict는 영수증에 정확한 충돌 코드를 남긴다.
- 구획 경계에서 끊긴 수직 분기선을 버스 선망까지 추적하되 평행선은 합치지 않는 관계 보완을 추가했다. 공개 중급 결선도에서 관계 회수율이 33%에서 100%로 상승했으며, 추론 관계는 `ambiguous`로 유지한다.
- `disconnector`·`isolator`를 switch 평가 축으로 통합하고, 구조화 모델이 null 대신 내보낸 `voltageV: 0`은 전압 주장으로 쓰지 않고 속성만 생략해 나머지 독립 논리 근거를 보존한다.
- Google Agent Platform과 OpenAI 도면 역할 호출에 역할별 JSON Schema를 실제 provider 요청으로 전달했다. Google의 nullable dialect로 변환하고, 파손된 provider 봉투·역할 payload는 같은 검증 범위 안에서 재시도한다.
- Vision이 차단기·변압기를 관통하는 긴 선 하나를 반환해도 선 위 중간 기기를 순서대로 찾아 인접 관계로 분해한다. 구획 경계의 일반 선 조각은 인접 선망과 최소 연결 트리로 재조립하되 추론 관계는 `ambiguous`를 유지한다. 그래프 조립 버전은 `evidence-graph-continuity-v7`이다.
- 페이지 확대 비율과 선·기호 밀도로 2×2·3×3·4×4 후보 구획을 준비하되 전부 호출하지 않는다. 전체 판독 결과가 저확신·복수 후보·고밀도 구획을 역할별로 선택하고, 남은 문서 호출 예산이 역할별 정밀 호출 상한을 결정한다. 기호 심사가 하나 이상 살아 있는 래스터 페이지에서만 결정론적 직선 검출을 보조 근거로 사용하며, 문자·기기 내부 선과 고립된 짧은 선은 제외한다.
- 조립 감사와 그래프 충돌이 많은 경우 재검사 대상을 원본 역할·좌표를 보존한 정밀 구획 최대 16개와 전체 원본 1개로 압축한다. 명시적인 단일 구획 요청은 다른 구획으로 퍼뜨리지 않으며, 여러 원인이 같은 구획에 모이면 역할만 합쳐 호출 제한을 넘지 않는다.
- 비연속 페이지 요청의 논리 충돌 bounds가 배열 위치가 아니라 실제 `pageIndex`의 폭·높이를 사용하도록 수리했다.
- 도면 connection/spec 계약에 설치방법·주위온도·집합회로 수·예상 단락전류·차단용량·보호곡선·출처 ID를 추가했다. 근거 없는 케이블 허용전류 판정은 UNKNOWN이고, 출처가 완결된 경우 KEC 케이블 계산기와 212.5 차단용량 비교가 실제로 실행된다. KEC 212.7.2는 서로 다른 과부하·단락 보호장치 ID와 양쪽 에너지값(A²s), 원본 source ID가 모두 있을 때만 단락장치 통과에너지와 과부하장치 무손상 내량을 비교한다.

## 부분 완료

- 이미지·DXF·PDF의 코드 경로와 공개 PDF 전체 페이지 왕복은 닫혔다. 실제 Agent Platform 키로 공개 도면 4종을 추가 실행했지만, 수동 수량표는 독립 인간 정답이 아니므로 공급자별 일반화 정확도 계량에는 사용할 수 없다.
- 고객사 심볼 라이브러리는 DXF `INSERT`와 블록 정의에만 적용된다. 이미지·래스터 PDF의 픽셀 심볼 학습 기능은 아니다. 회사 사전은 현재 브라우저 `localStorage`에 저장되고 계정·서버 간 자동 동기화는 없으며, 서버는 해당 V3 작업의 실행·재개 메타데이터만 보존한다. 다른 PC·동료와 공유하려면 화면의 JSON 내보내기·가져오기를 사용한다.
- 이메일·푸시 알림은 수신 설정과 인앱 저장만 있으며 실제 발송자는 연결하지 않았다.
- 기준서 화면은 저장소 스냅샷을 탐색하지만 관할 기관 최신 원문을 자동 동기화하지 않는다.
- 공유 인메모리 레이트 리밋은 단일 프로세스 보호만 제공한다. V3 작업 저장은 내구 볼륨으로 전환했지만 전역 레이트 리밋은 별도다.
- 비로그인 팀 검토 보고서는 현재 브라우저 `sessionStorage`에서만 다시 열 수 있다. `/api/reports/[id]` reader는 있지만 이 경로의 서버 writer는 없으며 화면도 다른 세션 보관을 약속하지 않는다.
- 경계 위 3·4방향 junction은 현재 자동 병합 대상이 아니며, 두 조각 계약을 벗어나면 안전하게 HOLD한다. junction 자동 합산은 별도 그래프 계약과 라벨 fixture가 필요하다.
- 일반 채팅은 계산 영수증을 결박하지만 기준서 검색 결과를 같은 모델 호출의 검색 근거로 자동 합성하는 RAG 도구 호출은 아직 분리돼 있다. 정확한 조항 답변은 원문 조회 필요 상태를 유지한다.
- `chatgpt-local`은 현재 ESA와 Codex를 같은 PC에서 실행하는 POC만 지원한다. 공개 배포용 사용자 PC 연결 도우미와 pairing은 미구현이며 휴면 대장에 분리했다.
- 2026-08-03 동일 snapshot 3×3 high 재실행은 Gemini 72.3%/222초, Terra 72.0%/411.7초, Sol 51.0%/466.7초였고 9개 모두 엄격 최종 품질 FAIL이었다. 이후 관계 조립 수리 snapshot에서 Gemini 중급은 51%·관계 33%에서 78%·관계 100%로 개선됐다. 2026-08-08 전역 선행·선택 구획·조립 후 감사 구조의 GPT-5.6 Terra/high 초급 단발은 기호·관계 100%·412.9초·31호출이었지만 재스캔 미해소 13건, OCR 모호 17건, 선 연속성 불확실 15건과 근거 추적률 23.4% 때문에 최종 문서는 PARTIAL/HOLD다. 이 단발 원본 영수증은 임시 작업공간 정리 때 보존되지 않아 저장소 결박 증거로는 재실행이 필요하며, 서로 다른 snapshot을 섞은 모델 순위나 일반화 80%는 주장하지 않는다.
- 2026-08-09 동일 KIMM 고급 래스터·Terra/high 단발에서 재검사 압축 전 `b285776`은 384.8초·26호출·라벨 90%·관계 100%였으나 48개 상한 오류로 재검사 미해소 108건과 실패 역할 호출 18건이 남았다. 압축 후 clean `8dc018b`은 427.8초·19호출·라벨 83%·관계 100%, 재검사 미해소 9건·실패 역할 호출 2건으로 상한 오류가 사라졌다. 단, 전체 연결선 역할의 구조화 응답 1회 실패, 변압기 6/정답 4·차단기 7/최소 9, 근거 추적률 13.1% 때문에 최종 문서는 계속 PARTIAL/FAIL이다. 단발 간 라벨 하락은 모델 편차가 섞여 있어 성능 개선·악화 근거로 쓰지 않는다.
- 고밀도 MCC Agent Platform high 재실행은 202.5초·55호출에서 136기호·223선·212문자·176관계를 회수했다. 같은 봉투를 현재 결정론 계층으로 재조립하면 FAIL 0, PASS 2, HOLD 7이며 최종 상태는 HOLD다. 북미 반복 분기 도면도 같은 실호출 봉투의 재조립에서 변압기 10/10·버스 4/4·부하 21/21과 관계 37건을 회수했지만, 35건이 추론 관계라 독립 edge 정확도로 승격하지 않는다.
- 17개 로컬 모델·추론 조합의 중급 도면 1차 캘리브레이션은 전부 `PARTIAL/FAIL`, 추천 후보 0개였다. Terra/high가 라벨 88%·관계 100%·421초·누락 1역할로 가장 덜 불완전했지만 coverage auditor가 빠져 기본 모델로 채택하지 않는다. Terra/max와 Sol/xhigh의 표면 99%도 필수 역할이 각각 4개·3개 빠져 후보에서 제외했다. 실패 기록 414건 중 로컬 호출 timeout 281건, 문서 deadline/abort 93건으로 단일 추론 레벨을 30~48개 역할·구획 호출 전체에 적용하는 구조가 주병목이다.

## 미검증

- 독립 정답을 붙인 공개 교보재 데이터셋에서 symbol macro-F1, text field accuracy, edge-F1, junction accuracy, critical logic recall을 재현하는 외부 평가.
- 서로 다른 공개 DXF 작도 관례에서 고객사 지문·별칭 라이브러리의 미인식 회수율, 서로 다른 기기 간 지문 충돌률과 오분류율을 독립 라벨로 검증하는 평가.
- ZWCAD 실제 저장본의 여러 DXF 버전·코드페이지·회사별 커스텀 블록을 독립 정답과 대조한 호환성 평가. 현재 ZWCAD 증거는 공개 규격에 맞춘 비민감 합성 `AC1027`·`ANSI_949` 입력이다.
- 실제 OpenAI, Gemini, Claude 키로 같은 도면을 반복 호출한 공급자별 누락·오탐·비용·timeout.
- 대상 Supabase 마이그레이션 적용 뒤 새 세션에서 원본 메타데이터·보고서·티어를 읽는 왕복.
- Stripe 테스트 모드 Checkout→서명 웹훅→티어 반영→새 로그인→Portal 전체 흐름.
- 실제 Weaviate 컬렉션의 insert→검색→재연결과 전용 보안 스캐너 결과.
- 실제 Gemini·OpenAI·Claude로 초급·중급·고급 일반 전기 질문을 반복 호출한 정답성·근거성·제안 품질 비교.
- 같은 snapshot 3회 반복은 2026-08-04~05 에 수행했다(원장 10~21차). 결과는 "모델 비교"보다 **측정력 부족**을 먼저 드러냈다 — 코드가 사실상 동일한 두 팔에서도 고급 3회가 라벨 85~87% ↔ 85~100%, 차단기 14/23/26 ↔ 11/22/20 으로 흔들린다. **고급 티어는 n=3 으로 이보다 작은 변화를 판정할 수 없다.** 공급자별 비용·timeout 비교는 여전히 미검증이다.
- 공개 북미 배전도의 최신 결정론적 재조립은 수량을 맞췄지만 관계 37건 중 35건이 `ambiguous`다. 독립 정답 관계 라벨과 같은 snapshot 반복 실행이 없어 edge precision·recall은 아직 미검증이다.
- KEC 자동 검토는 AF/AT, 출처가 완결된 케이블 허용전류, 예상 단락전류-차단용량(212.5), 별도 과부하·단락장치 통과에너지 협조(212.7.2), 변압기 2차 전류와 증거 완결 케이블 계산을 다룬다. 일반적인 상·하위 보호기 시간-전류 선택협조, 접지·감전, 케이블 단락내량, SPD·피뢰, 전동기 보호는 미검증 또는 미구현이다.

## 보류

- 현재 골든 manifest는 `claimEligible=false`이고 합성 데이터만 가리킨다. 평가 키, 예측 파일, 실도면 독립 라벨이 없으므로 `npm run gate:sld-golden`은 의도대로 exit 1이며 **95% 달성 주장은 HOLD**다.
- GitHub의 Dependabot PR #61~#70은 Verify를 통과했지만 Live gates가 실패한 `UNSTABLE` 상태라 병합하지 않았다. 각 브랜치는 실패 원인을 분리 수리하고 전체 게이트가 녹색이 된 뒤에만 다시 판단한다.
- **스냅 허용반경 재유도(S1)는 교보재 부재로 착수 불가다.** 설계의 채택 기준은 다섯 항목인데, 그중 (b) "실도면 블라인드 라벨 relations 대조 — 정밀도·재현율 분리, 어느 쪽도 하락 금지"를 평가할 데이터가 저장소에 없다. 실측: `fixtures/` 전체에 라벨은 합성 15개와 `kimm-panelboard-sld.p14.adjudicated.json`(텍스트축) 1개뿐이고, `fixtures/drawings/realworld/`에는 라벨 파일이 0개다. (b)는 반경을 넓혔을 때 생기는 **오병합**(없는 결선을 만들어 "보호기 없음" critical을 거짓 소거하는 방향)을 잡는 유일한 기준이라, 그것 없이 반경을 바꾸는 것은 판정 입력을 실측 없이 바꾸는 것이다. 근거 G1(실도면 자기루프 폐기율 9~26%)은 체크인된 결과에서 재현되므로 문제 자체는 실재한다 — 막힌 것은 **채택 판정**이다. 따라서 S1은 위 「다음 첫 행동 1」(정답표 작성)에 의존하며 그보다 먼저 진행할 수 없다.
- 운영 DB, 실결제, 회사 도면은 사용하지 않았다. 외부 Agent Platform 테스트 키와 로컬 ChatGPT 계정은 출처가 기록된 공개 `wiki-oneline.png` 실호출에만 사용했고 키·계정 토큰은 출력·커밋하지 않았다.
- 현재 프로젝트 코드 기준선은 `9ede686661d962155418200143eeb4e9e144717a`다. 기존 17개 라이브 영수증은 호출 당시 동일 dirty snapshot `f70da7f6…`에 결박돼 있고, 2026-08-08 전역 선행·선택 구획 구조의 초급 단발 원본 영수증은 저장소에 남지 않았다. 2026-08-09 고급 전후 영수증은 clean `b285776`·`8dc018b`에 각각 결박돼 로컬 `test-results/`에 보존했다. 생성된 `.next/`, `test-results/`, 검증용 작업 JSON과 브라우저 임시 업로드는 Git에 포함하지 않는다.

## 검증

> 스위트·테스트·페이지 **개수를 이 문서에 복제하지 않는다.** 기능이 바뀌면 같이 바뀌는 수라 반드시 드리프트하고, 드리프트한 수는 읽는 사람을 잘못 인도한다. 아래는 **어떤 게이트가 exit 0 이었는지**만 기록하고, 현재 수치는 명령을 직접 돌려 확인한다.

- `pwsh -NoProfile -File scripts/enforce.ps1`: exit 0.
- `npx tsc --noEmit`: exit 0.
- `npm run lint -- --max-warnings=0`: exit 0.
- `npm test -- --runInBand`: exit 0.
- `npm run build`: exit 0, Next.js production build, Turbopack 경고 0건.
- `npm run gate:pdf`: exit 0, 회로·표제란·격자·오탐·12MB·비PDF 거부 fixture 9/9 통과.
- V3 전용 스위트와 topology 스위트, `gate:sld-v3-contract` 5/5 통과.
- 브라우저 실증: 운영 저장소 미설정 503 fail-closed, 명시적 로컬 모드 합성 DXF COMPLETE(1페이지·구획 1/1·미확정 0), 새로고침 결과 복구, 데스크톱·390px 모바일 수평 넘침 0을 확인했다.
- 브라우저 E2E: 체크인된 `L1-01-basic-radial.dxf` 업로드→`/api/dxf`→분석 결과→기기 5개·연결 4개 표시가 1/1 통과했다.
- 공개 PDF 생산 API: 대산전기 11/11페이지·관계 244건(HOLD, 저신뢰 관계 명시), 한국기계연구원 18/18페이지·확정 관계 1,168건(COMPLETE), 두 파일 모두 실패·빈 페이지 오판정·가짜 페이지 간 관계 0.
- 독립 코드·회귀·비밀자료 심사에서 최종 P0~P2와 회사 원본·키·대형 생성물 유입 0건을 확인했다.
- `npm run gate:sld-golden`: exit 1, `verified95=false`; 실패 사유는 키·예측·실도면 데이터 부재와 claim 비활성이다.
- 2026-07-23 경계 연속성 배치: `test:drawing-v3`, vision/UI, 4×4 production integration이 모두 통과했다. `npx tsc --noEmit --incremental false`, 수정 파일 ESLint, `npm run build`도 exit 0이었다.
- standalone과 브라우저 공개 자산에서 `jbig2.wasm` 104,852B, `FoxitFixed.pfb` 17,597B, `78-H.bcmap` 2,379B, worker 1,304,896B를 non-empty로 확인했다.
- 2026-07-23 답변 경로 배치: 전체 Jest, 전체 ESLint, `npx tsc --noEmit --incremental false`, production build가 모두 exit 0이었다.
- `npm run gate:chat-live`: HTTP 200, 입력 `3상 380V·100A·50m·35mm² Cu·PF 0.9`가 정본 `voltage-drop` 계산기에서 `4.14V·1.09%·PASS`로 실행됐고, 같은 영수증이 모델 요청에 들어간 뒤 UI용 SSE 영수증→답변 순서로 전송됐다.
- 2026-07-31 로컬 ChatGPT 실계정: 상태 API 200·연결·마스킹 이메일·모델 8개(이미지 7개), 텍스트 답변 200, 계산 질문 이벤트 `calculation→text→filter`, 원격 Host 계정 API 404를 확인했다.
- 같은 실계정의 공개 `wiki-oneline.png`: `gpt-5.6-terra` SLD는 HTTP 200·기기 17·연결 16·confidence 0.69·saga COMPLETE, OCR은 HTTP 200·confidence 0.98로 완료됐다. `gpt-5.4-mini` SLD는 120초 제한을 넘어 502였으며, 이 결과는 연결 완주 증거이지 외부 정답 라벨 기반 정확도 증거가 아니다.
- 2026-08-02 동일 공개 `wiki-oneline.png` 2회 비교: Agent Platform `gemini-3.6-flash`는 2/2회 14기기·13결선·단일망(22.586/24.521초), ChatGPT `gpt-5.6-terra`는 1회 14·13과 전력 문자 5묶음, 1회 13·12(47.227/31.363초)였다. 단일 표본 구조 판독은 둘 다 80%를 넘었지만 일반화 정확도 주장은 하지 않는다. 상세는 비교 영수증을 따른다.
- 2026-08-02 Agent Platform 공개 도면 추가 실측: 단선도는 정답 수량 전부·14기기·13결선·topology valid, 유럽 배전도는 변압기 4/4·부하 20/20·28기기·27결선, 북미 배전도는 변압기 10/10·부하 20/21·34기기·10결선, 실제 결선도는 QS1과 FU1~FU6 명칭을 모두 판독했다. 전기 정격·관계가 불완전한 3종은 의도대로 HOLD다.
- 2026-08-02 국내 추가 실측: 비회로 치수 배치도는 0기기·0결선으로 phantom panel을 제거했고, 고밀도 MCC는 반복기기 분리 수리 후 43기기·15결선으로 증가했으나 관계 누락 때문에 HOLD다.
- 2026-08-03 도면 분석 수리 snapshot: 타입 검사, 경고 0 ESLint, 전체 Jest(331 suites·3,979 tests 통과, 각 1개 skip), production build, 문서 검사, PDF gate 17/17, V3 전용 278 tests, Vision·팀 212 tests가 모두 exit 0이었다. Gemini 중급 표적 재실행은 관계 33%→100%, 종합 51%→78%로 개선됐으나 엄격 품질은 계속 FAIL이다.
- 2026-08-03 `2bf0ca6` 수리: 타입 검사, 경고 0 ESLint, 전체 Jest(332 suites·4,017 tests 통과, 1 suite·1 test skip), production build, PDF 실경로 gate 17/17, V3 계약 6/6, production SLD benchmark 1/1이 exit 0이었다. `gate:sld-golden`은 실도면 독립 라벨·예측·서명 부재를 이유로 의도대로 exit 1과 `verified95=false`를 반환했다.
- 같은 배치의 고밀도 MCC Agent Platform high 실호출은 202.5초·55호출·136기호·223선·212문자·176관계였고, 현재 결정론 보정 재생은 FAIL 0·PASS 2·HOLD 7이다. OCR 후보 212건, 경계 연속성 20건, 불확실 관계 152건, 근거 추적률 17.3%와 coverage auditor 충돌이 남아 전체 상태는 HOLD다.
- 2026-08-03 로컬 추론 캘리브레이션: 같은 중급 공개 결선도·snapshot으로 지원 조합 17개를 실호출했고 모델·effort 지문은 17/17 일치했다. 비교 snapshot은 1개로 유효하지만 전부 `PARTIAL/FAIL`, 후보 게이트 0/17이었다. 이후 clean `0d475fc`에서 `--aggregate-only` 재채점 결과도 동일했다.
- `0d475fc` 코드 배치에서 타입 검사, 경고 0 전체 ESLint, 전체 Jest(333 suites·4,038 tests 통과, 1 suite·1 test skip), production build 66페이지, 캘리브레이션 Node 계약 6건이 exit 0이었다. 비로컬 `xhigh/max` 차단 추가 후 관련 Jest 25건, 타입 검사와 수정 파일 ESLint도 exit 0이었다.
- 2026-08-08 검증 결함·의존성 수리 배치에서 전체 Jest 341 suites·4,164 tests, Node 스크립트 59 tests, 타입 검사, 경고 0 ESLint, 문서 검사 73파일, production build 66페이지, PDF 실경로 17/17이 exit 0이었다. `npm audit --audit-level=moderate`는 취약점 0건이다.
- `11d4b02` 전역 선행·선택 구획 배치에서 전체 Jest 4,176건 통과·4건 skip(총 4,180), 관련 council·team·orchestrator 회귀가 exit 0이었다. 이 수치는 구현 계약 증거이며 독립 라벨 정확도 증거가 아니다.
- 2026-08-09 일반 채팅 판단 책임 계약의 최종 코드 `7151287`에서 문서 77파일, 타입 검사, 경고 0 전체 ESLint, 전체 Jest 343 suites·4,203 tests 통과(2 suites·4 tests skip), production build 66페이지가 통과했다. 첫 `enforce.ps1`의 PDF 단계는 3010 서버 미기동으로 exit 2였고, 같은 production 빌드를 기동한 실제 `/api/pdf-drawing` 보충 게이트는 17/17·exit 0이었다.
- 2026-08-25 코드 기준선 `72cb322`에서 전체 Jest, 타입 검사, 수정 파일 무경고 ESLint와 Next.js production build가 exit 0이었다. 심볼 라이브러리 재개 회귀는 수리 전 실패·수리 후 통과를 확인했다. 부모 기능 커밋 `64619d0`의 standalone `/api/dxf` 실동작은 등록 심볼 1건, 기기 5개, 관계 4개와 라이브러리 적용 메타데이터를 반환했다.
- 2026-08-26 코드 기준선 `9ede686`에서 문서 검사, 타입 검사, 경고 0 전체 ESLint, 전체 Jest 347 suites·4,242 tests, Next.js production build 66페이지가 통과했다. 첫 통합 게이트는 3010 검증 서버 미기동으로 PDF 단계만 exit 2였고, 같은 production 빌드를 기동한 보충 `gate:pdf`는 17/17·exit 0이었다.
- 같은 production `/api/dxf`에 ZWCAD형 `AC1027`·`ANSI_949` multipart를 실제 업로드해 HTTP 200, `euc-kr` 복원, 변압기·차단기·모터 3기기, 결선 2건, 한글 `변압기`, topology valid·issues 0을 확인했다.

## 다음 첫 행동

1. 공개 교보재의 기호·문자·관계 정답표를 전기 실무자 2인 블라인드 판정과 불일치 합의 로그로 고정한다. **이 항목이 병목임을 2026-08-05 에 두 번 독립적으로 확인했다** — 실도면 과다 계수의 판별식이 정답 없이 만든 보정 때문에 기각됐고(원장 17차), 스냅 허용반경(S1)도 같은 이유로 착수 불가다.
2. 공개 DXF 여러 묶음에서 고객사 심볼 라이브러리를 블라인드 적용해 지문 충돌·별칭 오분류·미식별 회수율을 기록한다. `fp2`의 내부형상 구분과 충돌 시 자동 판정 차단은 회귀로 고정했지만 회사 원본 없이 합성 입력만으로 범용성을 주장하지 않는다.
3. `8dc018b`의 전역 선행·선택 구획·표적 재검사 압축 구조로 GPT 중급·고급을 같은 snapshot에서 각각 3회 반복해 저장소 밖 원본 영수증과 집계 영수증을 보존한다. 2026-08-09 고급 1회는 배선 결함 재현에는 충분하지만 모델 편차 판정에는 부족하다. 라벨 점수는 정답 없이 재는 조립 지표(`scripts/measure-assembly-quality.mjs`)와 함께 읽는다.
4. 고밀도 MCC의 OCR 후보, 경계 연속성, 불확실 관계와 낮은 근거 추적률을 독립 라벨별로 줄인다. 판정층 HOLD를 강제로 PASS로 바꾸지 않는다.
5. 일반적인 상·하위 보호기 선택협조가 제품 범위에 필요하면 KEC 212.7.2와 별도 규칙으로 시간-전류 곡선 계약·정답 교보재를 먼저 설계한다.
6. 스테이징 자격증명이 준비되면 Supabase, Stripe, Weaviate 순으로 write→persist→새 세션 read-back을 검증한다.

## 상세 문서

- [문서 지도](docs/README.md)
- [기능 배선 지도](docs/project/IMPLEMENTATION_MAP.md)
- [구조 결정 기록](docs/project/DECISIONS.md)
- [SLD V3 §1–15 추적표](docs/project/SLD_V3_TRACEABILITY.md)
- [최신 인수인계 — 8월 26일 회사별 심볼 사전 앱 저장 완료](docs/project/handoffs/2026-08-26-zz-company-symbol-library-completion.md)
- [과거 인수인계 색인](docs/project/HANDOFFS.md)
- [휴면 기능 대장](docs/DORMANT_MANIFEST.md)
- [현실화 게이트](docs/REALIZATION_PLAN.md)
- [경계 연속성 설계](docs/superpowers/specs/2026-07-23-sld-region-continuity-integrated-recovery-design.md)
- [경계 연속성 구현 계획](docs/superpowers/plans/2026-07-23-sld-region-continuity-integrated-recovery.md)
