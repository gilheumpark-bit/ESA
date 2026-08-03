---
schemaVersion: 1
project: ESA
status: active
baselineBranch: main
codeBaselineCommit: 0d475fc1961a3f9daab8687ae54551702590f037
updatedAt: 2026-08-03T17:04:00+09:00
trigger: architecture
changedDomains: [lib, agent, docs, scripts]
---

# 로컬 모델 추론 단계 캘리브레이션 인수인계 — 2026-08-03

## 변경

- 로컬 도면 추론에 `xhigh`, `max`를 추가했다. 원격 Vision 공급자에는 두 값을 전달하지 않고 400으로 닫는다.
- 명시 추론 실행의 문서 한도는 570초다. 로컬 역할 제한은 low/medium 75초, high 이상 120초이며 최대 8개를 동시에 실행한다.
- GPT-5.5는 low~xhigh, Luna는 high~max, Terra와 Sol은 low~max를 실행하는 17칸 계획을 코드로 고정했다. 실제 모델 카탈로그에 없는 단계는 대체 호출하지 않는다.
- 실행기는 조합별 영수증을 즉시 저장하고 `--resume`, `--aggregate-only`, 부분 필터를 지원한다.
- 모델·effort 지문, 600초 경계, 문서 상태, 엄격 품질, 필수 역할을 모두 통과한 경우에만 추천 후보로 표시한다.

## 이유

같은 공개 도면과 같은 코드 snapshot에서 모델·추론 단계별 정확도와 시간을 분리하고, 표면 점수가 높아도 필수 심사 역할이 빠진 결과를 추천하지 않기 위해서다. 시간은 600초 이내 여부에만 사용하고 모델 순위에는 사용하지 않는다.

## 사용자 소유 변경

없음. 회사 도면, API 키, 계정 토큰, 생성된 캘리브레이션 영수증은 수정하거나 커밋하지 않았다.

## 완료

- 코드 기준선 `0d475fc1961a3f9daab8687ae54551702590f037`에 추론 단계 계약, 로컬 동시성, 역할별 제한 시간, 실행기와 테스트를 반영했다.
- 중급 공개 3상 결선도 한 장으로 17조합을 실호출했다.
- 모델·effort 지문은 17/17 일치했고 모든 조합은 600초 이내 종료했다.
- 결정론 재채점은 clean `0d475fc`에서 같은 후보 판정 0/17을 재현했다.

## 부분 완료

17조합 모두 문서 판정은 `PARTIAL/FAIL`이고 추천 후보는 0개다. Terra/high가 88%·관계 100%·421초·누락 1역할로 가장 덜 불완전했지만 coverage auditor가 빠졌다. Terra/max와 Sol/xhigh의 99%는 필수 역할 누락이 각각 4개·3개라 후보가 아니다.

실패 기록 414건 중 로컬 호출 timeout이 281건, 문서 deadline/abort가 93건이다. graph conflict는 24건, malformed structured output은 3건이다. 현재 병목은 단순 판독 정확도보다 호출 정착과 시간 예산 배분이다.

## 미검증

- 초급·고급 공개 교보재와 회사 도면에 대한 반복성은 이번 한 장 실험에서 검증하지 않았다.
- 역할별 혼합 effort가 역할 누락과 오탐을 실제로 줄이는지는 아직 A/B하지 않았다.
- 공급자 간 우열과 일반적인 도면 판독 능력은 이번 단일 도면 결과로 일반화하지 않았다.

## 보류

기본 모델과 기본 effort 변경은 보류했다. 모든 후보가 필수 역할 완전성 게이트를 통과하지 못했으므로 표면 점수만 보고 기본값을 바꿀 근거가 없다.

## 검증

- 라이브 17조합: 모델·effort 지문 17/17 일치, 비교 snapshot 1개, 후보 0/17.
- `npx tsc --noEmit --incremental false`: exit 0.
- `npm run lint -- --max-warnings=0`: exit 0.
- `npm test -- --runInBand`: 333 suites·4,038 tests 통과, 1 suite·1 test skip.
- `npm run build`: exit 0, 66페이지.
- 캘리브레이션 Node 계약: 6/6 통과.
- 원격 `xhigh/max` 차단 추가 후 관련 Jest 25건, 타입 검사와 수정 파일 ESLint: exit 0.

라이브 영수증은 호출 당시 dirty snapshot `f70da7f6…`에, 결정론 재채점은 clean `0d475fc`에 묶여 있다.

## 다음 첫 행동

같은 공개 도면과 현재 Terra/high를 기준군으로 두고, 추출 역할은 low/medium, 관계·논리·감사는 high로 분리한 단일 A/B를 실행한다. 10분 안에서 필수 역할 누락과 오탐이 모두 줄어들 때만 혼합 프로필을 기본값 후보로 채택한다.
