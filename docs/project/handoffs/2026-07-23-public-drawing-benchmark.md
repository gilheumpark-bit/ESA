# 공개 도면 추가 벤치마크 — 단선도·복합 시트·전기 평면도·저해상도 스캔

측정일: 2026-07-23

대상 리비전: 로컬 dirty snapshot(기존 다중 AI 작업 포함, 이 문서는 코드 변경 없음)

목적: 합성 픽스처와 기존 KIMM 83페이지 계열 밖의 공개 자료로 PDF 파서 및 V3 보고 경로의 일반성을 반증한다.

## 결론

**안전한 실패 표시는 통과, 공개 도면 판독 성능은 미달이다.**

- 6개 대표 입력 모두 V3가 `PARTIAL`, 페이지 `failed`, 구획 `0/1`, `verified95=false`로 표시했다. 읽지 못한 도면을 완료로 포장하지 않은 것은 맞다.
- 반면 확정 관계는 6개 입력 합계 **0건**이다. 깨끗한 벡터 단선도에서도 실제 장치보다 합성 접점과 표·도면틀 선을 주로 구조화했다.
- 저해상도 스캔 2종은 문자층 일부만 읽고 선분 0·관계 0으로 멈췄다. 벡터 파서가 스캔을 억지 해석하지 않은 것은 맞지만, Vision 전처리·판독 없이는 사용자가 원하는 전체 읽기가 되지 않는다.
- ERIC 스캔을 재실행하자 PDF.js 서버 렌더러가 JBIG2 이미지를 해독하지 못했다. `wasmUrl`·`standardFontDataUrl` 미설정과 `nulljbig2_nowasm_fallback.js` 모듈 부재가 함께 발생해 Vision 이전의 페이지 렌더 단계도 불완전하다.
- 이 실행 환경에는 서버 Gemini 키가 없었고, 기존 Chrome BYOK를 이용한 신규 파일 업로드는 Chrome 확장 프로그램의 파일 URL 접근 권한에서 차단됐다. 따라서 아래 결과는 **PDF 구조 파서 + V3 집계 경로 실측**이며, 신규 6종의 Gemini 판독 정확도 실증은 아니다.

## 공개 자료와 선택 이유

원본 바이너리는 `tmp/pdfs/public-validation/`에만 내려받았고 Git에는 넣지 않는다. 공개 열람 가능과 재배포 허가는 같지 않으므로 출처·해시·대표 페이지만 기록한다.

