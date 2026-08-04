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

### 13차 재스캔 폴백 — 편차 출처 정정과 실측 (2026-08-04)

12차의 편차 진단을 코드로 되짚어 **앞선 "재스캔이 편차를 증폭한다"는 판단이
틀렸음을 확인했다.** 영수증의 호출 수 34/45/34에서 45회 회차만 재스캔이 돌았고
그 회차가 99%로 가장 좋았다. 대표 회차(80%, 34호출)는 `p0-full` 구획이
`failed`이고 `HOLD_RESCAN_UNRESOLVED`가 남았는데도 재스캔을 한 번도 못 돌았다.

원인은 `canRescan`의 `targets.length > 0` 조건이다. 재검사 대상은 감사기의
`rescanTargets`와 `failedRoleRescanTargets`(**역할 호출 실패**)에서만 나온다.
구획 자체가 실패했는데 역할 실패 목록이 비면 대상이 0이 되어, 어디를 다시
볼지 알면서도 포기한다. **재스캔은 편차를 키우는 게 아니라 줄인다.**

수리: 두 경로가 모두 대상을 내지 않고 구획이 남으면 미완료 구획 경계를 대상으로
삼는 결정론적 폴백(`gapRegionRescanTargets`)을 넣었다. 단, **판독 역할 호출이
실제로 실패한 구획만** 고른다 — 그래프 충돌·감사 미해결로 미완료인 구획은 같은
입력을 다시 보내도 같은 결과라 호출 예산만 3배로 태운다. 기존 테스트가 그
부정 케이스(충돌만 있을 때 재시도 없음)를 이미 잠그고 있다.

같은 서버·같은 스냅샷 `--repeat=3` 실측:

| 축 | 12차(폴백 전) | 13차(폴백 후) |
|---|---|---|
| 종합 | 80 / 99 / 84% (폭 19p) | 98 / 92 / 83% (폭 15p) |
| 최저점 | 80% | **83%** |
| breaker (0) | 5 / 0 / 1 | 0 / 0 / 2 |
| fuse (15) | 9 / 14 / 17 | 18 / 14 / 12 |
| 호출 | 34 / 45 / 34 | **64 / 70 / 34** |
| 시간 | 109~214초 | **114~406초** |

폴백이 두 회차에서 실제로 발동했다(호출 64·70). 최저점이 3p 오르고 폭이 4p
줄었지만 **개선으로 확정하지 않는다** — 두 묶음 모두 3회이고 구간이 겹친다.
확정적으로 말할 수 있는 것은 ① 폴백이 의도한 조건에서 발동했고 ② 3회차는
폴백 조건(역할 호출 실패)을 만족하지 않아 34호출로 남았다는 사실뿐이다.

대가는 시간이다. 재스캔이 도는 회차는 약 400초로 이전의 2배이며, 문서 기한
570초에 더 가까워졌다. 고밀도 도면에서는 이 폴백이 마감 초과를 유발할 수
있으므로, 폴백 대상 상한(`MAX_GAP_FALLBACK_TARGETS = 6`)과 기존 시간 여유
검사(`canRescan`)가 함께 걸린다.

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

### 역할별 추론 프로필 A/B — 첫 실측 (2026-08-04)

`wiring-real-sm.jpg` · gemini · intermediate · 각 팔 3회. 두 팔 모두 `갇힌 표기 강등`
커밋(`920a53d`) 번들에서 돌렸다 — 지정문자 수리(`79f344b`) 이전이라 두 팔의 조립 코드는 같다.

| 팔 | 라벨 | 폭 | 시간 | 호출 |
|---|---|---|---|---|
| 균일 high (기본) | 75 / 83 / 99% | **24p** | 121~126s | 34 / 34 / 34 |
| `{"symbols":"low","text":"low"}` | 99 / 99 / 99% | **0p** | 215~330s | 47 / 58 / 65 |

**추론을 낮췄더니 더 잘, 더 고르게 읽었다.** 기전은 호출 수에 보인다. 역할별 단계를
낮추면 단일 패스가 약해지고 → coverage auditor 가 공백을 잡고 → 재스캔이 발화해
호출이 34에서 47~65로 늘어난다. **싼 눈길 여러 번이 깊은 눈길 한 번을 이겼다.**
반대로 high 는 자신 있는 한 패스를 감사가 통과시켜 버려서 공백이 두 번째 눈길을 못 받는다.

