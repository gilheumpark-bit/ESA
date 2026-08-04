# 실증 증거 원장 — Validation Evidence Ledger

최종 갱신 2026-08-03 · 이 저장소의 실증과 production 실왕복이 **언제·무엇으로·어떤 결과로** 수행됐는지 기록하는 원장.

**사용법이 곧 목적이다**: "실증이 없다 / 실증이 필요하다"는 판단을 내리기 전에
① 이 원장의 해당 행을 찾고 ② 그 행의 앵커(커밋 SHA·교보재 경로·게이트 명령)를 **직접 재실행**한다.
이 문서의 주장을 믿을 필요는 없다 — 앵커가 전부 리포 안에 있으니 실행해서 확인하라.
그게 이 원장이 존재하는 방식이다.

## 결론 먼저

- **도면 파이프라인**: 합성 15장(1차) → 실도면 라이브 게이트화(2차) → 공개 실도면 5장 티어 실증(3차)까지 경로 검증. 다만 6차의 모델별 high 추론 비교에서는 9개 조합 모두 최종 문서가 PARTIAL·엄격 품질 FAIL이므로, 공급자 일반화 정확도 통과로 확대 해석하지 않는다.
- **계산기 57종**: IEC/NEC/KEC 공표값 **known-answer 전수 대조** 통과, 치명 2건 수리, accuracy 스위트로 잠금.
- 전부 커밋·교보재·재실행 게이트로 리포에 남아 있다. 세션 기억이 아니다.

## 실증 이력 (불변 앵커 — `git log`로 검증 가능)

| 차수 | 일자 | 커밋 | 교보재 | 무엇을 실증 | 결과 |
|---|---|---|---|---|---|
| 1차 합성 | 2026-07-20 | [결과 문서](./DRAWING_VALIDATION_RESULT.md) | `fixtures/drawings/synthetic` (라벨 30파일) | DXF/PDF 파서 재현율·스펙 추출 | 결함 8종 적출·전수리 → 15장 전 지표 100% (수리 전 스펙 추출 0%였다) |
| 2차 실도면 게이트화 | 2026-07-20~21 | `scripts/pdf-fixture-gate.mjs` | `fixtures/drawings/realworld/*` | `/api/pdf-drawing` 라이브 관통 | `npm run gate:pdf`로 상시 게이트화 |
| **3차 티어 실증** | 2026-07-21 | **`bd62fb9`** | 공개 실도면 5장(초/중/고 난이도) 블라인드 라벨 + KIMM 패널보드 83p 신규 확보 | 라이브 관통 → 블라인드 라벨 대조 | 초/중/고 PASS(TR 용량 3/3·GT 환각 0) · **표-적대 도면 FAIL 자체 적출**(스케줄 표를 conf 0.85로 회로 발명) |
| 3차 백로그 수리 | 2026-07-21 | `0f4b682` | 〃 | 3차 FAIL 원인 5건 | 표 문서 강등·주석 환각·가공 길이 잔존·DWHM·회전 정규화 수리 |
| golden 판정 라벨 | 2026-07-21 | `58feeab` | `fixtures/drawings/golden/kimm-panelboard-sld.p14.adjudicated.json` | KIMM p14 텍스트축 adjudicated 라벨 등재 | `gate:sld-golden`의 대조 기준 |
| 계산기 전수 | 2026-07-19 | `7c84d42` | IEC/NEC/KEC 공표 기준값 | 57 계산기 known-answer 손계산 대조 | 치명 2 수리(impedance-voltage %Z 1140%→5% · motor-efficiency IE1 절감 부호역전) · accuracy 스위트 잠금(현 52 test) |
| BYOK 모델 배선·QA | 2026-07-22 | `5b8d0b7` | — | 브라우저 실측 + 단위테스트 + 9축 독립 패널 리뷰 | 확정 결함 7건 수리 (직후 `93ff4ab`가 셀렉터 노출 범위·병렬 허용전류 처리를 정련) |
| AI 정본 계산기 왕복 | 2026-07-23 | `ad7b91c` | 계산 질문 `3상 380V·100A·50m·35mm² Cu·PF 0.9`, 로컬 OpenAI 호환 mock | production `/api/chat` → 정본 계산기 → 모델 입력 영수증 → UI SSE 순서 | `4.14V·1.09%·PASS`, 계산기 ID·입력·결과 일치, 영수증이 답변보다 먼저 전달됨 |

## 4차 공개·국내 추가 실증

아래 행은 커밋 `f481d913ec5057ece7651875ed532c4c50e42f16`에 결박된 추가 실증이다. 로컬 영수증은 Git에서 제외되지만 실행기·판정기·테스트와 결과 요약은 이 커밋에서 재현할 수 있다.

