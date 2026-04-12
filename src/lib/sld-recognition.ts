/**
 * ESVA Single Line Diagram (SLD) AI Recognition
 * -----------------------------------------------
 * Vision LLM-based SLD analysis: component extraction,
 * connection mapping, and automatic calculation chain generation.
 *
 * PART 1: Types
 * PART 2: Vision LLM SLD analysis
 * PART 3: Calculation chain generation
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export type SLDComponentType =
  | 'transformer'
  | 'breaker'
  | 'cable'
  | 'bus'
  | 'generator'
  | 'motor'
  | 'capacitor'
  | 'load'
  | 'switch'
  | 'relay'
  | 'meter'
  | 'panel'
  | 'ups'
  | 'mcc';

export interface SLDComponent {
  id: string;
  type: SLDComponentType;
  label?: string;
  rating?: string;
  voltage?: string;
  current?: string;
  position: { x: number; y: number };
  properties?: Record<string, string>;
}

export interface SLDConnection {
  id: string;
  from: string;
  to: string;
  cableType?: string;
  length?: string;
  conductorSize?: string;
}

export interface CalcSuggestion {
  calculatorId: string;
  inputs: Partial<Record<string, unknown>>;
  reason: string;
  priority: number;
}

export interface SLDAnalysis {
  components: SLDComponent[];
  connections: SLDConnection[];
  suggestedCalculations: CalcSuggestion[];
  systemVoltage?: string;
  systemType?: string;
  confidence: number;
  rawDescription: string;
}

export interface CalcChainStep {
  step: number;
  calculatorId: string;
  inputs: Partial<Record<string, unknown>>;
  dependsOn?: number[];
  description: string;
}

export interface SLDAnalysisOptions {
  provider: string;
  model: string;
  apiKey: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Vision LLM SLD Analysis
// ═══════════════════════════════════════════════════════════════════════════════

const SLD_SYSTEM_PROMPT = `You are an expert electrical engineer analyzing Single Line Diagrams (SLD).
Analyze the SLD image and extract:
1. All components (transformers, breakers, cables, buses, generators, motors, capacitors, loads, etc.)
2. All connections between components
3. System voltage levels and type (single/three phase)

Return ONLY valid JSON with this structure:
{
  "components": [
    {
      "id": "comp_1",
      "type": "transformer|breaker|cable|bus|generator|motor|capacitor|load|switch|relay|meter|panel|ups|mcc",
      "label": "string or null",
      "rating": "string or null (e.g. 1000kVA, 100A)",
      "voltage": "string or null (e.g. 22.9kV, 380V)",
      "current": "string or null",
      "position": { "x": 0-100, "y": 0-100 },
      "properties": {}
    }
  ],
  "connections": [
    {
      "id": "conn_1",
      "from": "comp_1",
      "to": "comp_2",
      "cableType": "string or null (e.g. XLPE, CV)",
      "length": "string or null (e.g. 50m)",
      "conductorSize": "string or null (e.g. 185sq)"
    }
  ],
  "systemVoltage": "main voltage level",
  "systemType": "3-phase 4-wire / 3-phase 3-wire / single-phase",
  "confidence": 0.0-1.0,
  "rawDescription": "brief text description of the SLD"
}
Return ONLY valid JSON. No markdown, no explanation.`;

/**
 * Vision LLM을 사용한 단선도(SLD) 분석
 */
export async function analyzeSLD(
  imageData: string | Blob,
  options: SLDAnalysisOptions,
): Promise<SLDAnalysis> {
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
      throw new Error(`[ESA-SLD] Unsupported vision provider: ${options.provider}. Use openai, claude, or gemini.`);
  }

  const parsed = parseSLDResponse(responseText);
  const suggestions = generateSuggestions(parsed);

  return {
    ...parsed,
    suggestedCalculations: suggestions,
  };
}

function parseSLDResponse(text: string): SLDAnalysis {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      components: [],
      connections: [],
      suggestedCalculations: [],
      confidence: 0.2,
      rawDescription: text,
    };
  }

  try {
    const data = JSON.parse(jsonMatch[0]);
    return {
      components: (data.components ?? []) as SLDComponent[],
      connections: (data.connections ?? []) as SLDConnection[],
      suggestedCalculations: [],
      systemVoltage: data.systemVoltage,
      systemType: data.systemType,
      confidence: data.confidence ?? 0.5,
      rawDescription: data.rawDescription ?? '',
    };
  } catch {
    return {
      components: [],
      connections: [],
      suggestedCalculations: [],
      confidence: 0.2,
      rawDescription: text,
    };
  }
}

