# 도면 검토 사다리 설계 — 초급(단일)·중급(묶음)·고급(프로젝트)

> 발주 방향(2026-07-21 확정): 도면 검토 = **하이브리드**(계산 + 기준 + 분석 + 결론).
> 데이터는 도면에 **적혀 있다** — 자로 재지 않는다. 적힌 값으로 계산하고, KEC·사내규정에 대조하고,
> 부합/부적합을 내되 **지시(최종 판정)는 사람**. 입력은 탄력적(1장~프로젝트 전 세트) —
> 1장만 보면 "단선도 분석"이지 딥 이해가 아니다. 깊이 = 몇 장을 엮었나.

## 0. 사다리 정의 (분석 깊이 축 — 도면 난이도 축이 아님)

| 단계 | 입력 | 분석 | 상태 |
|---|---|---|---|
| **초급** | 도면 1장 (단선도·분전반도) | 페이지 안 하이브리드: 추출값 → 계산 → 기준 대조 → 회로별 부합 판정 | **본 설계로 구현** |
| **중급** | 관련 묶음 (분전반+단선+평면·표) | 식별자 상관(같은 판넬을 페이지 간 결속) + 교차 정합("표의 케이블이 단선도 계통과 맞나") | 설계만 (§4) |
| **고급** | 프로젝트 전 세트 (전기+건축) | 건물 모델 위 딥 검토("이 케이블이 제대로된 자리에 갔나") + 위치 결박 제안 | 설계만 (§5) |

각 단계는 아래 단계를 포함한다. 입력이 1장이면 초급으로 우아하게 축소 — 없는 도면을 요구하지 않는다.

## 1. 원칙 (도메인 진실 — CLAUDE §2.10 규칙팩)

1. **무발명**: 도면에 없는 값(길이·공사방법·주위온도)은 지어내지 않는다. 없으면 `UNKNOWN` + "미기재" 플래그. 가정이 불가피하면(공사방법 등) 가정을 verdict 안에 명시한다.
2. **적힌 값이 입력**: 계산 입력 = 추출된 정격·케이블·전압. 좌표 유래 값 금지(기수리).
3. **기준 출처 결박**: 모든 판정에 근거(KEC 표 키·규칙 ID)를 붙인다. 출처 없는 판정 금지.
4. **조수, 심판 아님**: 출력은 부합/부적합/판정불가 + 근거. 재설계 지시·법적 판단은 하지 않는다.
5. **판정 우선순위**: false-PASS(부적합을 적합으로)가 최악. 애매하면 UNKNOWN.

## 2. 초급 — 단일 도면 하이브리드 사슬 (본 구현)

### 2.1 모듈: `src/engine/review/circuit-review.ts` (순수 함수·I/O 없음)

```
reviewAnalysis(analysis: SLDAnalysis): ReviewReport
```

```ts
interface ReviewFinding {
  rule: 'AT-LE-AF' | 'CABLE-AMPACITY' | 'TR-MAIN-CURRENT' | 'DATA-GAP';
  severity: 'FAIL' | 'WARN' | 'PASS' | 'UNKNOWN';
  subject: string;                       // 대상 라벨 (예: "ELB 2P-30/20 [전열]")
  componentId?: string;
  given: Record<string, string>;         // 도면에 적힌 값 그대로
  computed?: Record<string, string>;     // 계산값 (있을 때만)
  limit?: { value: string; source: string }; // 기준값 + 출처(KEC 표 키)
  verdict: string;                       // 사람 읽는 결론 (가정 명시 포함)
}
interface ReviewReport {
  findings: ReviewFinding[];
  summary: { pass: number; warn: number; fail: number; unknown: number };
  coverage: { breakersTotal: number; breakersWithCable: number; breakersRatedParsed: number };
  disclaimer: string;                    // "검토 보조 — 최종 판정은 유자격자"
}
```

### 2.2 규칙 (round 1 — 결정론·전 규칙 known-answer 테스트)