| 일자 | 교보재·경로 | 실경로 | 관찰 결과 | 판정 |
|---|---|---|---|---|
| 2026-08-02 | `wiki-oneline.png` | `/api/sld`, Agent Platform `gemini-3.6-flash` | 변압기 1/1·발전기 1/1·차단기 6/6·리액터 1/1, 14기기·13결선, topology valid | 수량·관계 성공, KEC 입력 부재로 HOLD |
| 2026-08-02 | `American_distribution.png` | 동일 | 변압기 10/10·부하 20/21, 34기기·10결선, topology issue 43 | 반복 부하 1개와 관계 다수 누락, HOLD |
| 2026-08-02 | `European_distribution.png` | 동일 | 변압기 4/4·부하 20/20, 28기기·27결선 | 수량 성공, 정격 미확인으로 HOLD |
| 2026-08-02 | `Electrical_wiring_diagram.jpg` | 동일 | QS1 1, FU1~FU6 명명 그룹 6, 물리 퓨즈 심볼 14, 17기기·16결선 | 명칭·심볼 성공, 정격 미확인으로 HOLD |
| 2026-08-02 | 국내 비회로 치수 배치도 | 동일 | 0기기·0결선·confidence 0 | phantom panel 환각 차단 성공 |
| 2026-08-02 | 국내 고밀도 MCC | 동일 | 반복기기 분리 전 10기기·6결선, 수리 후 43기기·15결선 | 개선됐으나 관계 누락으로 HOLD |
| 2026-08-02 | 공개·대형 PDF fixture | `/api/pdf-drawing`, `npm run gate:pdf` | 17/17 통과; 200AT/4sq false-PASS, AT>AF, 비PDF·대형·회전 입력을 차단 | production PDF 판정 경로 PASS |

영수증은 `test-results/local-drawing-public-*.json`에 있고 Git에는 포함하지 않는다. 수량 기준은 이번 작업의 잠정 수동 계수이므로 독립 golden label이 아니다. 상세 결함과 KEC 범위는 [도면 누수·공개 교보재·KEC 검증](project/handoffs/2026-08-02-drawing-leakage-public-kec-validation.md)을 따른다.

## 5차 V3 추론 단계별 재검증

2026-08-02에 같은 `wiki-oneline.png`를 새 `/api/drawing-jobs` V3 경로로 넣고, 입력부터 최종 보고까지 9개 추론 단계를 분리 판정했다. 이번 판정은 기존 `/api/sld` 성공을 V3 성공으로 승계하지 않는다.

| 항목 | 수리 전 | 수리 후 최종 실왕복 | 판정 |
|---|---:|---:|---|
| 호출 수·응답 시간 | 57회·270.7초 | 19회·80.7초 | 재스캔 대상 없는 전체 재호출 제거 |
| 고정 핵심 기기 | 차단기 별칭 중복 포함 | 변압기 1/1·발전기 1/1·차단기 6/6·리액터 1/1 | 수량 라벨 일치 |
| 관계 | 6/13 | 9/13, 직전 독립 실행 10/13 | 장모선 중심점 오류 수리로 개선됐으나 **V3 관계 단계 FAIL 유지** |
| 9단계 결과 | PASS 2·HOLD 3·FAIL 4 | PASS 2·HOLD 6·FAIL 1 | 남은 FAIL=`spatial-reconciliation` |

수리한 것은 ① `breaker/circuit_breaker` 별칭 중복, ② 경계선 내부 ID/표시 ID 영수증 결박, ③ 재스캔 대상이 없는 19호출 전면 반복, ④ 긴 모선의 중심점만 보던 선로 결박, ⑤ 모델이 한 구획에서 잘못된 좌표를 반환할 때 해당 역할·구획만 재검사하는 경로다. 최종 실행에서는 좌표 형식 오류가 없어 추가 재검사는 발화하지 않았고 19회에서 종료했다.

최종 상태는 성공으로 올리지 않는다. 기기 수량은 맞았지만 관계 재현율이 9/13이고, OCR·구획 경계·KEC 입력 부재는 HOLD다. 재실행 명령은 `npm run validate:drawing-stages -- public-wiki http://127.0.0.1:3010`이며 영수증은 `test-results/drawing-reasoning-stages-public-wiki.json`에 생성된다. 영수증의 `workspaceSnapshot`은 HEAD, dirty 여부, 추적·미추적 변경 내용 해시를 함께 기록해 미커밋 실증을 깨끗한 커밋 실증으로 위장하지 않는다.

## 6차 모델별 high 추론 × 초·중·고 교보재 비교

2026-08-03에 production `/api/drawing-jobs` 경로로 Gemini 3.6 Flash, GPT-5.6 Terra, GPT-5.6 Sol을 모두 `high` 추론으로 실행했다. 정답표는 실행 전에 고정했고, 점수는 기호 수량 70% + 최소 관계 회수율 30%다. 모호한 판독은 최종 품질 PASS로 승격하지 않는다.

| 난이도 | 고정 교보재 | 사전 고정 핵심 라벨 |
|---|---|---|
| 초급 | `fixtures/drawings/external/wiki-oneline.png` | 변압기 1·발전기 1·차단기 6·리액터 1·관계 ≥13 |
| 중급 | `fixtures/drawings/external/wiring-real-sm.jpg` | 변압기/발전기/차단기 0·스위치 1·퓨즈 15·관계 ≥15 |
| 고급 | `fixtures/drawings/realworld/raster/kimm-20210602-design-p5-raster.png` | 변압기 3·발전기 0·차단기 ≥9·관계 ≥12 |

| 모델(high) | 초급 | 중급 | 고급 | 평균 점수 | 평균 시간 | 엄격 최종 품질 |
|---|---:|---:|---:|---:|---:|---|
| Gemini 3.6 Flash | 88% / 190초 | 62% / 271초 | 76% / 222초 | **75.3%** | **227.7초** | 3/3 FAIL |
| GPT-5.6 Terra | 85% / 572초 | 42% / 571초 | **94% / 449초** | **73.7%** | **530.5초** | 3/3 FAIL |
| GPT-5.6 Sol | 91% / 506초 | 42% / 571초 | 23% / 583초 | **52.0%** | **553.4초** | 3/3 FAIL |

