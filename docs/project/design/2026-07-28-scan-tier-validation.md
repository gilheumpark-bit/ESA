# 스캔 티어 실증 — 벡터로 검증된 페이지를 스캔으로 넣으면 어떻게 되나

2026-07-28 · `scripts/run-scan-tier.mjs` · provider=gemini(기본 모델) ·
대상 `POST /api/sld`(화면의 "빠른 분석" 경로) · 영수증 `test-results/scan-tier-results.json`

3차 실증(2026-07-21)은 **벡터 경로만** 봤다. 같은 도면을 스캔 모달리티로
바꿔 넣으면 정답 라벨은 그대로이므로 래스터의 저하만 분리해 측정된다.
교보재는 KIMM 연구2동 도면 3장을 raster / scan-light / scan-heavy 세 티어로
만든 것이다(`fixtures/drawings/realworld/raster/`, gitignore·재배포 금지).

## 측정값

요청 9 · 실패 1(scan-light p40 이 공급자 503) · 발전기 환각 0.

| 페이지 | 정답 라벨 | 벡터 경로 | raster | scan-light | scan-heavy |
|---|---|---|---|---|---|
| p5 수변전 단선결선도 | 차단기 9 · TR 3 | 차단기 10 · TR 3 | 차단기 7 · TR 4 | 차단기 8 · **TR 3** | 차단기 7 · TR 4 |
| p14 분전반결선도2 | 차단기 6(MAIN) | 차단기 35 | 차단기 6 · 연결 11 | 차단기 14 · **연결 0** | 차단기 24 · **연결 0** |
| p40 분전반결선도13 | 차단기 42 | 차단기 41 | 차단기 12 · **연결 0** | (503) | 차단기 6 · **연결 0** |

## 읽어야 할 것

**단선결선도는 스캔에서도 버틴다.** p5 scan-light 는 변압기 용량 3개를
모두 맞혔다(500 / 1000 / 1000kVA, conf 0.95). 차단기도 8 vs 정답 9.

**분전반 결선도는 무너진다.** p40 은 정답 42 개 차단기가 raster 12 ·
scan-heavy 6 으로 줄었다. 표 형태의 분기 회로가 스캔에서 안 읽힌다.
**연결(conns)은 p14·p40 스캔 티어에서 전부 0** 이다 — 선을 하나도 못 잇는다.

**용량 오독이 스캔에서 발생하고, 재현되지 않는다.** p5 scan-heavy 는
같은 이미지·같은 모델로 두 번 돌렸는데 TR-1 을 각각 **300kVA · 1000kVA**
로 읽었다. **실제는 500kVA** 다(scan-light 와 벡터 경로가 맞힌 값). 40%
과소와 100% 과대를 오간 것이고, 두 번 다 틀렸다.

## 왜 걸러지지 않나

1. **문서 confidence 가 신호가 되지 못한다.** 1000kVA 로 잘못 읽은 실행의
   문서 confidence 는 **0.9** 였다. 300kVA 로 읽은 실행은 0.5.
   즉 낮은 confidence 가 오독을 가리키지도, 높은 confidence 가 정답을
   보장하지도 않았다.
2. **부품 단위 confidence 가 아예 없다.** p5 scan-heavy 응답의 18 개 부품
   중 `confidence` 필드를 가진 것은 **0 개**다. `team-result-adapter.ts:338`
   의 `component.confidence >= 0.85` 강등은 이 경로에서 판단 재료가 없다.
3. **`/api/sld` 에 입력 품질 가드가 없다.** 248 줄 안에 quality·blur·
   contrast·resolution 처리가 하나도 없다. 그런데 이 응답은 화면에서
   `setCalcChain`·`setReview` 로 들어간다
   (`app/(with-nav)/tools/sld/page.tsx:724`) — **오독한 용량이 계산과 검토에
   그대로 흐른다.**
4. **기존 품질 판정기를 붙여도 이건 못 잡는다.** `profileImage` 를 9 티어에
   직접 돌려 봤다:

   | | raster | scan-light | scan-heavy |
   |---|---|---|---|
   | p5 gradientVariance | 1182.1 | 1021.2 | 741.7 |
   | p14 gradientVariance | 1010.1 | 891.7 | 669.2 |
   | p40 gradientVariance | 1002.2 | 892.9 | 671.9 |
   | 판정(9 티어 전부) | `lowContrast=false` · `blurry=false` · `recommendedScale=1` · 경고 없음 |

   저하 자체는 `gradientVariance` 에 **단조롭게** 찍힌다(세 페이지 모두
   raster > light > heavy). 그런데 `blurry`·`lowContrast` 임계가 이 구간을
   전혀 나누지 못한다 — 판정기는 합성 블러 테스트에 맞춰져 있고 실제 스캔
   저하의 결이 다르다. **배선만 해서는 발화하지 않는다.**

## 남는 판단 — 개발자 몫

임계를 옮기는 것은 n=9 로 할 일이 아니다. 낮추면 멀쩡한 도면이 홀드되고,
그 오탐 비용은 이 실증으로 알 수 없다. 필요한 것:

- **교보재 확대** — 실제 사용자 업로드 분포에 가까운 스캔 표본. 지금 셋은
  같은 원본 PDF 를 합성 열화한 것이라 스캐너·복사기·사진 촬영의 실제 결을
  대표하지 못한다.
- **가드의 성격 결정** — 차단(분석 거부)인가, 경고(결과에 "이 이미지는
  정격 판독이 불안정할 수 있습니다" 표시)인가, 아니면 정격만 홀드하고
  구조는 내보내는가. 리포의 기존 관례는 낙관 PASS 대신 UNKNOWN 이다
  (`gate:pdf` R15). 정격에도 같은 태도가 맞다면 세 번째다.
- **부품 단위 confidence** — `/api/sld` 응답이 부품별 확신도를 싣지 않으면
  어떤 가드도 "이 용량만 못 믿겠다" 를 말할 수 없다. 이게 선행 조건이다.

## 재현

```
node .next/standalone/server.js            # PORT=3010
node --env-file=<키 파일> scripts/run-scan-tier.mjs
```

키는 환경변수로만 받고 스크립트가 저장·출력하지 않는다. 공급자 503 이
섞이면 그 칸은 미측정으로 남는다(통과로 세지 않는다).
