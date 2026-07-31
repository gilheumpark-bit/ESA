/**
 * ESVA OCR Nameplate Recognition
 * ------------------------------
 * Equipment nameplate OCR via Vision LLM (BYOK).
 * Extracts electrical parameters, suggests relevant calculators.
 *
 * PART 1: Types
 * PART 2: Regex-based electrical parameter extraction
 * PART 3: Vision LLM nameplate recognition
 * PART 4: Calculator suggestion engine
 */

import {
  googleApiKeyHeaders,
  googleGenerateContentEndpoint,
  sanitizeGoogleErrorText,
  type GoogleModelProvider,
} from '@/lib/google-model-transport';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface NameplateData {
  manufacturer?: string;
  model?: string;
  voltage?: string;
  current?: string;
  power?: string;
  frequency?: string;
  serialNumber?: string;
  phase?: string;
  rating?: string;
  efficiency?: string;
  powerFactor?: string;
  rpm?: string;
  insulation?: string;
  protection?: string;
  rawText: string;
  confidence: number;
  language: 'ko' | 'en' | 'ja' | 'zh' | 'unknown';
}

export interface NameplateOCROptions {
  provider: string;
  model: string;
  apiKey: string;
  language?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Regex-based Electrical Parameter Extraction
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 전기 파라미터 추출: OCR 텍스트에서 V, A, kW, Hz, kVA 값 추출
 * Supports multilingual labels (ko/en/ja/zh).
 */
/**
 * 단위 뒤에 라틴 문자가 더 붙으면 **다른 단위**다.
 *
 *   kV  ⊂ kVA   (전압 ⊂ 피상전력)   MVA ⊂ MVAR (피상 ⊂ 무효)
 *   kW  ⊂ kWh   (전력 ⊂ 전력량)     kA  ⊂ kAh
 *
 * 경계가 없으면 명판의 `400kVA` 가 전압 `400kV` 로, 단선도의 `23 MVAR` 이
 * 전력 `23MVA` 로 읽힌다 — 둘 다 라이브에서 실제로 났다(2026-07-29).
 */
const UNIT_TAIL = '(?![A-Za-z])';

export function parseElectricalParams(text: string): Partial<NameplateData> {
  const result: Partial<NameplateData> = {};
  const normalized = text.replace(/\s+/g, ' ');

  /**
   * 전압 (Voltage): 220V, 380V, 3.3kV, 6600V, etc.
   *
   * **`kV` 는 `kVA` 의 앞부분이다.** 경계가 없어 명판의 용량 `400kVA` 가
   * 전압 `400kV` 로 읽혔다 — 라이브 실측(2026-07-29 · Trafo-Union GEAFOL
   * 400kVA 20000/400V 명판). 400V 2차측이 400,000V 로 표시되는 것이고,
   * 1000 배 오차를 **위험한 방향으로** 낸다. 비전 모델은 `20000/400V` 로
   * 정확히 읽었는데 추출층이 뒤집었다(§2.10).
   *
   * `2 차측/1 차측` 쌍(`20000/400V`)을 단독 `V` 보다 먼저 본다 — 순서가
   * 바뀌면 쌍의 앞 숫자만 잡는다.
   */
  const voltagePatterns = [
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*kV${UNIT_TAIL}`, 'i'),
    new RegExp(
      `(?:voltage|전압|電圧|电压|rated\\s*voltage)\\s*[:\\s]*(\\d+(?:\\.\\d+)?)\\s*(?:kV|V)${UNIT_TAIL}`,
      'i',
    ),
    new RegExp(`(\\d{2,5})\\s*/\\s*(\\d{2,5})\\s*V${UNIT_TAIL}`, 'i'),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*V${UNIT_TAIL}`, 'i'),
  ];

  for (const [index, pattern] of voltagePatterns.entries()) {
    const m = normalized.match(pattern);
    if (!m) continue;
    // 0 번은 kV 전용 패턴, 2 번은 1·2 차 쌍. 나머지는 단독 V.
    if (index === 0 && m[1]) result.voltage = `${m[1]}kV`;
    else if (m[2]) result.voltage = `${m[1]}/${m[2]}V`;
    else if (m[1]) result.voltage = `${m[1]}${/kV/i.test(m[0]) ? 'kV' : 'V'}`;
    break;
  }

