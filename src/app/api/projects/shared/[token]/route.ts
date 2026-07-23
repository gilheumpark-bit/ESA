import { createHash } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { getProject, validateShareLink } from '@/lib/collaboration';
import { loadCalculation } from '@/lib/supabase';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function extractToken(request: NextRequest): string {
  return new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
}

export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, 'default');
  if (blocked) return blocked;

  const token = extractToken(request);
  if (!TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: '올바르지 않은 공유 링크입니다.' }, { status: 400 });
  }

  let password: string | undefined;
  try {
    const body = await request.json() as { password?: unknown };
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length > 128) {
        return NextResponse.json({ error: '올바르지 않은 비밀번호 형식입니다.' }, { status: 400 });
      }
      password = body.password;
    }
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 아닙니다.' }, { status: 400 });
  }

  if (password !== undefined) {
    const linkKey = createHash('sha256').update(token).digest('hex');
    const attempt = checkRateLimit(`share:${linkKey}`, 'share-password');
    if (!attempt.allowed) {
      return NextResponse.json(
        { error: '비밀번호 확인 요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },
        {
          status: 429,
          headers: { 'Retry-After': String(attempt.retryAfter ?? 900) },
        },
      );
    }
  }

  const validation = await validateShareLink(token, password);
  if (!validation.valid || !validation.projectId) {
    if (validation.error === 'Too many password attempts') {
      return NextResponse.json(
        { error: '비밀번호 확인 요청이 너무 많습니다. 잠시 후 다시 시도하세요.' },
        {
          status: 429,
          headers: { 'Retry-After': String(validation.retryAfter ?? 900) },
        },
      );
    }
    if (validation.error === 'Password required' || validation.error === 'Invalid password') {
      return NextResponse.json(
        {
          error: validation.error === 'Password required'
            ? '이 링크는 비밀번호가 필요합니다.'
            : '비밀번호가 일치하지 않습니다.',
          passwordRequired: true,
        },
        { status: 401 },
      );
    }
    if (validation.error === 'Link expired') {
      return NextResponse.json({ error: '만료된 공유 링크입니다.' }, { status: 410 });
    }
    return NextResponse.json({ error: '공유 링크를 찾을 수 없습니다.' }, { status: 404 });
  }

  const project = await getProject(validation.projectId);
  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const calculations = (await Promise.all(project.calculations.map(async (receiptId) => {
    try {
      const receipt = await loadCalculation(receiptId);
      if (!receipt) return null;
      return {
        id: receipt.id,
        calculatorName: receipt.calculator_name,
        calculatorId: receipt.calculator_id,
        createdAt: receipt.created_at,
        value: typeof receipt.outputs?.value === 'number' ? receipt.outputs.value : undefined,
        unit: typeof receipt.outputs?.unit === 'string' ? receipt.outputs.unit : undefined,
      };
    } catch {
      return null;
    }
  }))).filter(Boolean);

  // Member identities, owner identity, and raw calculation inputs are deliberately redacted.
  return NextResponse.json({
    data: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      calculations,
      readOnly: true,
    },
  });
}
