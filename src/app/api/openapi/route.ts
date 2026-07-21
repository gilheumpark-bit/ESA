/**
 * GET /api/openapi — ESVA OpenAPI 3.1 Schema
 * --------------------------------------------
 * Public core API specification. Internal/conditional routes are documented in
 * docs/API_REFERENCE.md and intentionally excluded from this stable contract.
 */

import { NextResponse } from 'next/server';
import { CALCULATOR_COUNT } from '@/engine/calculators/count';

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
            inputs: { type: 'object', example: { voltage: 380, current: 100, length: 50, cableSize: 35 } },
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
            query: { type: 'string', maxLength: 500, example: 'KEC 232.52 전압강하' },
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
      post: { summary: 'SLD 도면 분석 (VLM)', tags: ['Drawing'], responses: { 200: { description: '토폴로지 + 계산 체인' } } },
    },
    '/dxf': {
      post: { summary: 'DXF 벡터 파싱', tags: ['Drawing'], responses: { 200: { description: 'SLD 컴포넌트 + 연결' } } },
    },
    '/export': {
      post: { summary: '영수증 내보내기 (PDF/Excel/CSV)', tags: ['Export'], responses: { 200: { description: '파일 다운로드' } } },
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

export async function GET() {
  return NextResponse.json(OPENAPI_SPEC, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}