  // 전류 (Current): 10A, 100A, 1.5kA — `kA` 는 `kAh` 의 앞부분이다.
  const currentPatterns = [
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*kA${UNIT_TAIL}`, 'i'),
    new RegExp(
      `(?:current|전류|電流|电流|rated\\s*current|정격전류)\\s*[:\\s]*(\\d+(?:\\.\\d+)?)\\s*A${UNIT_TAIL}`,
      'i',
    ),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*A${UNIT_TAIL}`, 'i'),
  ];

  for (const pattern of currentPatterns) {
    const m = normalized.match(pattern);
    if (m) {
      if (/kA/i.test(m[0]) && m[1]) {
        result.current = `${m[1]}kA`;
      } else {
        const val = m[2] ?? m[1];
        if (val) result.current = `${val}A`;
      }
      break;
    }
  }

  /**
   * 전력 (Power): 5kW, 100W, 50kVA, 1MVA
   *
   * **단위 뒤에 글자가 더 붙으면 다른 단위다.** 앞서는 경계가 없어 `MVA` 가
   * `MVAR` 의 앞부분에 걸렸다 — 라이브 실측(2026-07-29, wiki 단선도 OCR):
   * 원문은 `23 MVAR` 로 정확히 읽혔는데 추출층이 **`전력: 23MVA`** 로 바꿔
   * 놓고 "변압기 용량" 계산기를 권했다. 무효전력을 피상전력으로 바꾼 것이라
   * 그대로 넘기면 용량 산정이 틀어진다(§2.10 — 비전 모델은 맞았고 우리가
   * 틀렸다). `kVA`↔`kVAR`, `kW`↔`kWh`(전력량)도 같은 함정이다.
   *
   * 못 잡으면 `power` 는 비워 둔다 — 틀린 값을 채우는 것보다 낫다.
   */
  const powerPatterns: Array<{ re: RegExp; unit: string }> = [
    { re: new RegExp(`(\\d+(?:\\.\\d+)?)\\s*MVA${UNIT_TAIL}`, 'i'), unit: 'MVA' },
    { re: new RegExp(`(\\d+(?:\\.\\d+)?)\\s*kVA${UNIT_TAIL}`, 'i'), unit: 'kVA' },
    { re: new RegExp(`(\\d+(?:\\.\\d+)?)\\s*kW${UNIT_TAIL}`, 'i'), unit: 'kW' },
    {
      re: new RegExp(
        `(?:power|전력|출력|電力|功率|rated\\s*power|정격출력)\\s*[:\\s]*(\\d+(?:\\.\\d+)?)\\s*(?:kW|W|kVA|MVA)${UNIT_TAIL}`,
        'i',
      ),
      unit: '',
    },
    { re: new RegExp(`(\\d+(?:\\.\\d+)?)\\s*W${UNIT_TAIL}`, 'i'), unit: 'W' },
  ];

  for (const { re, unit } of powerPatterns) {
    const m = normalized.match(re);
    if (m?.[1]) {
      // 라벨형(네 번째)은 단위가 문장 안에 있으므로 원문에서 그대로 떼어 온다.
      const resolved = unit || (/kVA/i.test(m[0]) ? 'kVA'
        : /MVA/i.test(m[0]) ? 'MVA'
          : /kW/i.test(m[0]) ? 'kW' : 'W');
      result.power = `${m[1]}${resolved}`;
      break;
    }
  }

  // 주파수 (Frequency): 50Hz, 60Hz, 50/60Hz
  const freqPatterns = [
    /(\d+)\s*\/\s*(\d+)\s*Hz/i,
    /(?:frequency|주파수|周波数|频率)\s*[:\s]*(\d+)\s*Hz/i,
    /(\d+)\s*Hz/i,
  ];

  for (const pattern of freqPatterns) {
    const m = normalized.match(pattern);
    if (m) {
      if (m[2]) {
        result.frequency = `${m[1]}/${m[2]}Hz`;
      } else {
        const val = m[2] ?? m[1];
        if (val) result.frequency = `${val}Hz`;
      }
      break;
    }
  }

  // 상수 (Phase): 1-phase, 3-phase, 단상, 삼상
  const phaseMatch = normalized.match(
    /(?:3[- ]?phase|삼상|三相|3P|3Φ|3φ)/i,
  );
  if (phaseMatch) {
    result.phase = '3';
  } else {
    const singlePhase = normalized.match(
      /(?:1[- ]?phase|단상|單相|1P|1Φ|1φ|single[- ]?phase)/i,
    );
    if (singlePhase) result.phase = '1';
  }

  // 역률 (Power Factor)
  const pfMatch = normalized.match(
    /(?:power\s*factor|역률|力率|功率因数|PF|cos\s*[φΦθ])\s*[:\s=]*(\d+(?:\.\d+)?)/i,
  );
  if (pfMatch?.[1]) result.powerFactor = pfMatch[1];

  // 효율 (Efficiency)
  const effMatch = normalized.match(
    /(?:efficiency|효율|効率|效率|η)\s*[:\s=]*(\d+(?:\.\d+)?)\s*%?/i,
  );
  if (effMatch?.[1]) result.efficiency = `${effMatch[1]}%`;

  // RPM
  const rpmMatch = normalized.match(
    /(\d{3,4})\s*(?:rpm|r\/min|RPM|min⁻¹)/i,
  );
  if (rpmMatch?.[1]) result.rpm = `${rpmMatch[1]}rpm`;

  // 절연등급 (Insulation class)
  const insMatch = normalized.match(
    /(?:insulation|절연[등급]*|絶縁|绝缘)\s*[:\s]*(?:class\s*)?([ABEFH])/i,
  );
  if (insMatch?.[1]) result.insulation = `Class ${insMatch[1].toUpperCase()}`;

  // 보호등급 (IP rating)
  const ipMatch = normalized.match(/IP\s*(\d{2}[A-Z]?)/i);
  if (ipMatch?.[1]) result.protection = `IP${ipMatch[1]}`;

  // 시리얼번호 (Serial number)
  const snPatterns = [
    /(?:serial\s*(?:no\.?|number)|S\/N|시리얼|제조번호|製造番号)\s*[:\s]*([A-Z0-9][-A-Z0-9]{4,30})/i,
  ];

  for (const pattern of snPatterns) {
    const m = normalized.match(pattern);
    if (m?.[1]) {
      result.serialNumber = m[1];
      break;
    }
  }

  return result;
}

