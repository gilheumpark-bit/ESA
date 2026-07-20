import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, getClientIp } from '@/lib/rate-limit';
import { saveContactMessage } from '@/lib/contact-store';

const SUBJECTS = new Set([
  '일반 문의',
  '버그 리포트',
  '기능 제안',
  '계산기 오류 신고',
  '계정 관련',
  '개인정보 문의',
  '기타',
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactBody {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, 'default');
  if (blocked) return blocked;

  let body: ContactBody;
  try {
    body = await request.json() as ContactBody;
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 아닙니다.' }, { status: 400 });
  }

  const name = normalizedText(body.name);
  const email = normalizedText(body.email).toLowerCase();
  const subject = normalizedText(body.subject);
  const message = normalizedText(body.message);

  if (!name || name.length > 100) {
    return NextResponse.json({ error: '이름은 1~100자로 입력해주세요.' }, { status: 400 });
  }
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 });
  }
  if (!SUBJECTS.has(subject)) {
    return NextResponse.json({ error: '지원하는 문의 유형을 선택해주세요.' }, { status: 400 });
  }
  if (!message || message.length > 5000) {
    return NextResponse.json({ error: '문의 내용은 1~5,000자로 입력해주세요.' }, { status: 400 });
  }

  const id = await saveContactMessage({
    name,
    email,
    subject,
    message,
    ip: getClientIp(request.headers),
  });
  if (!id) {
    return NextResponse.json(
      { error: '문의 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ data: { id, stored: true } }, { status: 201 });
}
