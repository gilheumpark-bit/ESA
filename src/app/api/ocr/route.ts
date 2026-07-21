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

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
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
    const providerPart = formData.get('provider');
    const modelPart = formData.get('model');
    const apiKeyPart = formData.get('apiKey');
    const provider = typeof providerPart === 'string' && providerPart ? providerPart : 'openai';
    const model = typeof modelPart === 'string' ? modelPart.trim() : '';
    const apiKey = typeof apiKeyPart === 'string' ? apiKeyPart.trim() : '';

    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image provided. Send multipart/form-data with "image" field.' },
        { status: 400 },
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required. ESVA uses BYOK — provide your Vision LLM API key.' },
        { status: 401 },
      );
    }
    if (!['openai', 'claude', 'gemini'].includes(provider)) {
      return NextResponse.json({ error: 'Unsupported Vision provider.' }, { status: 400 });
    }
    if (apiKey.length > 4096 || (model && !/^[a-zA-Z0-9._:/-]{1,128}$/.test(model))) {
      return NextResponse.json({ error: 'Invalid Vision credential parameters.' }, { status: 400 });
    }

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

    const blob = new Blob([await imageFile.arrayBuffer()], { type: imageFile.type });

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
