---
schemaVersion: 1
project: ESA
status: active
baselineBranch: codex/sld-boundary-continuity
codeBaselineCommit: f966c6e3fb72bb327978f13c9bec601cd064d799
updatedAt: 2026-07-23T11:02:59.2916851+09:00
trigger: architecture
changedDomains: [app, lib, docs, scripts, ci]
---

# AI 계산기·채팅 배선과 문서 정본화

## 범위와 기준

- 제품 코드 기준: `ad7b91c83dc2beb4d1311ac6d766bf2ad5fb540e`
- 작업 브랜치: `codex/sld-boundary-continuity`
- 변경 영역: 홈·검색·Studio 채팅, `/api/chat`, 정본 계산기 영수증, OpenAI 호환 모델 전송, 문서 구조와 환경 변수 안내
- 현재 제품 상태 정본: `PROJECT_STATE.md`

## 변경

- AI 계산 질문을 정본 계산기 영수증과 결박하고 홈·검색·Studio가 같은 채팅 계약을 사용하게 했다.
- 현재 문서, 검증 원장, 설계 참고와 역사 기록을 구분하고 문서·환경·CI 계약을 자동 검사하게 했다.

## 이유

- Studio 무파일 질문과 홈 일반 질문이 실제 AI 답변·계산 경로를 일관되게 사용하지 않았다.
- 현재 문서와 과거 설계·QA 기록이 섞여 고정 테스트 수, 구형 팀 구조, 범용 오차율과 미배선 보안 기능을 현재 사실처럼 읽을 수 있었다.

## 사용자 소유 변경

- 작업 시작 시 사용자 소유 미커밋 변경은 없었다. 이번 문서·CI 변경은 `ad7b91c` 이후 작업 범위에서 생성했다.

## 완료

- 홈 일반 질문과 Studio 무파일 질문을 검색 스니펫 폴백이 아닌 공용 채팅 클라이언트에 연결했다.
- 서버가 전기 직무 시스템 지침을 소유하고 사용자 메시지와 분리했다.
- 완전한 계산 질문은 `CALCULATOR_REGISTRY`를 실행해 계산기 ID, 입력, 결과 영수증을 모델과 UI에 전달한다.
- Groq, Ollama, LM Studio, 온프레미스 OpenAI 호환 서버는 Chat Completions 계약을 사용한다.
- README, 아키텍처, 사용자·API·평가·기여·보안 문서를 production 배선 기준으로 다시 구성했다.
- `docs/README.md`에서 현재 정본, 검증 원장, 설계 참고, 역사 기록을 분리했다.
- `.env.example`의 중복 키와 소비자 없는 항목을 제거하고 코드가 실제 읽는 운영 키를 보완했다.
- 로컬 Markdown 링크, 하위 색인, 환경 변수 중복을 검사하는 `npm run check:docs`를 추가했다.
- `check:docs`와 `gate:chat-live`를 CI에 연결하고 `feat`, `fix`, `docs`, `codex` 브랜치 push를 같은 게이트로 검사한다.

## 부분 완료

- 일반 채팅은 실제 계산 영수증을 모델에 전달하지만 기준서 검색 결과를 같은 요청의 RAG 근거로 자동 합성하지 않는다.
- 입력 의도가 지원 계산기로 식별되고 필수 입력과 확신도 기준을 충족한 경우에만 자동 계산한다. 모든 자연어 계산 표현을 지원하지 않는다.
- 도면 합성은 명시된 필수 입력이 유일하게 결박된 전압강하를 실행한다. 범용 계산 체인 실행기는 여전히 휴면이다.

## 미검증

- 실제 Gemini, OpenAI, Claude에서 초급·중급·고급 질문을 반복한 정답성·근거성·제안 품질 비교
- Supabase, Stripe, Weaviate 운영 자격증명을 사용한 새 세션 read-back
- 외부 독립 라벨과 반복 실행을 사용한 SLD V3 95% 게이트

## 보류

- 회사 기밀 도면과 운영 사용자 데이터는 이번 작업에 사용하지 않았다.
- 외부 모델 ID·가격·지원 종료 일정은 공급자 공식 문서 확인 없이는 문서에 고정하지 않는다.
- 과거 계획과 심사 문서는 당시 상태를 보존하며 현재 완료 근거로 승격하지 않는다.

## 검증

- AI 코드 커밋 전 전체 Jest 175개 스위트·1,412개 테스트, 전체 ESLint, TypeScript, production build 통과
- `npm run gate:chat-live`: `3상 380V·100A·50m·35mm² Cu·PF 0.9` 입력이 정본 계산기에서 `4.14V·1.09%·PASS`로 실행되고 동일 영수증이 모델 요청과 UI SSE에 전달됨
- 문서 변경 후 `npm run check:docs`가 61개 Markdown의 로컬 링크·색인·환경 변수 중복을 통과함
- 한국어 문체 검사에서 신규 정본 문서의 긴 문장·세미콜론·과장 표현 0건을 확인함
- 현재 스냅샷에서 TypeScript, 전체 ESLint, Jest 175개 스위트·1,412개 테스트, 65페이지 production build를 모두 다시 통과함
- `package.json`·`package-lock.json` JSON, 문서 검사 스크립트 구문·ESLint, CI YAML 파싱을 통과함

## 다음 첫 행동

1. 실제 클라우드 모델별 일반 질문 정답 세트를 3회 이상 반복해 모델 선택 근거를 고정한다.
2. 일반 채팅에 기준서 검색 근거를 결박하되 조회하지 않은 조항 번호를 만들지 못하게 한다.
3. 공개 교보재의 기호·문자·관계 독립 라벨을 늘리고 SLD V3 평가 영수증을 갱신한다.
4. 배포 전 Supabase, Stripe, Weaviate와 인증 경계를 실제 자격증명으로 왕복한다.
