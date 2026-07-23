# Google 모델별 SLD 품질 실측 — 2026-07-23

## 범위와 입력

- 앱: ESVA, HEAD `9d49f8be0929bafa5302472294f3a20d64b75e07` + dirty working tree
- 공급자: 사용자가 브라우저에 저장한 Google Gemini 테스트 키
- 공개 교보재: `fixtures/drawings/external/wiki-oneline.png`
- 기준 정답: 주 모선 2구간·하부 모선 1, 발전기 1, 3권선 변압기 1,
  분로 리액터 1, 차단기 6, 주요 연결 13, 유·무효전력 표기 10개
- 기본 호환성: 모델당 텍스트 1회 + 1px 이미지 입력 1회
- SLD 실측: 앱의 `공개 교보재 빠른 분석`을 통해 기기→연결→계산 제안→회로
  검토까지 실제 호출. 단순 이미지 입력 성공과 도면 품질을 분리해 판정했다.

## 전체 38개 모델 기본 호환성

- 텍스트·이미지 입력 모두 성공: 22
- 실패: 13
- 보류: 3

기본 실패 13개:

`antigravity-preview-05-2026`, `deep-research-max-preview-04-2026`,
`deep-research-preview-04-2026`, `deep-research-pro-preview-12-2025`,
`gemini-2.0-flash`, `gemini-2.0-flash-001`, `gemini-2.0-flash-lite`,
`gemini-2.0-flash-lite-001`, `gemini-2.5-computer-use-preview-10-2025`,
`gemini-2.5-flash-lite`, `gemini-3-pro-preview`,
`gemini-omni-flash-preview`, `gemini-robotics-er-1.5-preview`.

보류 3개:

- `gemini-2.5-pro`: 텍스트 성공, 이미지 입력 보류
- `lyria-3-clip-preview`, `lyria-3-pro-preview`: 텍스트·이미지 모두 보류

## 공개 단선도 실측 13개

| 모델 | 기기/정답 14 | 연결/정답 13 | 확인된 수치/10 | 계산 제안 | 회로 검토 | 판정 |
|---|---:|---:|---:|---|---|---|
| `gemini-3.5-flash` | 14 | 13 | 9 | O | O | 성공 |
| `gemini-3-flash-preview` | 14 | 13 | 10 | O | O | 성공 |
| `gemini-3.1-pro-preview-customtools` | 14 | 13 | 10 | O | O | 성공 |
| `gemini-3.1-pro-preview` | 14 | 13 | 6 | O | O | 성공(수치 재확인) |
| `gemini-3.6-flash` | 14 | 13 | 6 | O | O | 성공(수치 재확인) |
| `gemini-flash-latest` | 14 | 13 | 6 | O | O | 성공(수치 재확인) |
| `gemini-pro-latest` | 14 | 13 | 6 | O | O | 성공(수치 재확인) |
| `gemini-robotics-er-1.6-preview` | 14 | 13 | 6 | O | O | 보류(도메인 명칭 약함) |
| `gemini-3.5-flash-lite` | 9 | 7 | 4 | O | O | 부분 실패 |
| `gemini-2.5-flash` | 3 | 0 | 2 | X | O | 실패 |
| `gemini-flash-lite-latest` | 2 | 0 | 0 | X | O | 실패 |
| `gemini-3.1-flash-lite` | 0 | 0 | 0 | X | 생략(HOLD) | 실패 |
| `gemini-3.1-flash-lite-preview` | 0 | 0 | 0 | X | 생략(HOLD) | 실패 |

`확인된 수치`는 결과 화면에 노출된 75/23, 85/27, 200/96, 40/46,
39/21 MW·MVAR 문자열을 기준으로 셌다. 기기·연결 수가 맞아도 모든 정격·흐름
수치가 결과 표면에 남지 않으면 성공(수치 재확인)으로 분리했다.

## SLD 대상 아님 / 미결

- 이미지 생성 계열 7개는 기본 호출이 성공해도 구조화 SLD 분석 모델로 간주하지
  않는다: `gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview`,
  `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`,
  `gemini-3-pro-image-preview`, `gemini-3-pro-image`,
  `nano-banana-pro-preview`.
- `gemma-4-26b-a4b-it`, `gemma-4-31b-it`는 기본 텍스트·이미지 입력은 성공했다.
  SLD 실측 중 브라우저 제어 세션이 제한 시간을 넘겨 결과를 회수하지 못해 보류한다.

## 제품 결론

1. `이미지 입력 성공`은 `도면 분석 성공`이 아니다. Lite 계열에서 0~9개 기기만
   반환하는 실패가 실제 재현됐다.
2. 이 표본의 우선 모델은 `gemini-3.5-flash`, `gemini-3-flash-preview`,
   `gemini-3.1-pro-preview-customtools`다.
3. BYOK 화면의 검사를 `기본 호출 호환성 검사`로 고치고, 도면 판독 품질을
   보증하지 않는다는 문구를 추가했다.
4. 현재 결과는 공개 교보재 1종의 단일 실행 비교다. 모델 일반 정확도나 현장 실증
   점수가 아니며, 모델별 반복성·복수 도면 평가는 별도 표본으로 누적해야 한다.