/**
 * OCR 텍스트에서 언어 감지
 */
function detectLanguage(text: string): NameplateData['language'] {
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) ?? []).length;
  const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) ?? []).length;
  const chineseChars = (text.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  const total = koreanChars + japaneseChars + chineseChars;

  if (total === 0) return 'en';
  if (koreanChars >= japaneseChars && koreanChars >= chineseChars) return 'ko';
  if (japaneseChars >= chineseChars) return 'ja';
  return 'zh';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Vision LLM Nameplate Recognition
// ═══════════════════════════════════════════════════════════════════════════════

const NAMEPLATE_SYSTEM_PROMPT = `You are an expert electrical engineer analyzing equipment nameplates.
Extract ALL electrical parameters visible on the nameplate image.
Return a JSON object with these fields (omit if not visible):
{
  "manufacturer": "string",
  "model": "string",
  "voltage": "string with unit (e.g. 380V, 3.3kV)",
  "current": "string with unit (e.g. 10A, 1.5kA)",
  "power": "string with unit (e.g. 5kW, 100kVA)",
  "frequency": "string with unit (e.g. 60Hz, 50/60Hz)",
  "serialNumber": "string",
  "phase": "1 or 3",
  "rating": "string",
  "efficiency": "string with %",
  "powerFactor": "string (0-1)",
  "rpm": "string with rpm",
  "insulation": "string (e.g. Class F)",
  "protection": "string (e.g. IP55)",
  "rawText": "all text visible on nameplate",
  "confidence": 0.0-1.0,
  "language": "ko|en|ja|zh"
}
Return ONLY valid JSON. No markdown, no explanation.`;

/**
 * Vision LLM을 사용한 명판 OCR
 * Supports: OpenAI Vision, Anthropic Claude Vision, Google Gemini Vision
 */
export async function recognizeNameplate(
  imageData: string | Blob,
  options: NameplateOCROptions,
): Promise<NameplateData> {
  const base64 = await toBase64(imageData);
  const mimeType = detectMimeType(base64);

  let responseText: string;

  switch (options.provider) {
    case 'openai':
      responseText = await callOpenAIVision(base64, mimeType, options);
      break;
    case 'claude':
      responseText = await callClaudeVision(base64, mimeType, options);
      break;
    case 'gemini':
      responseText = await callGoogleVision('gemini', base64, mimeType, options);
      break;
    case 'google-agent-platform':
      responseText = await callGoogleVision('google-agent-platform', base64, mimeType, options);
      break;
    default:
      throw new Error(`[ESA-OCR] Unsupported vision provider: ${options.provider}. Use openai, claude, gemini, or google-agent-platform.`);
  }

  // Parse LLM response
  const parsed = parseNameplateVisionResponse(responseText);

  // Fallback: merge regex extraction with LLM results
  const regexParams = parseElectricalParams(parsed.rawText || responseText);

  return {
    manufacturer: parsed.manufacturer ?? regexParams.manufacturer,
    model: parsed.model ?? regexParams.model,
    voltage: parsed.voltage ?? regexParams.voltage,
    current: parsed.current ?? regexParams.current,
    power: parsed.power ?? regexParams.power,
    frequency: parsed.frequency ?? regexParams.frequency,
    serialNumber: parsed.serialNumber ?? regexParams.serialNumber,
    phase: parsed.phase ?? regexParams.phase,
    rating: parsed.rating ?? regexParams.rating,
    efficiency: parsed.efficiency ?? regexParams.efficiency,
    powerFactor: parsed.powerFactor ?? regexParams.powerFactor,
    rpm: parsed.rpm ?? regexParams.rpm,
    insulation: parsed.insulation ?? regexParams.insulation,
    protection: parsed.protection ?? regexParams.protection,
    rawText: parsed.rawText || responseText,
    // 모델이 안 적어 보내면 0 이다. 0.5 를 지어내면 "절반은 맞다" 는 없는
    // 근거가 생긴다 — 화면이 0 을 "미보고" 로 구분해 보여 준다.
    confidence: parsed.confidence ?? 0,
    language: parsed.language && parsed.language !== 'unknown'
      ? parsed.language
      : detectLanguage(parsed.rawText || responseText),
  };
}

async function callOpenAIVision(
  base64: string,
  mimeType: string,
  options: NameplateOCROptions,
): Promise<string> {
  const model = options.model || 'gpt-5.6-terra';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: NAMEPLATE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this equipment nameplate and extract all electrical parameters.' },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' },
            },
          ],
        },
      ],
      max_completion_tokens: 2000,
      ...(model.startsWith('gpt-5') ? {} : { temperature: 0.1 }),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`[ESA-OCR] OpenAI Vision error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callClaudeVision(
  base64: string,
  mimeType: string,
  options: NameplateOCROptions,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: options.model || 'claude-sonnet-5',
      max_tokens: 2000,
      system: NAMEPLATE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 },
            },
            {
              type: 'text',
              text: 'Analyze this equipment nameplate and extract all electrical parameters.',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`[ESA-OCR] Claude Vision error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

