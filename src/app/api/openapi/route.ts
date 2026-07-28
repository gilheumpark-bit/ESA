/**
 * GET /api/openapi — ESVA OpenAPI 3.1 Schema
 * --------------------------------------------
 * Public core API specification. Internal/conditional routes are documented in
 * docs/API_REFERENCE.md and intentionally excluded from this stable contract.
 */

import { NextResponse } from 'next/server';
import { CALCULATOR_COUNT } from '@/engine/calculators/count';
import { withRequestLog } from '@/lib/api/with-request-log';

export const dynamic = 'force-dynamic';

const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'ESVA API',
    description: 'Electrical Search Vertical AI — 공개 핵심 검색·계산·검증 API',
    version: '0.2.0',
    contact: { name: 'ESVA Team', url: 'https://esva.engineer' },
  },
  servers: [
    { url: 'https://esva.engineer/api', description: 'Production' },
    { url: 'http://localhost:3000/api', description: 'Development' },
  ],
  paths: {
    '/health': {
      get: {
        summary: '시스템 상태 확인',
        tags: ['System'],
        description: '공개 호출은 상태와 시각만 반환합니다. Bearer HEALTHCHECK_TOKEN을 보내면 운영 의존성 상세를 반환합니다.',
        responses: { 200: { description: 'System healthy or degraded' }, 503: { description: 'Critical dependency down' } },
      },
    },
    '/calculate': {
      post: {
        summary: '계산기 실행',
        tags: ['Calculator'],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', required: ['calculatorId', 'inputs'], properties: {
            calculatorId: { type: 'string', example: 'voltage-drop' },
            // 예제는 **그대로 쳐서 200 이 나와야 한다.** 전에는
            // conductor·phase·powerFactor 가 빠져 422 였다(2026-07-28 실측).
            // 이 API 는 선언된 defaultValue 를 채워 주지 않는다 — 계산 입력을
            // 조용히 가정하지 않는 것이 이 앱의 방침이라, 문서 쪽을 맞춘다.
            inputs: {
              type: 'object',
              example: { voltage: 380, current: 100, length: 50, cableSize: 35, conductor: 'Cu', phase: 3, powerFactor: 0.85 },
            },
          } } } },
        },
        responses: { 200: { description: '계산 결과 + 영수증' }, 400: { description: '입력 오류' }, 404: { description: '계산기 미발견' } },
      },
    },
    '/search': {
      post: {
        summary: 'AI 법규 검색',
        tags: ['Search'],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: {
            query: { type: 'string', maxLength: 500, example: 'KEC 232.3.9 전압강하' },
            countryCode: { type: 'string', enum: ['KR', 'US', 'JP', 'INT'], default: 'KR' },
          } } } },
        },
        responses: { 200: { description: '검색 결과 + 지식 패널' } },
      },
    },
    '/chat': {
      post: {
        summary: 'AI 채팅 (스트리밍)',
        tags: ['AI'],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', required: ['messages', 'provider', 'model'], properties: {
            messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } } },
            provider: { type: 'string', enum: ['gemini', 'openai', 'claude', 'groq', 'mistral'] },
            model: { type: 'string', example: 'gpt-5.6-luna' },
          } } } },
        },
        responses: { 200: { description: 'SSE 스트림' } },
      },
    },
    '/team-review': {
      post: {
        summary: '3개 전문팀 검토 + 합의 보고서',
        tags: ['Review'],
        requestBody: {
          content: {
            'multipart/form-data': { schema: { type: 'object', properties: {
              file: { type: 'string', format: 'binary' },
              query: { type: 'string' },
              projectName: { type: 'string' },
              projectType: { type: 'string' },
            } } },
            'application/json': { schema: { type: 'object', properties: {
              query: { type: 'string' },
              params: { type: 'object' },
            } } },
          },
        },
        responses: { 200: { description: '전문팀 검토·합의 보고서' } },
      },
    },
    '/sld': {
      post: {
        summary: 'SLD 도면 분석 (VLM)',
        tags: ['Drawing'],
        description: 'BYOK — 키는 요청마다 받고 저장하지 않습니다.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['image', 'provider', 'apiKey'],
                properties: {
                  image: { type: 'string', format: 'binary', description: '도면 이미지 (PNG/JPG/WEBP, 최대 20MB)' },
                  provider: { type: 'string', enum: ['gemini', 'openai', 'claude'] },
                  apiKey: { type: 'string', description: 'BYOK 키' },
                  model: { type: 'string', description: '생략 시 공급자 기본 모델' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '토폴로지 + 계산 체인' },
          400: { description: '이미지 누락·형식 불일치·크기 초과' },
          401: { description: 'API 키 누락' },
          503: { description: 'AI 공급자 일시 응답 불가' },
        },
      },
    },
    '/dxf': {
      post: {
        summary: 'DXF 벡터 파싱',
        tags: ['Drawing'],
        // JSON 이 아니라 multipart 다. 그게 안 적혀 있어 문서만 보고는
        // 400 을 받게 돼 있었다(2026-07-28).
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary', description: '.dxf 파일 (최대 16MB)' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'SLD 컴포넌트 + 연결' },
          400: { description: 'multipart 가 아니거나 .dxf 가 아니거나 16MB 초과' },
        },
      },
    },
    '/export': {
      post: {
        // `pdf` 는 **인쇄용 HTML** 을 돌려준다(`text/html` · `%PDF-` 서명 없음).
        // 요약에 "PDF" 만 적으면 통합하는 쪽이 PDF 파일을 기대한다 —
        // 화면 버튼도 같은 이유로 "인쇄 · PDF" 로 고쳤다(2026-07-28).
        summary: '영수증 내보내기 (인쇄용 HTML / Excel / CSV)',
        tags: ['Export'],
        // 2026-07-28 정정 셋 — 선언이 실제와 달랐다:
        //  ① `receiptId` 만 필수로 적혀 있었는데 라우트는 **`receipt` 객체도**
        //     받는다(익명·클라이언트 보관 영수증 경로). 문서만 보면 그 길을
        //     찾을 수 없다.
        //  ② `lang` enum 에 **ja·zh 가 빠져** 있었다. 네 언어 모두 실제로
        //     동작한다(실측: 인쇄 안내가 ko/en/ja/zh 로 렌더).
        //  ③ 요약이 "PDF" 였다(위 참조).
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'receiptId 또는 receipt 중 하나는 반드시 있어야 한다.',
                required: ['format'],
                oneOf: [
                  { required: ['receiptId'] },
                  { required: ['receipt'] },
                ],
                properties: {
                  receiptId: { type: 'string', description: '저장된 영수증 ID (서버에서 조회)' },
                  receipt: { type: 'object', description: '영수증 객체를 직접 전달 (익명·클라이언트 보관분)' },
                  format: {
                    type: 'string',
                    enum: ['pdf', 'excel', 'csv'],
                    description: 'pdf 는 인쇄용 HTML(text/html) 을 돌려준다 — PDF 파일이 아니다.',
                  },
                  lang: { type: 'string', enum: ['ko', 'en', 'ja', 'zh'], default: 'ko' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '파일 다운로드' },
          400: { description: '본문이 JSON 이 아니거나 (receiptId|receipt)·format 누락' },
          401: { description: '인증 필요' },
          404: { description: '영수증 없음' },
        },
      },
    },
  },
  tags: [
    { name: 'System', description: '시스템 상태 및 헬스체크' },
    { name: 'Calculator', description: `${CALCULATOR_COUNT}개 전기 계산기` },
    { name: 'Search', description: 'AI 법규/기준서 검색' },
    { name: 'AI', description: 'LLM 채팅 (BYOK)' },
    { name: 'Review', description: 'SLD·평면도·기준서 전문팀 검토와 별도 합의 단계' },
    { name: 'Drawing', description: '도면 분석 (SLD/DXF/PDF)' },
    { name: 'Export', description: '결과 내보내기' },
  ],
};

async function GET__impl() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}

export const GET = withRequestLog(GET__impl);
