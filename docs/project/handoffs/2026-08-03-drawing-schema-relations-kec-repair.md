# 구조화 출력·관계 그래프·KEC 근거 수리 인수인계 — 2026-08-03

## 결론

도면 역할 호출의 구조화 응답 계약, 긴 선이 중간 차단기를 건너뛰던 공간 그래프, KEC 판정 조건의 출처 결박을 함께 수리했다. 코드 기준선은 `ad95dbc1379e53c6305f29f4aa36a65c84c88051`이다.

같은 공개 초급 단선도 `fixtures/drawings/external/wiki-oneline.png`를 Google Agent Platform `gemini-3.6-flash`, high로 실제 호출한 최종 영수증은 기기 라벨 100%, 평가 대상 기호 100%, 관계 14/13(100%), 116.8초, 실제 provider 호출 19회를 기록했다. 다만 OCR 후보, 구획 경계 연속성, 낮은 근거 추적률이 남아 최종 문서 상태는 `PARTIAL`, 품질 판정은 `HOLD`다. 단일 초급 표본 결과를 전체 도면 일반화 정확도로 사용하지 않는다.

## 수리 범위

1. 역할별 JSON Schema를 Google Agent Platform과 OpenAI 요청에 실제 전달한다.
2. Google이 허용하지 않는 JSON Schema nullable union과 일부 키워드를 provider dialect로 변환한다. OpenAI에는 원본 strict schema를 유지한다.
3. provider 외곽 봉투나 역할 payload가 구조적으로 깨지면 같은 검증 함수 안에서 제한 재시도한다. HTTP 4xx 계약 오류는 재시도하지 않는다.
4. 비연속 페이지 요청에서 논리 충돌 bounds의 폭·높이를 배열 위치가 아니라 실제 `pageIndex`로 찾는다.
5. Vision이 `source→breaker→bus`를 한 직선으로 반환해도 선과 교차하는 중간 기기를 순서대로 찾아 `source→breaker`, `breaker→bus` 관계로 분해한다.
6. 그래프 조립 버전을 `evidence-graph-continuity-v3`로 올려 이전 관계 결과 캐시를 재사용하지 않는다.
7. DXF·PDF·Vision connection에 설치방법, 주위온도, 집합회로 수, 예상 단락전류, 차단용량, 보호곡선과 source ID를 보존한다.
8. 설치방법·온도·집합회로 수·출처 중 하나라도 빠지면 케이블 허용전류는 `UNKNOWN`이다. 완결된 경우에만 KEC 정본 표와 `cable-sizing` 계산기를 호출한다.
9. 출처가 있는 예상 단락전류와 차단용량은 KEC 212.5 규칙으로 직접 비교한다. 212.7 보호협조는 상·하위 곡선과 시간대 데이터가 없어 자동 판정을 만들지 않는다.

## 실호출에서 확인한 원인과 차분

- 최초 provider 실패 원인은 모델 능력이 아니라 Google response schema에 그대로 보낸 `type: ["string", "null"]`이었다. Google은 요청을 400으로 거부했고 text 외 역할이 비었다.
- dialect 변환 뒤 기호 수량은 회복됐지만 관계가 7~8건에 머물렀다. 모델은 차단기 사각형을 관통하는 긴 선을 한 선으로 반환했고 기존 그래프는 양 끝 기기만 연결했다.
- 중간기기 분할 뒤 같은 교보재의 최종 관계는 14건으로 평가 하한 13건을 넘었다. 추론으로 추가된 관계는 `ambiguous`를 유지해 확정 근거로 승격하지 않았다.
- 보수적 HOLD의 주원인은 coverage auditor 충돌, C/U 경계선 미해결, OCR 복수 후보와 근거 추적률이다. 수량·관계 점수 100%와 문서 COMPLETE는 같은 뜻이 아니다.

## 검증

- `npx tsc --noEmit --incremental false`: exit 0
- `npm run lint -- --max-warnings=0`: exit 0
- `npm test -- --runInBand`: exit 0
- `npm run build`: exit 0
- production 서버 `npm run gate:pdf`: exit 0
- `npm run gate:sld-v3-contract`: exit 0
- Agent Platform high 실호출: HTTP 작업 완료, provider/model/effort 일치, 기호·관계 평가 100%, 최종 `PARTIAL/HOLD`

실호출 원본 작업 JSON과 `test-results/drawing-model-matrix-high.json`은 검증 영수증이지만 Git에는 포함하지 않는다. API 키와 계정 토큰도 출력·커밋하지 않았다.

## 남은 순서

1. 북미 반복 분기 배전도와 고밀도 MCC에서 edge recall을 같은 graph v3 snapshot으로 재측정한다.
2. 초·중·고 공개 교보재의 기호·문자·관계를 전기 실무자 2인 블라인드 정답으로 고정한다.
3. Gemini·Terra·Sol을 같은 snapshot·도면·high·3회 반복으로 비교한다.
4. KEC 212.7 보호협조는 상·하위 장치 곡선, 정정값, 동작시간, 전류 구간과 출처 계약을 먼저 설계한다.
5. 실도면 독립 라벨·서명·평가 영수증 전에는 `verified95`와 전체 도면 95%를 계속 HOLD한다.