async function callGoogleVision(
  provider: GoogleModelProvider,
  base64: string,
  mimeType: string,
  options: NameplateOCROptions,
): Promise<string> {
  const model = options.model || (provider === 'gemini' ? 'gemini-3.5-flash' : 'gemini-3.6-flash');
  const url = googleGenerateContentEndpoint(provider, model);

  const res = await fetch(url, {
    method: 'POST',
    headers: googleApiKeyHeaders(options.apiKey),
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${NAMEPLATE_SYSTEM_PROMPT}\n\nAnalyze this equipment nameplate and extract all electrical parameters.` },
            {
              inline_data: { mime_type: mimeType, data: base64 },
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    const label = provider === 'gemini' ? 'Gemini' : 'Agent Platform';
    throw new Error(`[ESA-OCR] ${label} Vision error ${res.status}: ${sanitizeGoogleErrorText(err, options.apiKey, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Calculator Suggestion Engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 명판 데이터로 실행 가능한 계산기 추천
 */
export function suggestCalculators(nameplate: NameplateData): string[] {
  const suggestions: string[] = [];

  // 전압과 전류가 있으면 전압강하 계산 가능
  if (nameplate.voltage && nameplate.current) {
    suggestions.push('voltage-drop');
  }

  // 전력이 있으면 전선 사이즈 계산
  if (nameplate.power || (nameplate.voltage && nameplate.current)) {
    suggestions.push('cable-sizing');
  }

  // 전류가 있으면 차단기 선정
  if (nameplate.current) {
    suggestions.push('breaker-sizing');
  }

  // 모터 데이터 (rpm, 효율, 역률)
  if (nameplate.rpm || nameplate.efficiency) {
    suggestions.push('starting-current');
    // `motor-load` 라는 계산기는 없다(2026-07-28 실측). 그 id 로 추천하면
    // 화면 칩이 원본 id 를 그대로 찍고, 링크는 /calc/power/motor-load 로 가
    // **"계산기를 찾을 수 없습니다"** 가 뜬다 — 모터 명판을 스캔한 사용자가
    // 받는 추천이 빈 페이지로 갔다. 명판 데이터로 할 수 있는 실제 계산은
    // 전동기 용량 산정이다.
    suggestions.push('motor-capacity');
  }

  // 전력 데이터로 부하 계산
  if (nameplate.power) {
    suggestions.push('demand-diversity');
    suggestions.push('max-demand');
  }

  // kVA 정격 → 변압기 관련 계산
  if (nameplate.power?.includes('kVA') || nameplate.power?.includes('MVA')) {
    suggestions.push('transformer-capacity');
    suggestions.push('short-circuit');
  }

  // 3상 데이터
  if (nameplate.phase === '3' && nameplate.voltage && nameplate.current) {
    suggestions.push('three-phase-power');
  }

  // 역률 보상
  if (nameplate.powerFactor) {
    suggestions.push('reactive-power');
  }

  return [...new Set(suggestions)];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════════

async function toBase64(imageData: string | Blob): Promise<string> {
  if (typeof imageData === 'string') {
    // Already base64 or data URL
    if (imageData.startsWith('data:')) {
      return imageData.split(',')[1] ?? imageData;
    }
    return imageData;
  }

  // Blob → base64
  const buffer = await imageData.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function detectMimeType(base64OrDataUrl: string): string {
  // Check for common image headers in base64
  if (base64OrDataUrl.startsWith('/9j/')) return 'image/jpeg';
  if (base64OrDataUrl.startsWith('iVBOR')) return 'image/png';
  if (base64OrDataUrl.startsWith('R0lG')) return 'image/gif';
  if (base64OrDataUrl.startsWith('UklG')) return 'image/webp';
  return 'image/jpeg'; // default
}

export function parseNameplateVisionResponse(text: string): Partial<NameplateData> {
  const failClosed = (): Partial<NameplateData> => ({
    rawText: text.slice(0, 20_000),
    confidence: 0,
    language: 'unknown',
  });

  try {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const parsed: unknown = JSON.parse(fenced?.[1] ?? trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return failClosed();
    const row = parsed as Record<string, unknown>;
    const result: Partial<NameplateData> = {};
    const textFields: Array<keyof Pick<NameplateData,
      'manufacturer' | 'model' | 'voltage' | 'current' | 'power' | 'frequency' |
      'serialNumber' | 'rating' | 'efficiency' | 'powerFactor' | 'rpm' |
      'insulation' | 'protection'>> = [
        'manufacturer', 'model', 'voltage', 'current', 'power', 'frequency',
        'serialNumber', 'rating', 'efficiency', 'powerFactor', 'rpm',
        'insulation', 'protection',
      ];
    for (const field of textFields) {
      const value = boundedVisionText(row[field], 512);
      if (value) result[field] = value;
    }

    const rawText = boundedVisionText(row.rawText, 20_000);
    if (rawText) result.rawText = rawText;
    if (row.phase === '1' || row.phase === '3') result.phase = row.phase;
    if (row.language === 'ko' || row.language === 'en' || row.language === 'ja' || row.language === 'zh') {
      result.language = row.language;
    } else {
      result.language = 'unknown';
    }
    result.confidence = typeof row.confidence === 'number' && Number.isFinite(row.confidence)
      ? Math.max(0, Math.min(1, row.confidence))
      : 0;
    return result;
  } catch {
    return failClosed();
  }
}

function boundedVisionText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}
