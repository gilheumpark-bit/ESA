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
export function parseElectricalParams(text: string): Partial<NameplateData> {
  const result: Partial<NameplateData> = {};
  const normalized = text.replace(/\s+/g, ' ');

  // 전압 (Voltage): 220V, 380V, 3.3kV, 6600V, etc.
  const voltagePatterns = [
    /(\d+(?:\.\d+)?)\s*(?:kV|KV)/i,
    /(?:voltage|전압|電圧|电压|rated\s*voltage)\s*[:\s]*(\d+(?:\.\d+)?)\s*(?:V|kV)/i,
    /(\d{2,5})\s*\/\s*(\d{2,5})\s*V/i,
    /(\d+(?:\.\d+)?)\s*V(?:\s|$|,)/i,
  ];

  for (const pattern of voltagePatterns) {
    const m = normalized.match(pattern);
    if (m) {
      if (pattern.source.includes('kV|KV') && m[1]) {
        result.voltage = `${m[1]}kV`;
      } else if (m[2]) {
        result.voltage = `${m[1]}/${m[2]}V`;
      } else if (m[1]) {
        result.voltage = `${m[1]}V`;
      }
      break;
    }
  }

  // 전류 (Current): 10A, 100A, 1.5kA
  const currentPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:kA)/i,
    /(?:current|전류|電流|电流|rated\s*current|정격전류)\s*[:\s]*(\d+(?:\.\d+)?)\s*A/i,
    /(\d+(?:\.\d+)?)\s*A(?:\s|$|,)/i,
  ];

  for (const pattern of currentPatterns) {
    const m = normalized.match(pattern);
    if (m) {
      if (pattern.source.includes('kA') && m[1]) {
        result.current = `${m[1]}kA`;
      } else {
        const val = m[2] ?? m[1];
        if (val) result.current = `${val}A`;
      }
      break;
    }
  }

  // 전력 (Power): 5kW, 100W, 50kVA, 1MVA
  const powerPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:MVA)/i,
    /(\d+(?:\.\d+)?)\s*(?:kVA)/i,
    /(\d+(?:\.\d+)?)\s*(?:kW|KW)/i,
    /(?:power|전력|출력|電力|功率|rated\s*power|정격출력)\s*[:\s]*(\d+(?:\.\d+)?)\s*(?:kW|W|kVA|MVA)/i,
    /(\d+(?:\.\d+)?)\s*W(?:\s|$|,)/i,
  ];

  for (const pattern of powerPatterns) {
    const m = normalized.match(pattern);
    if (m) {
      const val = m[2] ?? m[1];
      if (val) {
        if (pattern.source.includes('MVA')) result.power = `${val}MVA`;
        else if (pattern.source.includes('kVA')) result.power = `${val}kVA`;
        else if (pattern.source.includes('kW|KW')) result.power = `${val}kW`;
        else result.power = `${val}W`;
      }
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
 * Supports: OpenAI (GPT-4V), Anthropic (Claude Vision), Google (Gemini Vision)
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
      responseText = await callGeminiVision(base64, mimeType, options);
      break;
    default:
      throw new Error(`[ESA-OCR] Unsupported vision provider: ${options.provider}. Use openai, claude, or gemini.`);
  }

  // Parse LLM response
  const parsed = parseVisionResponse(responseText);

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
    confidence: parsed.confidence ?? 0.5,
    language: parsed.language ?? detectLanguage(parsed.rawText || responseText),
  };
}

async function callOpenAIVision(
  base64: string,
  mimeType: string,
  options: NameplateOCROptions,
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'gpt-4.1',
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
      max_tokens: 2000,
      temperature: 0.1,
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
      model: options.model || 'claude-sonnet-4-20250514',
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

async function callGeminiVision(
  base64: string,
  mimeType: string,
  options: NameplateOCROptions,
): Promise<string> {
  const model = options.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${options.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    throw new Error(`[ESA-OCR] Gemini Vision error ${res.status}: ${err.slice(0, 200)}`);
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
    suggestions.push('motor-starting');
    suggestions.push('motor-load');
  }

  // 전력 데이터로 부하 계산
  if (nameplate.power) {
    suggestions.push('demand-factor');
    suggestions.push('load-calculation');
  }

  // kVA 정격 → 변압기 관련 계산
  if (nameplate.power?.includes('kVA') || nameplate.power?.includes('MVA')) {
    suggestions.push('transformer-sizing');
    suggestions.push('short-circuit');
  }

  // 3상 데이터
  if (nameplate.phase === '3' && nameplate.voltage && nameplate.current) {
    suggestions.push('three-phase-power');
  }

  // 역률 보상
  if (nameplate.powerFactor) {
    suggestions.push('power-factor-correction');
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

function parseVisionResponse(text: string): Partial<NameplateData> {
  // Try to extract JSON from response (LLM might wrap in markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { rawText: text, confidence: 0.3 };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed as Partial<NameplateData>;
  } catch {
    return { rawText: text, confidence: 0.3 };
  }
}
