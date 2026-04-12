/**
 * ESVA OCR API Endpoint
 * ---------------------
 * POST: multipart/form-data with image → NameplateData + suggested calculators
 * BYOK required (Vision LLM).
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { recognizeNameplate, suggestCalculators } from '@/lib/ocr-nameplate';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const blocked = applyRateLimit(req, 'ocr');
    if (blocked) return blocked;

    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    const provider = (formData.get('provider') as string) || 'openai';
    const model = (formData.get('model') as string) || '';
    const apiKey = (formData.get('apiKey') as string) || '';

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

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: `Invalid image type: ${imageFile.type}. Supported: JPEG, PNG, WebP, GIF.` },
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
    const message = err instanceof Error ? err.message : 'OCR processing failed';
    console.error('[ESA-OCR API]', message);

    const status = message.includes('401') || message.includes('403') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
