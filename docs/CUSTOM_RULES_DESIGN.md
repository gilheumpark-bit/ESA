# 사내 규정(커스텀 룰셋) 로딩 통로 — 설계

작성 2026-07-20 · 대상 리비전 `23f7e0c` 이후

## 왜

판정 엔진(`CodeArticle` + `evaluateCondition`)은 이미 데이터 구동인데, 규칙을
**외부에서 불러오는 통로가 없어서** 하드코딩된 조항(14개 실판정)이 전부였다.
사용자 목표는 "도면을 KEC·사내 규정에 대조해 분석·지적·보완까지" — 사내 규정은
고객이 자기 규칙을 주므로 저작권 벽(IEC/NEC)과 조항 채우기 노동(KEC)을 동시에
우회하는 유일한 경로다.

## 무엇을 (v1 경계)

**들어가는 것**: JSON 룰셋 업로드 → 구조 검증(린트) → 도면 검토 파이프라인(sld-team)
에서 평가 → 리포트에 KEC 행과 나란히 표시. 별도 린트 API. UI 첨부 입력.

**들어가지 않는 것(선언)**: 룰셋 서버 저장(무상태 — 요청마다 동봉, 로그인·멀티테넌트
문제 원천 회피) · layout-team 적용 · 조건 간 산술식(DSL 아님 — 비교 연산만) ·
FAIL 시 적합값 역산(보강은 다음 단계).

## 데이터 모델

```jsonc
{
  "name": "OO엔지니어링 내선 설계기준",   // 필수
  "version": "2026-01",                    // 필수
  "organization": "OO Engineering",        // 선택
  "basedOn": "KEC 2021",                   // 선택 — 어떤 공적 기준의 상회인지
  "standardLabel": "사내규정",             // 리포트 표시 라벨 (기본 '사내규정')
  "articles": [
    {
      "article": "3.2.1",                  // 룰셋 내 유일
      "title": "간선 전압강하 사내 한도",
      "scope": "connection",               // connection | component | global
      "appliesTo": ["transformer"],        // component 한정 타입 필터 (선택)
      "severity": "critical",              // FAIL 시 위반 심각도 (기본 major)
      "remedy": "케이블 굵기 한 단계 상향", // FAIL 시 시정 안내 — 저자 제공만, 엔진 발명 금지
      "conditions": [
        { "param": "voltageDropPercent", "operator": "<=", "value": 2.5,
          "unit": "%", "result": "PASS", "note": "사내 기준 — KEC 3%보다 엄격" }
      ]
    }
  ]
}
```

`conditions`는 기존 KEC `Condition`과 동일 구조 — 엔진을 새로 만들지 않는다.

## 파라미터 사전 (파이프라인이 실제로 가진 값만)

| scope | param | 출처 |
|---|---|---|
| connection | `lengthM` | 도면 결선 길이 |
| connection | `conductorSizeSq` | 케이블 표기 "35sq" 파싱 |
| connection | `currentA` | 케이블 표기 내 전류 — 실표기만, 추정 금지 |
| connection | `voltageDropPercent` | **실전류 기반 계산이 있을 때만** (추정치는 미제공) |
| component | `ratingKva` `ratingKw` `ratingA` `ratingV` `ratingHp` | 도면 정격 문자열 파싱 (MVA→kVA·MW→kW 환산만) |
| global | `componentCount` `connectionCount` `transformerCount` `breakerCount` `motorCount` `panelCount` `totalLengthM` | 추출 집계 |
| global | (사용자 제공 숫자) | 요청 `params` — 도면에 없는 값의 유일한 합법 통로 |

사전에 없는 param을 조건이 참조하면: **린트 경고 + 평가 시 HOLD**(누락 param 명시).
이 HOLD가 곧 "무엇을 채워야 판정이 가능한지"의 보완 안내다.

## 평가 시맨틱 (registry 범용 경로와 동일 — 새 규칙 없음)

1. 자리표시자 임계(0 + 부등호) → HOLD, note에 원문 (`evaluator-guard` 재사용)
2. 값이 **있는** 조건 중 위반 존재 → FAIL
3. 전 조건 값 존재 + 전부 충족 → PASS
4. 그 외(일부 param 미제공) → HOLD + 누락 param 목록

인스턴스 단위: connection scope는 결선마다, component scope는 (appliesTo 필터 후)
컴포넌트마다, global은 1회. FAIL → ViolationEntry(severity·remedy→suggestedFix).

## 린트 (로드 시 fail-closed)

**오류(로드 거부)**: 루트 비객체 · name/version/articles 누락 · article 중복 ·
scope/operator/result 화이트리스트 밖 · value 비유한수 · 한도 초과(조항 200 ·
조항당 조건 20 · 문자열 300자).
**경고(로드는 하되 고지)**: 자리표시자 임계(평가 시 HOLD됨) · 사전 밖 param ·
component 조항의 appliesTo 부재(전 컴포넌트 적용됨) · 미상 컴포넌트 타입.

무효 룰셋을 조용히 버리고 검토를 진행하는 것 금지 — 400과 오류 목록 반환.

## 배선

```
/tools/sld UI ──rules(JSON File)──▶ /api/team-review ──parse+lint──▶
  OrchestratorRequest.customRuleSet ──▶ TeamInput.customRuleSet ──▶
  sld-team: 추출 결과로 컨텍스트 구성 ──▶ engine/standards/custom-rules.evaluate
  ──▶ StandardEntry(standard=standardLabel)·ViolationEntry ──▶ consensus 합산 ──▶ 리포트
```

- 레이어링: engine은 agent 타입을 모른다 — `CustomRuleFinding`을 반환하고
  sld-team이 StandardEntry/ViolationEntry로 매핑.
- consensus-team은 standards를 라벨 무관하게 합산하므로(실측) 수정 불요.
- 별도 `POST /api/rules/validate` — 룰셋 저작 중 린트 전용.

## 보안·강건성

크기 1MB 캡 · 개수/길이 캡(위) · `Object.prototype.hasOwnProperty` 가드
(`__proto__` param 참조 무해화) · 평가에 eval/동적 코드 없음(비교 연산만) ·
note/title은 리포트에 텍스트 노드로만 렌더(React 이스케이프).

## 검증 계획

- 단위: 린트 오류/경고 전 분류 · 평가 PASS/FAIL/HOLD/자리표시자 · appliesTo 필터 ·
  `__proto__` 안전 · 캡 초과
- 통합: L1-02 픽스처 DXF + 예시 룰셋으로 `executeSLDTeam` → 사내규정 행 존재,
  KEC보다 엄격한 한도가 실제 FAIL을 내는지
- 라이브: `/api/rules/validate` 정상/오류 · `/api/team-review`에 rules 동봉 →
  리포트에 사내규정 판정 존재 · 무효 룰셋 400