즉 이 도면의 편차는 **추론 깊이가 아니라 커버리지 문제**였다.

**아직 기본값으로 승격하지 않는다**:

- 팔당 n=3 이다. 세 번이 모두 천장(99%)에 닿았다는 것과 "폭 0p" 가 성질이라는 것은 다르다.
- 도면 1장·모델 1개·난이도 1단계다.
- 시간이 2~2.7배, 호출이 1.4~1.9배다. 마감이 빡빡한 문서(Terra 571s 계열)에서는 이 교환이 반대로 뒤집힐 수 있다 — 그쪽이 원래 이 A/B 를 만든 동기였고 아직 안 돌렸다.

**정정**: 이 절의 이전 판은 레시피를 `validate:drawing-effort-calibration` 로 적었고
그 스크립트에는 `--profile` 이 처음부터 있었다. 이번에 붙인 것은 **매트릭스 스크립트**의
같은 축이다(라벨 점수·폭을 주고, 캘리브레이션 쪽은 단계·역할 근거를 준다). 레시피가
실행 불가였던 것이 아니다.

```bash
node --env-file=.env.local scripts/run-drawing-model-matrix.mjs --tiers=intermediate --models=gemini --repeat=3
```

```bash
node --env-file=.env.local scripts/run-drawing-model-matrix.mjs --tiers=intermediate --models=gemini --repeat=3 --profile='{"symbols":"low","text":"low"}'
```

영수증은 프로필 해시로 파일이 갈린다(`drawing-model-matrix-high-pb0255e1c.json`).

### 역할별 추론 프로필 A/B (2026-08-04 도입)

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

## 14차 접지 소견 세분화 — 그리고 교보재 공백 실측 (2026-08-04)

**한 일**: `hasGroundPath` 이진값 하나로만 판단하던 접지 소견에, "같은 종류 기기 중
일부만 접지망에 물린" 불일치 지목을 더했다(`recommendation-engine.ts`). 판정이 아니라
`HOLD` 확인 항목이다 — 어떤 기기가 접지 대상인지는 시공 조건이라 도면만으로 정할 수 없다.

**중간에 자른 설계 — 실측이 뒤집었다.** 처음 구현은 "접지망에 안 물린 확정 기기 전부"를
지목했다. 저장된 실제 판독 결과 20건에 규칙을 재생해 보니 매 실행 **15–23개**를 지목했다.
전부 소음이다. 그래서 "도면 스스로가 접지를 표기한 종류 안에서의 불일치"로 좁혔고,
같은 20건 재생에서 지목 수는 **0**이 됐다.

| 규칙 | 20회 실행 지목 수(확정 기기 2–23개 중) |
|---|---|
| 나이브(접지 미연결 전부) | 15–23 |
| 좁힌 규칙(동종 내 불일치) | 0 |

**실측으로 드러난 별개의 공백 — 접지를 그린 교보재가 없다.**

- 저장된 20회 실행의 선 **577개 중 `lineKind === 'ground'` 는 0개**. 접지로 읽히는 심볼도 0개.
- 원본(`fixtures/drawings/external/wiring-real-sm.jpg`)을 직접 확인: QS1 단로기 + L1/L2/L3 모선 + FU1–FU6 퓨즈 분기뿐, **접지 표기가 실제로 없다**. 즉 0은 판독 실패가 아니라 정답이다.
- `american.png` · `wiki-oneline.png` 도 접지 표기가 없다. `fixtures/drawings/realworld/results/*.json` 은 구 `components` 형식이라 근거 그래프 수준의 접지선이 없다.
- **따라서 접지 분기(기존 critical "접지 경로 없음" 포함)는 오늘 어떤 교보재로도 라이브 실행되지 않는다.** 이 항목은 단위 시험으로만 덮여 있다. 접지를 그린 도면을 교보재에 추가하기 전까지 "실증됨"으로 올리지 않는다.