점수만 보면 Gemini가 가장 빠르고 평균도 가장 높다. Terra는 고급 도면에서 수량·관계 라벨 94%를 회수했지만 평균 시간이 약 8.8분이고 중급 도면은 문서 기한 내 관계를 만들지 못했다. Sol은 초급은 높았으나 난이도 상승 시 재현성이 무너졌다. 세 모델 모두 최종 문서는 PARTIAL이고 OCR 모호성·구획 경계·누락 심사·KEC 필수 입력 부족 때문에 엄격 품질은 FAIL이다. 따라서 이 표는 “현재 단일 실행 성능”이지 안정적인 80% 제품 정확도 인증이 아니다.

실측 중 수리한 결함은 다음과 같다.

- API 요청의 `high` 추론이 역할 호출, 문서 지문, Google thinking level, 로컬 Codex effort까지 전달되도록 배선했다.
- 문서 제한시간이 실제 벡터·래스터 팀 호출 신호에 전달되지 않던 누수를 닫고, 중단 시 완료된 심사 봉투는 보존하도록 했다.
- 변압기 권선 심볼 여러 개를 물리 변압기 여러 대로 세던 중복 집계를 물리 장치 기준으로 보정했다.
- 로컬 Codex child가 응답 불능이 된 뒤 모든 후속 호출이 503이 되던 singleton을 1회 폐기·재생성하도록 했다.
- 역할별 구조화 출력에 다른 역할 컬렉션이 섞이던 오류를 역할 전용 JSON Schema로 차단했다. 최초 스키마는 선택 속성을 `required`에 넣지 않아 Terra 고급 도면 51개 역할 호출이 `LOCAL_CODEX_TURN_FAILED`로 일괄 실패했고 23%·관계 0%가 됐다. 모든 속성을 필수+nullable 계약으로 맞춘 뒤 같은 도면은 166기호·337문자·76관계, 94%로 회복됐다.
- 평가기가 `physicalEquipmentCount: null`을 0으로 바꿔 검출된 차단기 후보를 지우던 결함을 고쳤고, 기존 9개 영수증을 현재 평가기로 재채점했다.

재실행 명령은 `npm run validate:drawing-model-matrix`이며, 부분 선택은 `node --env-file=.env.local scripts/run-drawing-model-matrix.mjs --tiers=advanced --models=gpt-terra`다. 로컬 영수증은 `test-results/drawing-model-high-*.json`, 집계는 `test-results/drawing-model-matrix-high.json`에 생성되고 Git에는 포함하지 않는다. 9개 실행은 수리 과정의 3개 dirty snapshot에 걸쳐 있으며 집계의 `resultSnapshotHashes`와 각 영수증의 `workspaceSnapshot`으로 공개한다. 평가기 재채점 시점은 `evaluationSnapshot`으로 별도 기록한다.

## 7차 동일 snapshot 재실행·관계 조립 수리

2026-08-03에 6차 이후의 역할 스키마 수리를 포함한 dirty snapshot `d8f27b7b...`에서 3모델×3도면을 다시 실행했다. 그 뒤 공개 중급 결선도의 관계 조립을 수리하고 snapshot `e2c4d974...`에서 Gemini 중급만 표적 재실행했다. 따라서 아래 9칸과 표적 재실행은 같은 모델 순위표로 합산하지 않는다. 집계 영수증의 `comparison.valid=false`, `reason=MIXED_WORKSPACE_SNAPSHOTS`가 이를 기계적으로 차단한다.

| 모델(high) | 초급 | 중급 | 고급 | 동일 snapshot 평균 | 엄격 최종 품질 |
|---|---:|---:|---:|---:|---|
| Gemini 3.6 Flash | 86% / 217초 | 51% / 177초 | 80% / 272초 | 72.3% / 222초 | 3/3 FAIL |
| GPT-5.6 Terra | 83% / 241초 | 42% / 571초 | 91% / 423초 | 72.0% / 411.7초 | 3/3 FAIL |
| GPT-5.6 Sol | 88% / 262초 | 42% / 571초 | 23% / 567초 | 51.0% / 466.7초 | 3/3 FAIL |

중급 결선도는 Gemini가 기호 34개와 선 33개를 읽었지만 단일 선분의 양끝이 직접 기기에 닿을 때만 관계를 만들던 조립기 때문에 관계가 5개에 그쳤다. 구획 사이의 수직 분기선을 버스 선망까지 추적하고 평행선은 제외하도록 수리한 뒤 표적 재실행은 관계 20개, 관계 기준 100%, 종합 78%, 247초, 실제 시작 호출 41회였다. 수리 전 51%·관계 33% 대비 개선됐지만 기호축은 퓨즈 14/15, breaker 오탐 5, switch 2/1로 69%여서 전체 80%에는 미달했다.

이번 조사에서 새로 확정·수리한 앱 결함은 12건이다.

