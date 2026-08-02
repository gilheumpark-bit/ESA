/**
 * ESVA OCR API Endpoint
 * ---------------------
 * POST: multipart/form-data with image → NameplateData + suggested calculators
 * BYOK required (Vision LLM).
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { getFormFile } from '@/lib/api';
import { NextRequest, NextResponse } from 'next/server';
import { recognizeNameplate, suggestCalculators } from '@/lib/ocr-nameplate';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import { withRequestLog } from '@/lib/api/with-request-log';
import { checkRasterImage } from '@/lib/image-signature';
import {
  DrawingVisionRequestError,
  resolveDrawingVisionRequest,
} from '@/lib/drawing-vision-request';

export const runtime = 'nodejs';

async function POST__impl(req: NextRequest) {
  try {
    if (!isRequestOriginAllowed(req.headers.get('origin'), req.url, undefined, req.headers.get('host'), req.headers.get('x-forwarded-proto'))) {
      return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
    }
    const blocked = applyRateLimit(req, 'ocr');
    if (blocked) return blocked;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: '이미지 요청 본문을 읽을 수 없습니다.', code: 'ESA-4001' },
        { status: 400 },
      );
    }
    const imagePart = getFormFile(formData, 'image');
    if (!imagePart.ok) {
      return NextResponse.json({ error: imagePart.message }, { status: 400 });
    }
    const imageFile = imagePart.file;
    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image provided. Send multipart/form-data with "image" field.' },
        { status: 400 },
      );
    }

    let vision;
    try {
      vision = await resolveDrawingVisionRequest(formData, req, false);
    } catch (error) {
      if (error instanceof DrawingVisionRequestError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
    if (!vision) {
      return NextResponse.json(
        { error: 'API key required. ESVA uses BYOK — provide your Vision LLM API key.' },
        { status: 401 },
      );
    }
    const provider = vision.provider;
    const model = vision.model ?? '';
    const apiKey = 'apiKey' in vision ? vision.apiKey : '';

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: `Invalid image type: ${imageFile.type}. Supported: JPEG, PNG, WebP.` },
        { status: 400 },
      );
    }

    // Validate file size (max 20MB)
    if (imageFile.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Image too large. Maximum size: 20MB.' },
        { status: 400 },
      );
    }

    // 선언된 MIME 은 클라이언트가 붙인 문자열이다. 바이트로 다시 본다 —
    // 통과시키면 그 다음이 비전 LLM 호출이라 사용자 BYOK 요금을 쓴다.
    const bytes = new Uint8Array(await imageFile.arrayBuffer());
    const signature = checkRasterImage(bytes);
    if (!signature.ok) {
      return NextResponse.json({ error: signature.message, code: 'ESA-4002' }, { status: 400 });
    }

    const blob = new Blob([bytes], { type: signature.type });

    const nameplateData = await recognizeNameplate(blob, {
      provider,
      model,
      apiKey,
    });

    const suggestedCalcs = suggestCalculators(nameplateData);

    return NextResponse.json({
      success: true,
      data: nameplateData,
      suggestedCalculators: suggestedCalcs,
    });
  } catch (err) {
    console.error('[ESA-OCR API]', err instanceof Error ? err.name : 'UnknownError');
    return NextResponse.json(
      { error: 'OCR 공급자 요청을 완료하지 못했습니다. API 키와 모델을 확인하세요.', code: 'ESA-6001' },
      { status: 502 },
    );
  }
}

export const POST = withRequestLog(POST__impl);