| ID | 출처 | 대표 입력 | 검증 축 | 원본 SHA-256 |
|---|---|---|---|---|
| UM-MCC | [University of Michigan — MCC One Line Diagram](https://umaec.umich.edu/26290001-mcc-one-line-diagram-2/) | 1페이지 전체 | 가장 단순하고 깨끗한 대칭형 벡터 SLD | `e869e9b9ee25beb52db9af6246512daab314731931c32a6fe268182a775b4139` |
| UM-SUB | [University of Michigan — Single Ended Substation](https://umaec.umich.edu/26110001-single-ended-substation-2/) | 1페이지 전체 | 피더·계기·변압기·차단기·스위치·주석이 함께 있는 고밀도 벡터 SLD | `e72781242594da00504e93bf8beb816d15c67527f03d5a757dec6308eba73a3c` |
| SLO-E2 | [City of San Luis Obispo — 공개 설계도 PFM00724](https://publicplans.slocity.org/WebLink/0/edoc/40973/PFM00724.pdf) | PDF 17페이지, E2 | SLD·패널 스케줄·조명기구표가 한 시트에 섞인 구획 분리 과제 | `00afb21b30f7443e3a2545d5d4e17aa1b632b3a0b31796fbc1075c62a3cce7ff` |
| SLO-E4 | 같은 공개 설계도 | PDF 20페이지, E4 | 콘센트·조명·배선·주석·전체 위치도가 섞인 전기 평면도 | 위와 같음 |
| ERIC-40 | [ERIC ED269643 — Electrical Power Station Theory](https://files.eric.ed.gov/fulltext/ED269643.pdf) | PDF 40페이지 | 기울고 흐린 구형 스캔 단선도 | `08655213a730c305aa8f8eb3fa241e3e1b211f7b0affe77571a3b73cb8f64a02` |
| ERIC-41 | 같은 교육자료 | PDF 41페이지 | 계기·CT/PT·보호·발전기·변압기가 밀집한 구형 스캔 회로 | 위와 같음 |

참고: 기존 `fixtures/drawings/external/`의 Wikimedia SLD는 이미 별도 검증에 사용됐으므로 이번 신규 6종에는 중복 포함하지 않았다.

## 실행 방법

1. 원본 PDF를 내려받고 SHA-256을 고정했다.
2. 대표 페이지를 PNG로 렌더링해 사람이 먼저 문서 유형과 눈에 보이는 핵심 기호를 확인했다.
3. 실제 개발 서버 `POST /api/pdf-drawing`에 업로드해 단일 페이지 벡터 파서 결과를 수집했다.
4. 같은 파일을 `POST /api/drawing-jobs`에 `pages=1`, `maxVlmCalls=0`으로 넣어 V3 집계·상태·관계·검증 게이트를 확인했다.
5. 신규 파일의 Gemini 경로는 별도 BYOK 경계 때문에 실행하지 못했으므로 파서 결과와 합산하지 않았다.

## 실측표

| 입력 | 유형 판정 | 기호 | 합성 접점 | 선 | 관계 | 확정 관계 | 문자 | 구획 | V3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| UM-MCC | SLD | 24 | 23 | 20 | 20 | **0** | 3 | 0/1 | PARTIAL |
| UM-SUB | SLD | 55 | 45 | 55 | 55 | **0** | 165 | 0/1 | PARTIAL |
| SLO-E2 | SLD | 46 | 40 | 35 | 35 | **0** | 257 | 0/1 | PARTIAL |
| SLO-E4 | layout | 47 | 45 | 48 | 48 | **0** | 337 | 0/1 | PARTIAL |
| ERIC-40 | SLD | 1 | 0 | 0 | 0 | **0** | 64 | 0/1 | PARTIAL |
| ERIC-41 | SLD | 1 | 0 | 0 | 0 | **0** | 38 | 0/1 | PARTIAL |

모든 관계의 certainty는 `ambiguous`였다. 전 입력의 공통 미해결 코드는 `ROLE_CALL_FAILED`였고, V3 `verified95`는 전부 false였다.

## 사람 대조로 확인한 오류

### 1. UM-MCC — 가장 단순한 도면에서도 장치 검출 실패

사람 눈에는 동일한 두 피더에 스위치·보호/개폐 장치·변압기 계열 기호·모터가 반복된다. 파서는 제목을 `panel` 1개로, 선 교차점을 `bus` 23개로 만들었고 실제 장치 유형은 0개 검출했다. 20개 관계도 전부 모호 판정이다.

### 2. UM-SUB — 주석을 장치로 승격하고 합성 bus가 수량을 잠식

파서는 breaker 1, switch 2, transformer 1, meter 2를 찾았지만 전체 55개 중 49개를 bus로 집계했다. 그중 45개가 합성 junction이며, `CONCEAL CIRCUIT BREAKER...`, `PROVIDE CONTROL POWER TRANSFORMER...`, `METER REQUIREMENTS` 같은 주석 문장을 실제 장치 라벨로 승격했다. 수량과 고아 장치 제안은 이 오염 위에서 생성되므로 현장 판단 근거로 사용할 수 없다.

### 3. SLO-E2 — 시트 구획 분리가 없어 표 격자가 회로가 됨

실제 SLD는 시트 중앙의 작은 구획이고 왼쪽·아래에는 패널/조명기구 스케줄이 있다. 파서는 breaker 2, meter 1, panel 3보다 합성 junction 40개와 관계 35개를 더 크게 만들었다. `도면 전체 스캔 → SLD/표/주석 구획 분리 → 구획별 전용 판독`이 선행되지 않으면 복합 시트의 수량과 관계를 신뢰할 수 없다.

### 4. SLO-E4 — 문서 유형은 맞췄지만 평면도 어휘가 없음

`layout` 분류는 맞았다. 그러나 실제 핵심인 조명기구, 콘센트/GFCI, 스위치, 분기회로, 패널 참조는 집계되지 않고 panel 2 + 합성 bus 45로 축약됐다. 현재 그래프 어휘가 SLD 중심이라 전기 평면도를 같은 파서로 처리할 수 없다.

### 5. ERIC 스캔 — 정직하게 멈췄지만 전체 읽기 불가

두 스캔은 선분 0, 관계 0이었다. 각각 bus 1 또는 generator 1만 남았다. confidence 0.3과 `기하(선분) 0: 스캔/이미지 도면 추정, 결선 해석 불가` 경고는 정직하지만, 자동 렌더·업스케일·기울기 보정·구획별 Vision 판독으로 연결되지 않아 사용자는 결과를 얻지 못한다.

같은 ERIC-40 입력을 별도로 재실행해 stderr 증분을 측정하니 한 번의 요청에서 경고 12줄이 새로 발생했다. 핵심은 다음 세 가지다.

- `Jbig2Error: JBig2 failed to initialize`
- `Ensure that the wasmUrl API parameter is provided`
- `Cannot find package 'nulljbig2_nowasm_fallback.js'`

비교 실행에서 UM-MCC는 `standardFontDataUrl` 경고 2줄, SLO-E4는 새 경고 0줄이었다. 즉 입력별 편차가 있으며 특히 JBIG2 스캔은 페이지 영상 일부가 준비되지 않은 상태다. 이 상태에서는 Gemini 키를 연결해도 온전한 원본을 보냈다고 보장할 수 없다.

## 지표 해석 주의

V3 `evidenceTraceRate`는 UM-MCC 0.540, UM-SUB 0.759, SLO-E2 0.699, SLO-E4 0.623, ERIC 두 장 1.000이었다. 스캔이 사실상 판독되지 않았는데도 1.000이므로 이것은 **정확도나 완독률이 아니라 남은 주장 내부의 근거 연결률**이다. UI와 문서에서 정확도처럼 읽히지 않게 분리해야 한다.

## 수리 우선순위

1. **P0 — PDF 렌더 자산 배선**: `pdfjs-dist`의 `wasmUrl`·`standardFontDataUrl`·JBIG2 fallback을 서버 런타임과 배포 산출물에 연결하고 ERIC-40으로 이미지 픽셀 실재를 회귀 검증한다.
2. **P0 — 시트 구획 분리**: 도면틀·표·스케줄·주석·SLD·평면도를 먼저 나누고, 표 선과 건축 벽선을 전기 결선 후보에서 제외한다.
3. **P0 — 합성 접점 격리**: synthetic junction을 물리 설비 수량에서 빼고, 실제 장치 양 끝에 붙은 경우에만 관계 보조 노드로 사용한다.
4. **P0 — 신규 공개자료 Vision 회귀 하네스**: 브라우저 저장 키에 의존하지 않는 일회성 테스트 키 주입 경로로 동일 6종을 반복 측정하고, 키와 원본은 결과물에 저장하지 않는다.
5. **P1 — 평면도 전용 역할**: 조명·콘센트·스위치·홈런·분기회로·패널 참조·층/실 구획을 SLD 장치 어휘와 분리한다.
6. **P1 — 스캔 전처리 자동 라우팅**: 선분 0 또는 저품질 감지 시 PDF 페이지 렌더 → 업스케일 → deskew/대비 변형 → 전체/구획 Vision으로 자동 전환한다.
7. **P1 — 주석 문장성 게이트**: 장치 키워드가 들어간 설명문을 실제 장치로 승격하지 않는다.
8. **P1 — 평가 지표 명칭 분리**: `evidenceTraceRate`와 기호/문자/관계 recall·precision·완독률을 별도 표시한다.

## 판정

- PDF 입력·형식 검증·V3 보고 배선: **PASS**
- 실패 정직성(`PARTIAL`, HOLD, 미확정 노출): **PASS**
- 깨끗한 벡터 SLD의 기기·관계 완독: **FAIL**
- 복합 시트 구획 분리: **FAIL**
- 전기 평면도 기호·회로 판독: **FAIL**
- 저해상도 스캔 자동 복구: **FAIL**
- JBIG2/표준 글꼴 포함 PDF 서버 렌더: **FAIL**
- 신규 6종 Gemini 경로: **NOT RUN — Chrome 파일 업로드 권한 경계**

이 벤치마크는 공개 자료 수용성 검증이며 현장 정답률 실증으로 확대 해석하지 않는다. 다만 입력 자체가 사용자가 말한 교보재·공개 설계도 수준이므로, 위 FAIL은 현장 타령으로 미룰 항목이 아니라 현재 제품 단계에서 바로 닫아야 할 결함이다.