| 규칙 | 판정 | 데이터 요건 | 기준 출처 |
|---|---|---|---|
| **AT-LE-AF** | 트립(AT) ≤ 프레임(AF). 위반=FAIL | rating "xAF/yAT" 파싱분 전부 | 차단기 구조 정의(트립은 프레임을 넘을 수 없음) |
| **CABLE-AMPACITY** | 차단기 AT ≤ 케이블 허용전류. 위반=FAIL·80% 초과 근접=WARN | 차단기에 결속된 연결의 conductorSize+cableType | `kec-ampacity.getAmpacity` (Cu·절연 매핑·공사방법 가정 명시) |
| **TR-MAIN-CURRENT** | TR 정격 2차전류 계산(severity=INFO — 부합 계수 아님) | TR power+2차전압+**상수(1φ/3φ)**가 전부 무모호할 때만, 아니면 UNKNOWN. 수치 0인 bare 심볼은 DATA-GAP에 압축 | 3φ: I₂=kVA×1000/(√3×V₂) · 1φ: I₂=kVA×1000/V₂ |
| **DATA-GAP** | 판정 불가 회로의 정직 집계 | 케이블 미결속·정격 미파싱 수 | 무발명 원칙 |

절연 매핑(도면 관례): `CV·FCV·FR-CV·TFR-CV → XLPE` / `HIV·IV·VV → PVC`. 공사방법 미기재 시 `conduit`(관로) 가정 — verdict에 가정 명시(도면에 공사방법이 적히는 경우가 드물고, 관로가 국내 옥내 기본 관례).

### 2.3 배선

- `/api/pdf-drawing`·`/api/dxf` 응답에 `review: ReviewReport` 추가 (generateCalcChainFromSLD 뒤).
- confidence 0.55 이하(표 문서·스캔)는 review를 생략하고 사유만 — 신뢰 못 하는 추출로 판정하지 않는다.

### 2.4 검증

- 단위: KIMM 실측값 known-answer (ELB 2P-30/20 → PASS · 합성 50AF/100AT → FAIL · 4sq+40AT → KEC 대조 FAIL 등).
- 라이브: KIMM p14·p40 재관통 → 실제 findings 출력 확인.
- gate:pdf R13: 회로형 픽스처에 review 존재 + AT>AF 픽스처 FAIL 검출.

## 3. 왜 계산기 57종을 직접 안 물리나 (round 1)

기존 calculator 모듈은 UI 폼 입력 계약(다필드 필수)이라 추출값의 부분성과 안 맞는다. round 1은
kec-ampacity 표 조회 + 결정론 산식(I₂)만 직결하고, calculator 재사용은 입력 어댑터 설계 후
round 2에서 확장한다(voltage-drop은 도면에 길이가 적힌 표 추출(중급) 이후 의미 있음).

## 4. 중급 — 식별자 상관 층 (설계)

- **키 정규화**: 판넬명 정규화(`P-380#2B` = `P-380#2B-1`의 모반? 아니오 — 접미 회로), 공백·하이픈 변형 흡수.
- **CrossRef 모델**: `{ panelKey → { sldPages[], schedulePages[], planPages[], claims: {전원방식, MAIN정격, 케이블}[] }}`.
- **교차 정합 규칙**: 같은 판넬의 전원방식/MAIN 정격이 페이지 간 불일치 → FAIL(도서 내부 모순 — 사람이 제일 놓치는 유형). 표의 FROM-TO가 단선도 계통과 다름 → FAIL.
- 입력이 1장이면 이 층은 자동 무활성.

## 5. 고급 — 프로젝트 딥 (설계)

- 평면도에서 **위치 라벨만** 추출(판넬 태그 + 층/실 명칭 — 건축 분석 아님).
- 부합 판정 결과에 위치 결박: "지하1층 실험실 P-2 회로 3 부적합".
- 전기+건축 교차는 위치 정합("EPS실에 있어야 할 판넬이 평면도에 없음")까지 — 법규·구조 판단은 범위 밖.

## 6. 위험·한계 (정직 선언)

- 초급 round 1은 **케이블이 결속된 회로만** CABLE-AMPACITY 판정 — 분전반 결선도는 케이블 표기가 MAIN에 몰려 있어 분기 커버리지가 낮다(실측 후 수치 보고). 분기 케이블은 표(중급)에서 온다 — 초급의 구조적 한계이며 DATA-GAP으로 정직 집계.
- 공사방법·주위온도 가정은 보수성이 낮은 방향으로 오판할 수 있다 — verdict에 가정 명시 + 사내규정 온보딩 시 기본값 교체 가능하게 상수 분리.
- rate limit(sld 10/분)이 전수 배치와 충돌 — 배치 경로는 별도 과제.
