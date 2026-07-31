import { NextRequest, NextResponse } from 'next/server';

import {
  cancelChatGPTLocalLogin,
  getChatGPTLocalStatus,
  logoutChatGPTLocal,
  startChatGPTLocalLogin,
} from '@/lib/chatgpt-local';
import { assertLoopbackRequest } from '@/lib/chatgpt-local-loopback';
import { isRequestOriginAllowed } from '@/lib/request-origin';

export const runtime = 'nodejs';

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(body, { ...init, headers });
}

function isLocalRequest(request: NextRequest): boolean {
  try {
    assertLoopbackRequest(request);
  } catch {
    return false;
  }
  return isRequestOriginAllowed(
    request.headers.get('origin'),
    request.url,
    undefined,
    request.headers.get('host'),
    request.headers.get('x-forwarded-proto'),
  );
}

export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) {
    return privateJson({ error: { message: 'Not found' } }, { status: 404 });
  }
  return privateJson({ data: await getChatGPTLocalStatus() });
}

export async function POST(request: NextRequest) {
  if (!isLocalRequest(request)) {
    return privateJson({ error: { message: 'Not found' } }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') {
    return privateJson({ error: { message: '요청 형식이 올바르지 않습니다.' } }, { status: 400 });
  }

  try {
    if (body.action === 'login') {
      return privateJson({ data: await startChatGPTLocalLogin() });
    }
    if (body.action === 'cancel-login') {
      if (typeof body.loginId !== 'string' || body.loginId.length > 200) {
        return privateJson({ error: { message: '로그인 요청 식별자가 올바르지 않습니다.' } }, { status: 400 });
      }
      await cancelChatGPTLocalLogin(body.loginId);
      return privateJson({ data: { cancelled: true } });
    }
    if (body.action === 'logout') {
      await logoutChatGPTLocal();
      return privateJson({ data: { connected: false } });
    }
    return privateJson({ error: { message: '지원하지 않는 작업입니다.' } }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'LOCAL_CODEX_LOGIN_MISMATCH') {
      return privateJson({ error: { message: '현재 로그인 요청과 일치하지 않습니다.' } }, { status: 400 });
    }
    return privateJson(
      { error: { message: '로컬 ChatGPT 연결 작업을 완료하지 못했습니다.' } },
      { status: 503 },
    );
  }
}