**표기 형태 2종을 모두 본다**: 접지로 분류된 선, 그리고 보통 선으로 이어진 접지 심볼.
후자가 단선도에서 더 흔하다 — `fixtures/drawings/realworld/results/rsc-p4-basic-en.json`
에 모델이 `type: "ground"` 심볼을 낸 실제 사례가 있다. 선만 봤다면 이 표기를 통째로 놓친다.

**`DeviceClass` 에 'ground' 를 더하지 않았다**: 그 열거는 "경로에 보호기 없음" critical
소견의 입력이다. 항목을 늘리면 그 판정이 같이 흔들린다. 접지 판별은 소견 엔진 안에서만 정의했다.

재실행:

```bash
npx jest src/agent/drawing/__tests__/recommendation-engine.test.ts --runInBand
```

## 15차 기기 몸체에 갇힌 표기 강등 (2026-08-04)

**실측이 먼저다**: 저장된 실제 판독 20회의 근거 그래프를 훑어 "다른 확정 심볼 안에
사실상 갇힌(포함률 ≥0.9, 몸체 면적 ≥4배) 확정 심볼"을 셌다.

| 항목 | 값 |
|---|---|
| 확정 심볼 합계 | 322 |
| 갇힌 심볼 | 15 (4.7%) |
| 갇힌 심볼의 타입 | **전부 `terminal`** |
| 몸체의 타입 | 전부 `fuse` |
| 20회 중 발생 실행 | 4회 (1·3·4·7개) |

원본(`fixtures/drawings/external/wiring-real-sm.jpg`)을 열어 확인했다: 각 퓨즈 사각형
위·아래에 단자 번호 **"1"·"2"** 가 인쇄돼 있고, 그 자리에 별개 단자대는 없다.
모델이 이 숫자를 `terminal` 기기로 읽은 것이다. 확정으로 남으면 물리 기기 수가 부풀고
검토자는 없는 단자대를 찾는다.

**중복 병합기가 못 잡는 이유**: 병합 조건은 "같은 기기의 두 번 판독"이라 타입이
호환되거나 개폐 계열끼리여야 한다. `terminal` ⊄ `fuse` 는 둘 다 아니다. 여기는 다른
질문이다 — "겹친 두 판독이 같은 기기인가"가 아니라 "작은 판독이 큰 기기의 **표기**인가".

**안전 방향**: 노드도 근거도 지우지 않는다. `ambiguous` 로 내려 물리 수에서만 빠지고
`userConfirmItems` 확인 항목("별개 기기입니까, 표기입니까?")이 붙는다. 그리고
source·protection·load·bus 로 분류되는 심볼은 갇혀 있어도 강등하지 않는다 — 그 분류가
"경로에 보호기 없음" critical 소견의 입력이라 여기서 조용히 내리면 판정이 같이 사라진다.

**라이브 검증 (수리 후 번들, `wiring-real-sm.jpg` · gemini · intermediate · 3회)**:

| 회차 | 강등 | 강등된 후보 | 라벨 | 호출 |
|---|---|---|---|---|
| 1 | 3 | 전부 `terminal` / rawLabel `"1"` | 99% | 34 |
| 2 | 6 | 전부 `terminal` / rawLabel `"1"` | 83% | 34 |
| 3 | 0 | — | 75% | 34 |

9건 전부 퓨즈 몸체 안의 단자 번호였다. **구조 기기(fuse·breaker·switch)는 한 건도
건드리지 않았다** — 이것이 이 변경이 하기로 한 주장의 전부다.

**라벨 점수는 이 수리에 둔감하다 — 설계상 그렇다.** 채점기는 fuse·breaker·switch 를
세고 `terminal` 은 세지 않는다. 점수가 안 움직이는 게 정상이고, 이 수리가 줄이는 것은
**유령 기기 수**지 라벨 정확도가 아니다. 이번 3회의 75~99%(폭 24p)를 직전 3회의
83~98%(폭 15p)와 비교해 좋다/나쁘다고 말할 수 없다 — 구간이 겹치고, 호출 수도
34/34/34 대 64/70/34 로 조건이 달랐다(재스캔 발화 여부는 실행마다 갈린다).

재실행:

```bash
npx jest src/agent/drawing/__tests__/evidence-deduplicator.test.ts --runInBand
```

```bash
node --env-file=.env.local scripts/run-drawing-model-matrix.mjs --tiers=intermediate --models=gemini --repeat=3
```

## 16차 지정문자 판정 — 도입·회귀·수리 (2026-08-04)

**발단**: 5회 실행에서 퓨즈 후보를 매번 14~15개 **읽어 놓고** 확정은 11~14개였다.
손실은 판독이 아니라 판정이었고, 매번 라벨 `FU2` 노드가 `["fuse","switch"]` 로 남았다.
`canonicalSymbolType` 은 들어오는 판독 하나만 정규화해서, 지정문자를 쥐고도 충돌
해소 단계에서 ambiguous 로 무너졌다.

**내가 넣은 회귀 (`79f344b`)**: 지정문자 분기를 조각/본체 비대칭 판정 **앞**에 뒀다.
그래서 반토막 판독까지 라벨만 보고 확정으로 올라갔다. 그래프를 열어 확인한 실물:

| 실행 | 퓨즈 확정 | 중앙 높이 | 반토막(중앙의 60% 미만) 확정 |
|---|---|---|---|
| 1 | 14 | 74px | **6개** (전부 18px) |
| 2 | 17 | 79px | 1개 (37px) |
| 3 | 15 | 79px | 3개 (전부 38px) |

라벨 점수는 오히려 올랐지만(75~99 → 92~100) **기전이 내가 주장한 것과 달랐다.**
점수가 좋아진 것은 서로 상쇄되는 오류였다 — 잃던 퓨즈를 되찾은 게 아니라
조각을 퓨즈로 세고 있었다.

**수리**: 지정문자는 **비슷한 크기끼리의 진짜 타입 충돌**만 푼다(`!hitIsFragment
&& !hitIsBody`). 조각 보호를 건너뛰지 않는다.

| 번들 | 라벨 | 폭 | 퓨즈(정답 15) | 반토막 확정 |
|---|---|---|---|---|
| 지정문자 이전 (`920a53d`) | 75 / 83 / 99% | 24p | 14 / 12 / 11 | — |
| 무가드 (`79f344b`) | 92 / 98 / 100% | 8p | 17 / 14 / 15 | 6 / 1 / 3 |
| 가드 적용 | 98 / 100 / 100% | 2p | 15 / 15 / 18 | **2 / 0 / 0** |

**전부를 이 수리 공으로 돌리지 않는다**: 세 팔의 호출 수가 34/34/34 · 62/34/60 ·
34/63/60 으로 갈렸다. 위 A/B 가 보였듯 커버리지(재스캔 발화 여부)가 점수를 크게
움직이므로, 75→98 의 상당 부분은 실행 조건 차이다. 조각 확정 수(10건 → 2건)는
직접 센 값이라 이쪽이 이 수리의 실제 주장이다.

**남은 결함 2건 — 이름을 붙여 둔다(미수리)**:

1. **떠 있는 조각**: 가드 적용 후에도 실행 1에서 14px 짜리 확정 퓨즈 2개가 남았다.
   라벨이 `"1"` 이라 지정문자 경로가 아니고, 본체 상자 안에 들어가 있지도 않아
   `demoteContainedMarkings` 도 못 잡는다(어긋난 위치). 별도 원인이다.
2. **안 합쳐진 중복**: 실행 3의 퓨즈 18개는 반토막이 0개다 — 조각이 아니라 같은
   퓨즈를 조금 다른 위치로 두 번 읽고 병합 허용오차를 넘긴 정상 크기 노드들이다.

재실행:

```bash
node --env-file=.env.local scripts/run-drawing-model-matrix.mjs --tiers=intermediate --models=gemini --repeat=3
```

## 17차 실도면 과다 계수 — 원인 확인 · 판별식 실패(음성 결과) (2026-08-05)

교보재를 실발주 도면으로 바꿨다. `fixtures/drawings/realworld/incoming/kimm-20210602-design.pdf`
p5(KIMM 수변전설비 단선결선도 EE-003, 진흥이엔지 2021.04)를 래스터로 뽑아 썼다.
래스터는 gitignore(재배포 금지)라 아래로 재생성한다:

```bash
node scripts/fixtures/rasterize-golden-scan.mjs fixtures/drawings/realworld/incoming/kimm-20210602-design.pdf 5 fixtures/drawings/realworld/raster 2
```

### 병목이 도면에 따라 **반대**다

| 교보재 | 라벨 | 폭 | 증상 |
|---|---|---|---|
| 중급(공개 결선도, 퓨즈 15) | 98~100% | 2p | 판독 15/15/18 — 거의 맞음 |
| 고급(KIMM 실도면) | 84~97% | 13p | 변압기 3→**3/9/7**, 차단기 9→**8/20/15** |

단순 도면은 **적게 세는(판정 손실)** 문제였고, 실도면은 **많이 세는(병합 실패)**
문제다. 그리고 실도면에서는 **호출이 많을수록 나빴다** — 68회 97%, 89회 84%, 70회 87%.

**이것이 15차 A/B 결론의 반례다.** "싼 눈길 여러 번이 이긴다"는 도면 1장짜리
결론이었고, 실도면에서는 눈길을 늘릴수록 중복이 늘어 점수가 떨어진다. 그 A/B를
근거로 재스캔을 더 걸자는 계획은 **철회**한다.

### 확인된 원인

실행 2의 변압기 8개를 그래프에서 직접 확인:

```
MOLD TR-1  67x64 @481,502     진짜
MOLD TR-2  67x64 @996,502     진짜
MOLD TR-3  67x64 @1439,502    진짜
MOLD TR-3  62x44 @1491,502    같은 것을 52px 밀려 재판독
MOLD TR-2  23x37 @969,504     같은 것을 27px 밀려 재판독
DOWN TR    48x34 @1870,818    ┐ 하나를 둘로 쪼갬
DOWN TR    25x28 @1842,819    ┘
```

같은라벨 근접쌍 14건 중 **12건이 "겹치지 않고 인접"** 이라 종전 병합 조건(겹침
또는 중심 24px)을 전부 빠져나간다. 조밀한 도면에서 50px 오차는 겹침 0이 된다 —
기기 간격이 넓은 단순 도면에서는 같은 오차가 여전히 겹쳐서 드러나지 않았다.

### 시도한 판별식과 그 실패

근접쌍 24건을 면적비·겹침으로 갈랐다:

| | 면적비 | 겹침 |
|---|---|---|
| 진짜 반복으로 본 것(FU3~FU6 · MCCB 피더 행) 11쌍 | 1.00 | 0% |
| 쪼개진 판독으로 본 것 13쌍 | 1.05~5.33 | 0~23% |

깨끗해 보여서 "명판 접두 일치 + 근접 + (면적비 ≥1.5 또는 겹침>0)" 병합을 넣었다.
**라이브가 기각했다**:

| 교보재 | 이전 | 적용 후 |
|---|---|---|
| 고급 | 84~97% · 폭 13p | 83~94% · 폭 11p |
| 고급 변압기(정답 3) | 3/9/7 | 11/4/6 |
| 중급 | 98~100% · 폭 2p | 84~99% · 폭 15p |
| 중급 퓨즈(정답 15) | 15/15/18 | **14/13/14** |

고급에서 얻은 게 없고 중급에서 매번 퓨즈를 잃는다. 되돌렸다(`48050f2`).

**실패 원인은 보정 근거 자체다.** 24건을 두 부류로 가른 것은 정답이 아니라 **내
추론**이었다. 면적비 ≥1.5 를 "쪼개진 판독"의 신호로 읽었지만, 크기가 다르게 읽힌
**서로 다른 두 기기**도 그 구간에 들어간다(중급 FU2 39x88 vs 22x80, 면적비 1.96).
라벨과 크기만으로는 가를 수 없다.

**다음 사람에게**: 과다 계수와 그 원인(겹치지 않는 중복 판독)은 실재한다. 다시
풀려면 라벨·크기 말고 **정답 라벨이 붙은 근접쌍 데이터**부터 만들 것. 추론으로
가른 부류에 규칙을 맞추면 이 실패가 반복된다.

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
