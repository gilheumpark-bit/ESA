# 고밀도 도면·KEC 212.7.2 후속 수리 — 2026-08-03

## 기준과 결론

제품 코드 기준선은 `2bf0ca6f8242c39bb3f036d529b5007a70b19ee8`이다. 고밀도 도면에서 모델이 읽은 기호·선 조각을 버리지 않고 전체 그래프로 재조립하는 경로와 KEC 212.7.2의 정확한 판정 계약을 구현했다. 공개 MCC 실호출은 파이프라인 FAIL을 제거했지만 OCR·경계 연속성·근거 추적률 때문에 최종 상태는 정직하게 HOLD다. 80%·95% 일반화 정확도는 주장하지 않는다.

## 구현

- 페이지 배율과 선·기호 밀도에 따라 2×2·3×3·4×4 정밀 구획을 선택한다.
- 기호 심사가 하나 이상 살아 있는 래스터 페이지에서만 직선 검출을 보조 근거로 추가한다. 문자·기기 내부 선, 고립된 짧은 선과 모든 역할이 실패한 페이지의 선은 제외한다.
- 구획 경계의 일반 선 조각을 인접 선망과 최소 연결 트리로 조립하고, 추론 관계는 `ambiguous`로 유지한다.
- 변압기 권선·하우징, 이동된 중복 기호, 반복 부하와 버스선을 물리 장치·전기 선 종류 기준으로 중복 제거한다. `PTx3`·`PPT`·`VT` 표시는 전력용 변압기가 아니라 계기용 `vt_pt`로 보정한다.
- high 문서 기한은 570초이며 Agent Platform은 동시 8호출을 사용한다. 기한 도달 시 완료된 독립 심사 봉투는 보존하고, 심사 전 중단은 계속 fail-closed다.
- KEC 212.7.2는 별도 과부하 보호장치 ID, 단락 보호장치 ID, 단락장치 통과에너지(A²s), 과부하장치 무손상 내량(A²s), 원본 source ID를 모두 요구한다. 값은 곡선이나 배치에서 추정하지 않는다.

## 공개 도면 실측

| 교보재 | 실행 | 관측 | 현재 판정 |
|---|---|---|---|
| 고밀도 MCC `sejong-p2` | Agent Platform high, 202.5초, 실제 55호출 | 136기호·223선·212문자·176관계, 계획 구획 17개 중 16개 완료 | 같은 봉투의 현재 결정론 재생에서 PASS 2·HOLD 7·FAIL 0. OCR 후보 212, 경계 연속성 20, 불확실 관계 152, 근거 추적률 17.3%, coverage 충돌 때문에 전체 HOLD |
| 북미 반복 분기 `public-american` | 앞선 Agent Platform high 봉투를 graph v7로 재조립 | 변압기 10/10·버스 4/4·부하 21/21, 관계 37 | 관계 2건 confirmed·35건 ambiguous. 독립 edge 정답이 없으므로 정확도 수치로 승격하지 않음 |

실호출 영수증은 `test-results/drawing-reasoning-stages-sejong-p2.json`, `test-results/drawing-reasoning-stages-public-american.json`에 남고 Git에는 포함하지 않는다. 각 영수증의 호출 snapshot과 현재 결정론 재평가를 하나의 모델 순위표로 합산하지 않는다.

## KEC 원문 경계

2025 한국전기설비규정 212.7.2는 개별 장치를 이용해 과부하와 단락을 보호할 때 단락 보호장치의 통과에너지가 과부하 보호장치가 손상 없이 견디는 값을 넘지 않도록 두 장치의 특성을 협조하도록 요구한다. 이는 일반적인 상·하위 차단기 시간-전류 선택협조와 동일한 규칙이 아니다.

- [국가법령정보센터 KEC 원문 PDF](https://www.law.go.kr/flDownload.do?flSeq=158125635)
- [대한전기협회 KEC eBook](https://kec.kea.kr/sub_tech/regulation_book.php?cate=2024-2-2&mode=ebook)

## 검증 영수증

- `npx tsc --noEmit --incremental false`: exit 0
- `npm run lint -- --max-warnings=0`: exit 0
- `npm test -- --runInBand`: 332 suites·4,017 tests 통과, 1 suite·1 test skip
- `npm run build`: exit 0, 66개 페이지 생성
- `npm run gate:pdf`: 17/17 통과
- `npm run gate:sld-v3-contract`: 6/6 통과
- `npm run test:sld-benchmark`: 1/1 통과
- `npm run gate:sld-golden`: 의도된 exit 1, 독립 라벨·예측·서명 부재로 `verified95=false`

## 남은 일

1. 기호·문자·관계 정답을 전기 실무자 2인 블라인드 판정으로 고정한다.
2. 같은 코드 snapshot·도면·모델·high 조건을 3회 반복해 분산을 측정한다.
3. MCC의 OCR 후보, 구획 경계, 불확실 관계와 근거 추적률을 라벨별로 개선한다.
4. 일반 시간-전류 선택협조가 필요하면 212.7.2와 분리해 입력 계약과 판정기를 설계한다.