function generateSuggestions(analysis: SLDAnalysis): CalcSuggestion[] {
  const suggestions: CalcSuggestion[] = [];
  const { components, connections } = analysis;

  // 변압기가 있으면 단락전류 계산 추천
  const transformers = components.filter(c => c.type === 'transformer');
  for (const tx of transformers) {
    suggestions.push({
      calculatorId: 'short-circuit',
      inputs: {
        transformerRating: tx.rating,
        primaryVoltage: tx.voltage,
      },
      reason: `변압기 ${tx.label ?? tx.id} 단락전류 계산`,
      priority: 1,
    });

    suggestions.push({
      calculatorId: 'transformer-sizing',
      inputs: { rating: tx.rating, voltage: tx.voltage },
      reason: `변압기 ${tx.label ?? tx.id} 용량 검증`,
      priority: 2,
    });
  }

  // 케이블 연결이 있으면 전압강하 계산
  const cablesWithLength = connections.filter(c => c.length);
  for (const cable of cablesWithLength) {
    const fromComp = components.find(c => c.id === cable.from);
    const toComp = components.find(c => c.id === cable.to);

    suggestions.push({
      calculatorId: 'voltage-drop',
      inputs: {
        cableType: cable.cableType,
        length: cable.length,
        conductorSize: cable.conductorSize,
        voltage: fromComp?.voltage ?? toComp?.voltage,
        current: toComp?.current,
      },
      reason: `${fromComp?.label ?? cable.from} → ${toComp?.label ?? cable.to} 전압강하`,
      priority: 1,
    });

    suggestions.push({
      calculatorId: 'cable-sizing',
      inputs: {
        current: toComp?.current,
        length: cable.length,
        voltage: fromComp?.voltage,
      },
      reason: `${fromComp?.label ?? cable.from} → ${toComp?.label ?? cable.to} 케이블 사이즈 선정`,
      priority: 2,
    });
  }

  // 차단기 → 보호협조 / 차단기 선정
  const breakers = components.filter(c => c.type === 'breaker');
  for (const brk of breakers) {
    suggestions.push({
      calculatorId: 'breaker-sizing',
      inputs: {
        current: brk.current ?? brk.rating,
        voltage: brk.voltage,
      },
      reason: `차단기 ${brk.label ?? brk.id} 선정 검증`,
      priority: 2,
    });
  }

  // 모터 → 모터 기동 계산
  const motors = components.filter(c => c.type === 'motor');
  for (const motor of motors) {
    suggestions.push({
      calculatorId: 'motor-starting',
      inputs: {
        power: motor.rating,
        voltage: motor.voltage,
      },
      reason: `모터 ${motor.label ?? motor.id} 기동전류 계산`,
      priority: 1,
    });
  }

  // 콘덴서 → 역률보상 계산
  const caps = components.filter(c => c.type === 'capacitor');
  if (caps.length > 0) {
    suggestions.push({
      calculatorId: 'power-factor-correction',
      inputs: {
        capacitorRating: caps[0]?.rating,
      },
      reason: '역률보상 계산',
      priority: 3,
    });
  }

  // 부하 계산
  const loads = components.filter(c => c.type === 'load');
  if (loads.length > 0) {
    suggestions.push({
      calculatorId: 'demand-factor',
      inputs: {
        totalLoads: loads.length,
        loadRatings: loads.map(l => l.rating).filter(Boolean),
      },
      reason: `${loads.length}개 부하 수용률 계산`,
      priority: 2,
    });
  }

  // Sort by priority
  return suggestions.sort((a, b) => a.priority - b.priority);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Calculation Chain Generation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SLD 분석 결과로부터 자동 계산 워크플로우 생성
 * 전력 계통 순서대로 계산 체인 구성:
 * 1. 부하 계산 → 2. 변압기 용량 → 3. 단락전류 → 4. 케이블 사이즈 → 5. 전압강하 → 6. 차단기 선정
 */
export function generateCalcChainFromSLD(analysis: SLDAnalysis): CalcChainStep[] {
  const steps: CalcChainStep[] = [];
  let stepNum = 1;

  const { components, connections } = analysis;
  const hasTransformers = components.some(c => c.type === 'transformer');
  const hasCables = connections.some(c => c.length);
  const hasMotors = components.some(c => c.type === 'motor');
  const hasLoads = components.some(c => c.type === 'load');

  // Step 1: 부하 계산 (if loads exist)
  if (hasLoads) {
    const loads = components.filter(c => c.type === 'load');
    steps.push({
      step: stepNum++,
      calculatorId: 'load-calculation',
      inputs: {
        loads: loads.map(l => ({
          name: l.label,
          rating: l.rating,
          voltage: l.voltage,
        })),
      },
      description: '부하 계산 - 총 수전 용량 산정',
    });
  }

  // Step 2: 변압기 용량 검증
  if (hasTransformers) {
    const tx = components.find(c => c.type === 'transformer')!;
    steps.push({
      step: stepNum++,
      calculatorId: 'transformer-sizing',
      inputs: {
        rating: tx.rating,
        primaryVoltage: tx.voltage,
        systemType: analysis.systemType,
      },
      dependsOn: hasLoads ? [1] : undefined,
      description: `변압기 용량 검증 (${tx.label ?? tx.rating ?? '?'})`,
    });
  }

  // Step 3: 단락전류 계산
  if (hasTransformers) {
    const tx = components.find(c => c.type === 'transformer')!;
    const scStep = stepNum++;
    steps.push({
      step: scStep,
      calculatorId: 'short-circuit',
      inputs: {
        transformerRating: tx.rating,
        voltage: analysis.systemVoltage,
      },
      dependsOn: hasTransformers ? [2] : undefined,
      description: '단락전류 계산 - 차단기 선정 근거',
    });
  }

  // Step 4: 케이블 사이즈 선정
  if (hasCables) {
    const cable = connections.find(c => c.length)!;
    const toComp = components.find(c => c.id === cable.to);
    steps.push({
      step: stepNum++,
      calculatorId: 'cable-sizing',
      inputs: {
        current: toComp?.current,
        length: cable.length,
        voltage: analysis.systemVoltage,
      },
      dependsOn: hasTransformers ? [3] : undefined,
      description: '케이블 사이즈 선정',
    });
  }

  // Step 5: 전압강하 계산
  if (hasCables) {
    const cable = connections.find(c => c.length)!;
    steps.push({
      step: stepNum++,
      calculatorId: 'voltage-drop',
      inputs: {
        length: cable.length,
        cableType: cable.cableType,
        conductorSize: cable.conductorSize,
      },
      dependsOn: [stepNum - 2],
      description: '전압강하 검토',
    });
  }

  // Step 6: 모터 기동 계산
  if (hasMotors) {
    const motor = components.find(c => c.type === 'motor')!;
    steps.push({
      step: stepNum++,
      calculatorId: 'motor-starting',
      inputs: {
        power: motor.rating,
        voltage: motor.voltage,
      },
      description: `모터 기동전류 계산 (${motor.label ?? motor.rating ?? '?'})`,
    });
  }

  return steps;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal — Vision LLM Calls
// ═══════════════════════════════════════════════════════════════════════════════

async function callOpenAIVision(
  base64: string,
  mimeType: string,
  options: SLDAnalysisOptions,
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
        { role: 'system', content: SLD_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this Single Line Diagram (SLD) and extract all components and connections.' },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`[ESA-SLD] OpenAI Vision error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callClaudeVision(
  base64: string,
  mimeType: string,
  options: SLDAnalysisOptions,
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
      max_tokens: 4000,
      system: SLD_SYSTEM_PROMPT,
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
              text: 'Analyze this Single Line Diagram (SLD) and extract all components and connections.',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`[ESA-SLD] Claude Vision error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

async function callGeminiVision(
  base64: string,
  mimeType: string,
  options: SLDAnalysisOptions,
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
            { text: `${SLD_SYSTEM_PROMPT}\n\nAnalyze this Single Line Diagram (SLD).` },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`[ESA-SLD] Gemini Vision error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal — Helpers
// ═══════════════════════════════════════════════════════════════════════════════

async function toBase64(imageData: string | Blob): Promise<string> {
  if (typeof imageData === 'string') {
    if (imageData.startsWith('data:')) {
      return imageData.split(',')[1] ?? imageData;
    }
    return imageData;
  }

  const buffer = await imageData.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function detectMimeType(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lG')) return 'image/gif';
  if (base64.startsWith('UklG')) return 'image/webp';
  return 'image/jpeg';
}
