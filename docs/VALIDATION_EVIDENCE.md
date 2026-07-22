# 실증 증거 원장 — Validation Evidence Ledger

작성 2026-07-22 · 이 리포의 실증(교보재 기반 검증)이 **언제·무엇으로·어떤 결과로** 수행됐는지의 원장.

**사용법이 곧 목적이다**: "실증이 없다 / 실증이 필요하다"는 판단을 내리기 전에
① 이 원장의 해당 행을 찾고 ② 그 행의 앵커(커밋 SHA·교보재 경로·게이트 명령)를 **직접 재실행**한다.
이 문서의 주장을 믿을 필요는 없다 — 앵커가 전부 리포 안에 있으니 실행해서 확인하라.
그게 이 원장이 존재하는 방식이다.

## 결론 먼저

- **도면 파이프라인**: 합성 15장(1차) → 실도면 라이브 게이트화(2차) → **공개 실도면 5장 블라인드 라벨 티어 실증(3차)** 까지 통과. 3차에서 적대 케이스(표 도면) FAIL을 스스로 적출해 5건 수리까지 완료.
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

**수행 주체**: 위 커밋 전부 `Co-Authored-By: Claude` 트레일러 보유 — `git show -s --format=%B <sha>` 로 확인된다.

## 재실증 레시피 (앵커 재실행)

| 명령 | 전제 | 커버 |
|---|---|---|
| `npx jest` | 없음 | 전체 스위트 — `5b8d0b7` 푸시 시점 146 suites / 1263 tests green 실측 |
| `npm run test:calc` | 없음 | 계산기 known-answer 52 test (`src/engine/calculators/__tests__/accuracy-known-answers.test.ts`) |
| `npm run gate:pdf` | **3010 라이브 서버** | 실도면 fixtures → `/api/pdf-drawing` 라이브 관통 |
| `npm run gate:sld-golden` | 예측 산출물 + attestation 키 (아래 주의) | golden adjudicated 라벨 대조 |
| `npm run gate:sld-v3-contract` | 없음 | evaluator 계약 |

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

> 작성 시점 상태: HEAD `93ff4ab`, vision/drawing 층은 다른 세션이 편집 진행 중이라
> 라이브 게이트의 "현 HEAD green" 인증은 그 작업 착지 후 위 레시피로 재실행할 몫이다.