1. 비치명 source 실패 하나가 coverage audit 전체를 실패시킴.
2. 실패 뒤 성공한 재시도도 최종 FAIL로 계산함.
3. full-page source 실패를 모든 정밀 구획 재호출로 확대함.
4. 실제 source 실패와 합성 `role` 실패를 중복 재시도함.
5. 3역할 합산 rescan target을 역할별 상한 16개로 잘못 제한함.
6. 완결된 래스터 페이지도 `drawingKind=unknown`만으로 page-survey HOLD 처리함.
7. 서로 다른 source snapshot의 모델 결과를 같은 표로 직접 비교함.
8. 시작하지 않은 예약 호출까지 사용 호출 수로 집계함.
9. graph conflict 원인을 일반 coverage 문구로 소실함.
10. `disconnector`·`isolator`를 switch 평가 축에서 누락함.
11. 버스→분기선→기기 관계를 단일 선분 관계 조립기가 복원하지 못함.
12. null 의미로 반환된 `voltageV: 0` 때문에 논리 역할 전체를 폐기함.

수리 뒤 `test:drawing-v3` 278개, Vision·팀 212개, 관련 추가 회귀 68개, Node 영수증 16개가 통과했다. 이어 같은 dirty snapshot에서 `npx tsc --noEmit`, 경고 0 ESLint, 전체 Jest(331 suites·3,979 tests 통과, 각 1개 skip), production build, 문서 링크 검사, PDF gate 17/17을 모두 exit 0으로 확인했다. 이 개수는 dirty snapshot의 작업 영수증이며 커밋 불변 앵커가 아니다.

**수행 주체 확인**: 각 행의 커밋 작성자와 트레일러는 `git show -s --format=fuller <sha>`로 확인한다. 도구 이름이나 세션 기억은 실증 결과의 대체 근거로 사용하지 않는다.

## 8차 고밀도 도면·graph v7·KEC 212.7.2 수리

2026-08-03 공개 고밀도 MCC를 Agent Platform high로 다시 실행했다. 최종 실호출은 202.5초, 실제 provider 호출 55회, 기호 136개, 선 223개, 문자 212개, 관계 176개를 기록했다. 17개 계획 구획 중 16개가 완료됐고 coverage auditor 1개만 충돌했다. 호출 뒤 확정한 PT/VT와 피뢰기 별칭을 같은 봉투에 결정론적으로 재적용한 결과는 PASS 2·HOLD 7·FAIL 0이다. OCR 후보 212건, 경계 연속성 20건, 불확실 관계 152건, 근거 추적률 17.3%가 남아 전체 판정은 HOLD다.

북미 반복 분기 도면은 앞선 실호출 봉투를 graph v7로 재조립해 변압기 10/10, 버스 4/4, 부하 21/21과 관계 37건을 회수했다. 다만 관계는 confirmed 2건, ambiguous 35건이다. 이는 결정론적 조립 개선 증거이며 독립 edge 정답 기반 정확도 증거가 아니다.

코드 `2bf0ca6f8242c39bb3f036d529b5007a70b19ee8`에서 타입 검사, 경고 0 ESLint, 전체 Jest(332 suites·4,017 tests 통과, 1 suite·1 test skip), production build, PDF 실경로 gate 17/17, V3 계약 6/6, production SLD benchmark 1/1이 통과했다. golden gate는 독립 실도면 라벨·예측·서명 부재를 이유로 의도대로 exit 1과 `verified95=false`를 반환했다.

