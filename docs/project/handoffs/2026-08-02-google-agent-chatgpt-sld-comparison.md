# Google Agent Platform·ChatGPT SLD 비교 영수증

## 평가 좌표

- 코드 기준: `418a148ece5e3ac7ff3c3f165ed32ff20380bb6b`
- 실행일: 2026-08-02 (Asia/Seoul)
- 생산 진입점: `POST /api/sld`
- 공개 입력: `fixtures/drawings/external/wiki-oneline.png`
- Agent Platform: `gemini-3.6-flash`, `GOOGLE_VERTEX_API_KEY`, Express Mode
- ChatGPT: `gpt-5.6-terra`, 로컬 Codex 공식 로그인
- 반복: 공급자별 2회

이 영수증은 한 장의 공개 단선도에 대한 반복 실측이다. 독립 데이터셋 정확도나
범용 80% 달성을 증명하지 않는다.

## 사람이 확인한 표본 기준

그림에 보이는 전기 구조는 전원 2, 차단기 6, 모선 3, 발전기 1, 변압기 1,
리액터 1로 총 14개다. 이들을 잇는 전기 결선은 13개이며, 전력 흐름 문자는
`75 MW/23 MVAR`, `85 MW/27 MVAR`, `200 MW/96 MVAR`, `40 MW/46 MVAR`,
`39 MW/21 MVAR`의 5묶음이다.

## 결과

| 공급자·회차 | 시간 | 전기 기기 | 결선 | 단일 연결망 | 문자 관찰 |
|---|---:|---:|---:|---|---|
| Agent Platform 1 | 22.586초 | 14/14 | 13/13 | 예 | 전력 문자 3/5를 기기 rating에 결합 |
| Agent Platform 2 | 24.521초 | 14/14 | 13/13 | 예 | 전력 문자 3/5를 기기 rating에 결합 |
| ChatGPT 1 | 47.227초 | 14/14 | 13/13 | 예 | 5/5를 별도 annotation으로 보존 |
| ChatGPT 2 | 31.363초 | 13/14 | 12/13 | 예 | 하단 모선·해당 결선 누락, 문자 완전성은 이 영수증에서 미계량 |

- 평균 시간: Agent Platform 23.554초, ChatGPT 39.295초. 이 표본에서 Agent
  Platform이 약 1.67배 빨랐다.
- 구조 반복성: Agent Platform은 2/2회 동일한 14기기·13결선이었다. ChatGPT는
  1/2회만 완전 구조였지만 첫 회에는 전력 흐름 문자 5묶음을 모두 보존했다.
- 두 공급자 모두 존재하지 않는 전기 결선을 추가하지 않았고 차단기 6개를 읽었다.

## 실호출에서 잡은 제품 결함

1. Agent Platform은 `contents[].role`이 없으면
   `400 INVALID_ARGUMENT: Please use a valid role: user, model.`로 거부했다. 기존
   mock 테스트는 호스트와 키만 검사해 이 계약을 놓쳤다. SLD·OCR·구획 VLM·역할
   호출에 `role: user`를 추가했다.
2. Gemini 3 계열은 최종 텍스트 앞에 `thought: true` 파트를 둘 수 있다. 모든
   Google 도면 호출이 사고 파트를 버리고 최종 텍스트만 합치도록 정본 파서를
   추가했다.
3. ChatGPT가 전력 흐름 문자를 `annotation`으로 정확히 보존하자 ESA 토폴로지
   검증기가 이를 고립된 전기 노드로 계산해 연결망을 6개로 잘못 표시했다.
   annotation은 결과에 보존하되 전기 노드·간선·고립 판정에서는 제외했다.

## 판정

- 이 한 장의 **전기 구조**에서는 두 공급자 모두 사용자 기준 80%를 넘었다.
- 기본 1차 구조 판독은 Agent Platform이 더 빠르고 반복 안정적이었다.
- 문자·주석 누락 보완 심사는 ChatGPT가 유리했지만 반복 편차가 확인됐다.
- 권장 구성은 `Agent Platform 1차 구조 판독 → ChatGPT 2차 문자·누락 심사 → ESA
  전체 그래프 합산·중복 제거`다.
- 일반화된 80% 판정은 난이도별 독립 정답표와 공급자별 3회 이상 반복 전까지 HOLD다.