KEC 212.7.2 판정은 별도 과부하·단락 보호장치의 ID, 단락장치 통과에너지(A²s), 과부하장치 무손상 내량(A²s), source ID가 모두 있는 경우로 제한했다. 원문은 [국가법령정보센터 KEC PDF](https://www.law.go.kr/flDownload.do?flSeq=158125635)와 [대한전기협회 KEC eBook](https://kec.kea.kr/sub_tech/regulation_book.php?cate=2024-2-2&mode=ebook)에서 대조했다.

## 9차 로컬 모델 추론 단계 17조합 캘리브레이션

2026-08-03에 `fixtures/drawings/external/wiring-real-sm.jpg` 한 장을 production `/api/drawing-jobs`에 넣어 GPT-5.5, GPT-5.6 Luna/Terra/Sol의 지원 추론 조합 17개를 같은 snapshot에서 순차 실행했다. 계정 모델 목록에 `light/minimal`이 없어 `low/medium/high/xhigh/max`를 사용했다. GPT-5.5의 max는 미지원으로 기록했고, Luna는 사용자 조건대로 high 이상만 실행했다.

시간은 600초 안에서 점수화하지 않고 통과 경계로만 썼다. 후보 조건은 실제 모델·effort 지문 일치, 600초 이내, 문서 `COMPLETE`, 품질 `PASS`, 필수 역할 누락 0이다.

| 모델 | effort | 라벨 | 관계 | 시간 | 누락 역할 수 | 실패 호출 | 최종 | 누락 역할 |
|---|---|---:|---:|---:|---:|---:|---|---|
| GPT-5.5 | low | 42% | 0% | 571.2초 | 5 | 64 | PARTIAL/FAIL | symbols, connections, text, logic, coverage-auditor |
| GPT-5.5 | medium | 72% | 100% | 569.2초 | 1 | 7 | PARTIAL/FAIL | coverage-auditor |
| GPT-5.5 | high | 42% | 0% | 571.5초 | 5 | 32 | PARTIAL/FAIL | symbols, connections, text, logic, coverage-auditor |
| GPT-5.5 | xhigh | 73% | 100% | 581.4초 | 2 | 9 | PARTIAL/FAIL | symbols, coverage-auditor |
| GPT-5.6 Luna | high | 42% | 0% | 571.0초 | 5 | 32 | PARTIAL/FAIL | symbols, connections, text, logic, coverage-auditor |
| GPT-5.6 Luna | xhigh | 72% | 100% | 459.2초 | 3 | 10 | PARTIAL/FAIL | symbols, connections, coverage-auditor |
| GPT-5.6 Luna | max | 42% | 0% | 571.0초 | 5 | 28 | PARTIAL/FAIL | symbols, connections, text, logic, coverage-auditor |
| GPT-5.6 Terra | low | 74% | 100% | 398.0초 | 2 | 6 | PARTIAL/FAIL | connections, coverage-auditor |
| GPT-5.6 Terra | medium | 42% | 0% | 570.7초 | 5 | 64 | PARTIAL/FAIL | symbols, connections, text, logic, coverage-auditor |
| GPT-5.6 Terra | high | 88% | 100% | 421.1초 | 1 | 3 | PARTIAL/FAIL | coverage-auditor |
| GPT-5.6 Terra | xhigh | 42% | 0% | 570.7초 | 2 | 29 | PARTIAL/FAIL | connections, coverage-auditor |
| GPT-5.6 Terra | max | 99% | 100% | 487.5초 | 4 | 11 | PARTIAL/FAIL | symbols, connections, logic, coverage-auditor |
| GPT-5.6 Sol | low | 92% | 100% | 571.4초 | 2 | 51 | PARTIAL/FAIL | connections, coverage-auditor |
| GPT-5.6 Sol | medium | 76% | 100% | 454.4초 | 2 | 8 | PARTIAL/FAIL | connections, coverage-auditor |
| GPT-5.6 Sol | high | 42% | 0% | 570.8초 | 2 | 29 | PARTIAL/FAIL | connections, coverage-auditor |
| GPT-5.6 Sol | xhigh | 99% | 100% | 463.1초 | 3 | 7 | PARTIAL/FAIL | symbols, connections, coverage-auditor |
| GPT-5.6 Sol | max | 56% | 0% | 571.5초 | 4 | 24 | PARTIAL/FAIL | symbols, connections, logic, coverage-auditor |

**판정: 추천 후보 0/17.** Terra/high가 라벨 88%·관계 100%·누락 1역할·실패 3건으로 가장 덜 불완전했지만 coverage auditor가 없어 채택하지 않는다. Terra/max와 Sol/xhigh의 99%는 각각 필수 역할 4개와 3개가 빠진 부분 점수다.

> **2026-08-04 정정 — 위 표의 `누락 역할` 열은 두 가지를 합쳐 세고 있다.**
> `coverage-auditor`는 판독 역할이 아니라 파생 판정이다. 커버리지 원장의
> `rolesPresent`에 들어가려면 다른 역할·재검사 대상·그래프 충돌이 **전부**
> 해소돼야 한다([document-orchestrator.ts](../src/agent/drawing/document-orchestrator.ts)의
> `markCouncilCoverage`). 따라서 감사기가 정상 응답해도 나머지가 하나만 남으면
> "누락"으로 찍힌다. 17조합 전부에서 `coverage-auditor`가 누락으로 기록된 것은
> 모델이 감사 역할을 못 했다는 뜻이 아니라, 어떤 조합도 완전 해소에 도달하지
> 못했다는 뜻이다. 표의 "누락 1역할"(Terra/high)은 실제로는 **판독 역할 손실
> 0건 + 감사 미해결**이다. 후보 자격 판정 자체는 바뀌지 않는다 — 0/17은 그대로다.
>
> 이후 실행부터 캘리브레이션 게이트는 두 원인을 분리해 기록한다:
> `REQUIRED_ROLES_MISSING`(기호·연결·문자·논리 손실),
> `COVERAGE_AUDIT_UNRESOLVED`(감사기는 응답했으나 미해결 잔존),
> `COVERAGE_AUDIT_NO_RECEIPT`(감사기 무응답). 표 출력도 `판독누락`과 `감사`
> 열로 나뉜다. 수리 방향이 정반대이므로 같은 칸에 세지 않는다 — 판독 손실은
> 모델·호출 문제, 감사 미해결은 재검사·그래프 충돌 문제다.

실패 기록 414건의 원인은 `LOCAL_CODEX_TIMEOUT` 281건, 문서 deadline/abort 93건, graph conflict 24건, malformed structured output 3건, 기타 13건이다. 따라서 이번 결과는 고급 모델 자체의 순수 판독 순위보다 **같은 effort를 30~48개 전체·구획 역할 호출에 일괄 적용하는 현재 구조의 포화**를 더 강하게 보여 준다. 다음 설계 안건은 단순 기호·문자 추출과 관계·논리·감사 합성의 effort를 분리하는 것이다. 이 변경은 별도 동일 snapshot A/B 없이 적용하지 않는다.

실행 명령은 `npm run validate:drawing-effort-calibration -- --tiers=intermediate`이며 `--resume`, `--aggregate-only`, 모델·effort·tier 필터를 지원한다. 라이브 결과 snapshot은 `f70da7f6132ec04ec8db689385c49c1a3a4cf18c7e4d0368c77fe986d32d3b3a`, clean `0d475fc1961a3f9daab8687ae54551702590f037` 재채점은 동일 후보 0/17이다. 영수증은 `test-results/drawing-calibration-*.json`, 집계는 `test-results/drawing-effort-calibration.json`에 생성되며 Git에는 포함하지 않는다.

## 재실증 레시피 (앵커 재실행)

| 명령 | 전제 | 커버 |
|---|---|---|
| `npm test -- --runInBand` | 없음 | 전체 회귀. 스위트·테스트 **개수는 여기 적지 않는다** — 기능이 바뀌면 같이 바뀌어 반드시 드리프트한다. 아래 앵커 표의 날짜·커밋에 묶인 수치만 증거다 |
| `npm run test:calc` | 없음 | 계산기 known-answer (`src/engine/calculators/__tests__/accuracy-known-answers.test.ts`) |
| `npm run gate:pdf` | **3010 라이브 서버** | 실도면 fixtures → `/api/pdf-drawing` 라이브 관통 |
| `npm run gate:sld-golden` | 예측 산출물 + attestation 키 (아래 주의) | golden adjudicated 라벨 대조 |
| `npm run gate:sld-v3-contract` | 없음 | evaluator 계약 |
| `npm run gate:chat-live` | production build | 실제 `/api/chat` 계산기 실행, 모델 영수증 전달, SSE 순서 |
| `npm run test:scripts` | 없음 | `scripts/lib` node-test (캘리브레이션 게이트·영수증 생성기·모델 채점). 2026-08-04 이전에는 어떤 게이트에도 연결돼 있지 않았다 |
| `npm run gate:claude-local-live` | 로그인된 `claude` CLI | `claude-local` 공급자 실호출. 사용자 계정 사용량을 쓰므로 전체 게이트에는 넣지 않는다 |

## 10차 중급 재현성 실측 — 같은 스냅샷 3회 (2026-08-04)

`be1d1bc`(개폐 계열 병합 수리) 이후 3010 production 서버에서 Gemini 3.6 Flash,
high, `wiring-real-sm.jpg`를 **같은 스냅샷으로 3회** 실행했다. 정답은 스위치
1·퓨즈 15·차단기 0이다.

| 회차 | 종합 | 관계 | 시간 | switch | fuse | breaker |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 73% | 100% | 131초 | 8 | 14 | 2 |
| 2 | 75% | 100% | 208초 | 2 | 11 | 10 |
| 3 | 70% | 100% | 128초 | 2 | 5 | 2 |

**같은 입력·같은 설정에서 퓨즈가 14→11→5로 흔들린다.** breaker 2/10/2,
switch 8/2/2도 같은 폭이다. 관계축만 3회 모두 100%다.

### 이 표가 뒤집는 것

- **7차의 표적 재실행 78%(기호축 69%)와 이번 70~75%를 개선/악화로 읽으면 안 된다.**
  78%도 단발이고 이번 3회 폭이 70~75%다. 두 구간이 겹치므로 단발 대 단발
  비교는 성립하지 않는다. 6·7차 표의 모든 단발 수치에 같은 단서가 붙는다.
- `be1d1bc`의 효과는 **이 노이즈 폭에서 측정 불가**다. 단위 테스트 6건이 각
  오탐 기제를 고정하고 3회 어디서도 회귀가 없었으므로 유지하지만, "기호축을
  올렸다"고 주장하지 않는다.
- 1회차 switch 8은 수리 회귀가 아니다. 해당 6개 노드는 좌표가 서로 떨어져
  있어 어떤 병합 규칙으로도 합쳐지지 않으며, 수리 셋은 모두 노드를 줄이는
  방향이라 개수를 늘릴 수 없다. run2·run3에서 2로 돌아왔다.

### 다음 순서를 바꾼다

중급의 병목은 판독 정확도가 아니라 **재현성**이다. 같은 입력에 퓨즈를 5개와
14개로 읽는 상태에서는 병합·프롬프트 수리의 효과를 측정할 수 없다. 노이즈가
신호보다 크다. 이 축은 claude-local 3회(12/9/9)와 9차 캘리브레이션 후보
0/17에서도 관측됐으므로 3사 공통 문제로 다룬다.

따라서 기호축 수리보다 앞서야 할 일은 다음 둘이다.

1. 모든 셀을 최소 3회 반복하고 평균이 아니라 **최저점과 폭**을 기록하도록
   매트릭스 러너를 바꾼다. 단발 수치는 원장에 새로 넣지 않는다.
2. 편차의 출처를 분리한다 — 역할 호출 자체의 비결정성인지, 구획 선택인지,
   재스캔 경로인지. `test-results/drawing-model-high-*.json`의 역할별 봉투를
   3회 대조하면 가릴 수 있다.

재실행 명령은 아래와 같다. 서버에 `DRAWING_JOB_STORE_DIR`(절대경로)이
없으면 지속형 저장소 부재로 503이며, 이는 운영 fail-closed가 의도대로
동작한 것이다.

```bash
node --env-file=.env.local scripts/run-drawing-model-matrix.mjs --models=gemini --tiers=intermediate --repeat=3
```

### 러너 반복 축 도입과 첫 3회 (2026-08-04)

위 진단에 따라 매트릭스 러너에 `--repeat=N`을 넣었다. 대표값은 **평균이 아니라
최저점**이고, 표에는 `최저~최고`와 기호 타입별 회차값·폭을 함께 적는다.
평균을 쓰지 않는 이유는 한 회차만 무너져도 그 산출물로 검토서를 쓸 수 없기
때문이다. 한 회차라도 실패하거나 PASS가 아니면 셀 전체가 그 상태다.

같은 서버·같은 스냅샷에서 `--repeat=3`으로 다시 뽑은 값이다.

| 축 | 회차값 | 폭 |
|---|---|---:|
| 종합 | 85 / 85 / 77% | 8p |
| 관계 | 100 / 100 / 100% | 0 |
| 시간 | 123 / 216 / 215초 | 93초 |
| fuse (정답 15) | 14 / 14 / 13 | 1 |
| switch (정답 1) | 1 / 1 / 2 | 1 |
| **breaker (정답 0)** | **5 / 8 / 12** | **7** |

직전 3회(퓨즈 14→11→5, switch 8/2/2)와 비교하면 퓨즈 폭 9→1, switch 폭 6→1로
좁아졌고, **남은 불안정은 breaker 오탐 하나**다. 정답이 0인데 5~12개를 만들어
내므로 병합이 아니라 판독 단계 과잉 검출이며, `be1d1bc`의 강겹침 병합이 이 축을
잡지 못했음을 뜻한다.

> 종합이 70~75%에서 77~85%로 올라 보이지만 **개선 근거로 쓰지 않는다.** 두 묶음
> 모두 3회이고 구간이 겹치며, 회차 운과 수리 효과를 이 표본에서 가를 수 없다.
> 이 러너를 만든 이유가 정확히 그 오독을 막기 위해서다.

### 11차 중급 3사 동시 3회 — 부분 판독 병합 이후 (2026-08-04)

부분 판독 병합(퓨즈 몸통의 상단 조각을 유령 차단기로 남기지 않는 수리)을 포함한
번들로 같은 서버·같은 스냅샷에서 Gemini·Terra·Sol을 각 3회 실행했다. 비대칭
충돌 규칙(조각이 본체 확정을 강등하지 못하게 하는 후속 수리)은 **이 번들에
없다** — 실행 중 소스에만 들어갔고 다음 재빌드부터 적용된다.

| 모델 | 종합(회차) | 관계 | 시간 | breaker(0) | switch(1) | fuse(15) |
|---|---|---|---|---|---|---|
| Gemini 3.6 Flash | 84/92/94% | 100 고정 | 115~125초 | **0/0/0** | 3/2/1 | 8/14/9 |
| GPT-5.6 Terra | **87/42/99%** | 0~100 | 545~571초 | 0/0/0 | 6/0/1 | 14/0/14 |
| GPT-5.6 Sol | 42/42/42% | 0 고정 | 571~581초 | 0/0/0 | 0 고정 | 0 고정 |

읽는 법:

- **breaker 오탐이 9회 전부 0이다.** 10차의 5/8/12(부분 판독 병합 이전)에서
  이 수리 이후 0/0/2(직후 3회) → 0/0/0(이번 9회)로, 유령 차단기 축은 닫힌
  것으로 판정한다. 이번 세션에서 실측으로 닫힌 첫 기호축이다.
- **Terra 42%는 판독 실패가 아니라 마감 도달이다.** 42% 회차만 571초(문서
  기한)이고 switch·fuse가 0이다 — 역할이 잘려 아무것도 못 돌려준 회차다.
  시간 안에 든 회차는 87%·99%로 뛴다. 9차 캘리브레이션의 진단(시간 포화)이
  3회 반복에서 그대로 재현됐다. 단발이었으면 42%든 99%든 아무 쪽이나 그 셀의
  성능으로 기록됐을 것이다.
- **Sol은 3회 전부 마감 도달(42%·관계 0)이다.** 중급에서 단독 판독기로 쓸 수
  없다는 9차 판정이 유지된다.
- **Gemini fuse 8/14/9는 남은 최대 불안정 축**이며, 원인은 조각 흡수가 본체
  확정을 강등해 물리 카운트가 무너지는 것(count-register 는 confirmed 만
  센다)으로 특정됐다. 비대칭 충돌 규칙이 이 축을 겨냥하며 다음 재빌드
  재실측으로 판정한다.

교차 스냅샷 주의: 10차 직후 3회(77~85%)와 이번 Gemini(84~94%)는 같은 번들이
아니다(러너 반복 축 커밋이 사이에 있다). 구간이 겹치므로 개선 주장에 쓰지
않는다.

### 12차 비대칭 충돌 규칙 검증 — Gemini 중급 3회 (2026-08-04)

조각의 타입 충돌이 본체 확정을 강등하지 못하게 하는 비대칭 규칙을 포함한
번들로 재실행했다.

| 축 | 회차값 | 폭 |
|---|---|---:|
| 종합 | 80 / 99 / 84% | 19p |
| breaker (0) | 5 / 0 / 1 | 5 |
| fuse (15) | 9 / 14 / 17 | 8 |

**11차의 "유령 차단기 축 닫힘" 판정을 정정한다 — 정확히는 "본체가 판독된
위치에서는 닫힘"이다.** 1회차 breaker 5개의 좌표는 x=131·330·1072·1121·1170
으로, 같은 회차 fuse 노드 좌표에 이 위치가 전부 없다. 즉 그 회차에 모델이
FU1·FU2·FU6 자리의 퓨즈 본체를 아예 반환하지 않아 상단 조각이 병합 대상
없이 고아로 남은 것이다. 본체가 있는 위치에서는 12차에서도 오탐이 없다.

따라서 병합·강등 수리(부분 판독 병합 + 비대칭 규칙)는 각자의 기제를 닫았고,
**남은 퓨즈 폭 8p(9/14/17)는 병합이 아니라 상류 판독 변동** — 회차마다 퓨즈
본체 자체가 사라지거나 초과 검출되는 — 이다. 이 축은 결정론 장치로 흡수할 수
없으며, 다음 후보는 ① 고아 조각(주변 동형 기기 대비 조각 크기 노드)을
기기 수에서 확인 항목으로 강등, ② 역할 프롬프트의 반복 기기 완전 열거 강화,
③ 3회 합집합 판독이다. 어느 것도 같은 스냅샷 3회 실측 없이 적용하지 않는다.

### `claude-local` 공급자 실호출 (2026-08-04)

API 키 없이 로그인된 `claude` CLI를 도면 역할 판독 공급자로 쓰는 경로를 열고
`claude-sonnet-5`, effort medium으로 `wiki-oneline.png`를 3회 호출했다.

| 회차 | 시간 | 기호 | 분포 |
|---|---:|---:|---|
| 1 | 22.9초 | 12 | 차단기 7·모선 2·발전기 1·변압기 1·리액터 1 |
| 2 | 22.3초 | 9 | 차단기 6·발전기 1·변압기 1·리액터 1 |
| 3 | 12.8초 | 9 | 차단기 6·발전기 1·변압기 1·리액터 1 |

사전 고정 라벨(변압기 1·발전기 1·차단기 6·리액터 1)과 3회 중 2회가 네 항목
모두 일치했다. 1회차만 차단기를 1개 더 세고 모선 2개를 추가했다. **3회에서
답이 갈렸다는 것 자체가 이번 관측의 내용이다** — 재현성을 특성화하려면 회차가
더 필요하다.

> **이 표는 6·7차 모델 매트릭스와 같은 줄에 놓을 수 없다.** 여기서 잰 것은
> 공급자 단일 호출이고, 매트릭스의 86%/83%/88%는 구획 분할·5역할 심사·그래프
> 조립·coverage auditor를 모두 통과한 파이프라인 점수다. `claude-local`의
> 매트릭스 행은 3010 서버에서 `npm run validate:drawing-model-matrix --
> --models=claude-local`을 돌린 뒤에만 기록한다.

### 역할별 추론 프로필 A/B (2026-08-04 도입, **아직 실측 없음**)

`--profile` 로 역할별 추론 단계를 지정할 수 있다. **기본값은 프로필 없음**이라 지정하지
않으면 모든 역할이 종전대로 같은 `effort` 를 쓴다. 기본 프로필 승격은 아래 두 실행을
같은 snapshot 에서 돌려 시간·판독 역할 손실·감사 상태를 비교한 뒤에만 한다.

```bash
npm run validate:drawing-effort-calibration -- --models=terra --efforts=high --tiers=intermediate
```

```bash
npm run validate:drawing-effort-calibration -- --models=terra --efforts=high --tiers=intermediate --profile={"symbols":"low","text":"low"}
```

두 실행의 영수증은 프로필 라벨로 파일이 갈려 서로 덮어쓰지 않는다. 페이지 지문에도
프로필이 들어가므로 프로필을 바꾸면 이전 페이지 봉투를 재사용하지 않는다 — 이 결박이
없으면 A/B 가 같은 결과를 두 번 채점하게 된다.

3010 서버 기동 (standalone은 static/public을 **자동 복사하지 않는다** — 재발 함정):

```bash
npm run build && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public && (cd .next/standalone && PORT=3010 node server.js)
```

**`gate:sld-golden` exit 1 은 "실증 없음"이 아니다**: 이 게이트는 fail-closed 설계라 예측 파일(`test-results/sld-synthetic-predictions.json`)과 attestation 키 없이는 영수증(`test-results/sld-golden-gate.json`)에 사유를 남기고 exit 1 한다(2026-07-22 실측: `ATTESTATION_KEY_MISSING`·`PREDICTION_MISSING:synthetic-degraded`·`MANIFEST_NOT_CLAIM_ELIGIBLE`). "verified-95" **주장 자격**을 잠그는 과장 방지 장치이며, 사유는 영수증 JSON을 읽으면 나온다.

## 교보재 지도 (2026-07-22 실측 69파일)

```
fixtures/
├── drawings/
│   ├── synthetic/            합성 라벨 30파일 (1차·golden 라벨원)
│   ├── realworld/            실도면 — incoming · raster · results · results-after
│   ├── golden/               sld-golden-manifest.json + kimm-panelboard-sld.p14.adjudicated.json
│   ├── external/ local/ public/
└── rules/                    사내규정 룰셋 fixture
```

## 재실증 요구가 정당한 경우 / 아닌 경우

- **정당**: 교보재가 덮지 않는 새 표면(새 도면 유형·새 파서 경로·새 판정층) · 도메인 규칙 개정 · 게이트 자체의 결함 의심(그 경우 게이트를 고치는 게 일이다).
- **불필요**: 위 표가 덮는 표면에 대한 "실증이 없다"는 주장 — 답은 앵커 재실행이다. 재실행이 red면 그것은 실증 부재가 아니라 **회귀**다: 마지막 green 커밋과의 전후 차분으로 원인 커밋을 찾는 게 다음 행동이다.

## 갱신 규율

새 실증을 수행하면 이 표에 행을 추가한다(커밋 SHA·교보재 경로·결과·재실행 게이트).
**앵커 없는 실증 주장은 이 원장에 올릴 수 없다** — 이 문서 자체에도 적용된다.

> 현재 커밋 제품 기준선: `2bf0ca6f8242c39bb3f036d529b5007a70b19ee8`. 이번 수리의 라이브 모델 영수증은 각 파일의 `workspaceSnapshot`에 호출 당시 dirty snapshot 해시를 별도로 기록했다. 현재 결정론 재평가는 호출 결과와 분리해 기록한다.
