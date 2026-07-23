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
  /** 병렬 다조 수(예: 2 = "150sq x 2") — 허용전류 판정 시 조수배(버그 사냥 F5) */
  parallelCount?: number;
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
  /** Parser-originated text anchors in the same coordinate space as components. */
  sourceTexts?: Array<{ text: string; position: { x: number; y: number }; confidence: number }>;
  suggestedCalculations: CalcSuggestion[];
  systemVoltage?: string;
  systemType?: string;
  confidence: number;
  /** True when a syntactically truncated model response was only partially recovered. */
  partial?: boolean;
  /** Machine-readable analysis warnings that must remain visible to downstream review. */
  warnings?: string[];
  /** 케이블 스케줄 표(중급) — 표 문서에서 행 단위 피더 데이터. 검토 입력원. */
  scheduleTables?: Array<{
    title: string;
    columns: Array<{ name: string; xStart: number; xEnd: number }>;
    rows: Array<{ cells: Record<string, string> }>;
  }>;
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
- Position x/y must be numeric values from 0 to 100 relative to the current image
- Include length only when a numeric value and unit are explicitly printed on the drawing
- Never infer a physical length, rating, voltage, or conductor size from pixel spacing
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

/**
 * 절단된 VLM JSON을 복구한다(버그 사냥·라이브 검증 실측). 문자열 리터럴을
 * 무시하며 괄호 깊이를 추적해, 마지막으로 "완전한 값이 끝난 지점"까지 자르고
 * 열려 있는 `[`·`{`를 순서 반대로 닫는다. 완전 복구가 아니라 부분 판독 보존이
 * 목적 — 상세 도면이 토큰 한도를 넘겨 잘려도 0개 폐기 대신 앞부분을 살린다.
 */
export function salvageTruncatedJson(input: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastComplete = -1; // 컨테이너(객체/배열)가 완결로 닫힌 직후 인덱스만 안전
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { stack.pop(); lastComplete = i + 1; }
    // 문자열 닫힘·콤마는 안전 지점이 아니다(미완 객체 내부일 수 있음).
  }
  if (lastComplete <= 0) throw new Error('복구할 완전한 값이 없습니다.');
  // lastComplete까지의 깊이를 재계산해 그 지점에서 열린 괄호만 닫는다.
  let head = input.slice(0, lastComplete);
  const closeStack: string[] = [];
  let s = false, e = false;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (s) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') s = false; continue; }
    if (c === '"') s = true;
    else if (c === '{') closeStack.push('}');
    else if (c === '[') closeStack.push(']');
    else if (c === '}' || c === ']') closeStack.pop();
  }
  return head + closeStack.reverse().join('');
}

export function parseSLDResponse(text: string): SLDAnalysis {
  try {
    const trimmed = text.trim();
    // 견고 추출(라이브 VLM 검증 실측 수리): Gemini가 ```json 펜스로 감싸거나
    // 앞뒤에 설명 문장을 붙여 보내면 구 `^```...```$` 전체앵커가 실패해, VLM이
    // 도면을 옳게 읽고도(예: "Main Breaker 100AF/75AT") 결과가 통째로 버려졌다
    // (components 0·confidence 0). 펜스를 느슨히 벗기고 첫 '{'~마지막 '}'를
    // 뽑아 주변 텍스트·미완 펜스를 허용한다.
    let candidate = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidate = candidate.slice(firstBrace, lastBrace + 1);
    } else if (firstBrace >= 0) {
      candidate = candidate.slice(firstBrace);
    }
    let parsed: unknown;
    let partialRecovery = false;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      // 절단 복구(라이브 검증 실측): 상세 도면은 VLM JSON이 토큰 한도(8192)도
      // 넘겨 배열 중간에서 잘린다 — 마지막 완전한 요소까지 자르고 열린 괄호를
      // 닫아 부분 판독을 살린다(0개 폐기 < 부분 살림). 미국 배전 도면 실측.
      parsed = JSON.parse(salvageTruncatedJson(candidate));
      partialRecovery = true;
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('SLD 응답은 객체여야 합니다.');
    const data = parsed as Record<string, unknown>;
    // components만 필수. connections는 없으면 빈 배열로 본다(절단 복구·라이브
    // 검증 실측: 상세 도면은 components 배열 중간에서 잘려 connections 필드가
    // 통째로 없을 수 있는데, 이를 필수로 요구하면 살린 부분 판독마저 폐기됐다).
    if (!Array.isArray(data.components)) {
      throw new Error('SLD components는 배열이어야 합니다.');
    }
    const connectionRows: unknown[] = Array.isArray(data.connections) ? data.connections : [];

    const ids = new Set<string>();
    const components: SLDComponent[] = [];
    for (const row of data.components.slice(0, 2_000)) {
      if (!row || typeof row !== 'object') continue;
      const component = row as Record<string, unknown>;
      const id = boundedText(component.id, 128);
      const type = boundedText(component.type, 64);
      const position = component.position && typeof component.position === 'object'
        ? component.position as Record<string, unknown>
        : undefined;
      const x = finiteNumber(position?.x);
      const y = finiteNumber(position?.y);
      if (!id || ids.has(id) || !type || !SLD_COMPONENT_TYPES.has(type as SLDComponentType) ||
          x == null || y == null || x < 0 || x > 100 || y < 0 || y > 100) continue;
      ids.add(id);
      const properties = stringProperties(component.properties);
      components.push({
        id,
        type: type as SLDComponentType,
        position: { x, y },
        ...optionalTextField('label', component.label),
        ...optionalTextField('rating', component.rating),
        ...optionalTextField('voltage', component.voltage),
        ...optionalTextField('current', component.current),
        ...(properties ? { properties } : {}),
      });
    }

    const connectionIds = new Set<string>();
    const connections: SLDConnection[] = [];
    for (const row of connectionRows.slice(0, 5_000)) {
      if (!row || typeof row !== 'object') continue;
      const connection = row as Record<string, unknown>;
      const id = boundedText(connection.id, 128);
      const from = boundedText(connection.from, 128);
      const to = boundedText(connection.to, 128);
      if (!id || connectionIds.has(id) || !from || !to || from === to || !ids.has(from) || !ids.has(to)) continue;
      connectionIds.add(id);
      const rawLength = boundedText(connection.length, 64);
      const length = rawLength && /^\d+(?:\.\d+)?\s*(?:mm|cm|m|km|ft|in)$/i.test(rawLength)
        ? rawLength
        : undefined;
      connections.push({
        id,
        from,
        to,
        ...optionalTextField('cableType', connection.cableType),
        ...(length ? { length } : {}),
        ...optionalTextField('conductorSize', connection.conductorSize),
      });
    }

    const rawConfidence = finiteNumber(data.confidence) ?? 0.5;
    return {
      components,
      connections,
      suggestedCalculations: [],
      ...optionalTextField('systemVoltage', data.systemVoltage),
      ...optionalTextField('systemType', data.systemType),
      confidence: components.length > 0
        ? Math.max(0, Math.min(partialRecovery ? 0.5 : 1, rawConfidence))
        : 0,
      ...(partialRecovery ? {
        partial: true,
        warnings: ['TRUNCATED_MODEL_OUTPUT_PARTIAL_RECOVERY'],
      } : {}),
      rawDescription: boundedText(data.rawDescription, 2_000) ?? '',
    };
  } catch {
    return {
      components: [],
      connections: [],
      suggestedCalculations: [],
      confidence: 0,
      rawDescription: text.slice(0, 2_000),
    };
  }
}

const SLD_COMPONENT_TYPES = new Set<SLDComponentType>([
  'transformer', 'breaker', 'cable', 'bus', 'generator', 'motor', 'capacitor',
  'load', 'switch', 'relay', 'meter', 'panel', 'ups', 'mcc',
]);

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalTextField<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  const text = boundedText(value, 256);
  return text ? { [key]: text } as Partial<Record<K, string>> : {};
}

function stringProperties(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .slice(0, 50)
    .flatMap(([key, entryValue]) => {
      const safeKey = boundedText(key, 64);
      const safeValue = boundedText(entryValue, 256);
      return safeKey && safeValue ? [[safeKey, safeValue] as const] : [];
    });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
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
  // 동적 스텝 번호를 결박한다(버그 사냥 F7 수리): dependsOn을 [2]/[3]으로 하드코딩하면
  // load 단계가 없을 때 스텝 번호가 당겨져 단락전류·케이블 단계가 자기 자신을
  // 참조한다(재현: TR+cable, load 없음 → short-circuit step2 dependsOn[2]). 실제
  // 배정된 번호를 변수로 잡아 참조한다.
  let txStepNum: number | undefined;
  let scStepNum: number | undefined;

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
    txStepNum = stepNum++;
    steps.push({
      step: txStepNum,
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
    scStepNum = stepNum++;
    steps.push({
      step: scStepNum,
      calculatorId: 'short-circuit',
      inputs: {
        transformerRating: tx.rating,
        voltage: analysis.systemVoltage,
      },
      dependsOn: txStepNum !== undefined ? [txStepNum] : undefined,
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
      dependsOn: scStepNum !== undefined ? [scStepNum] : undefined,
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
      max_completion_tokens: 8192,
      ...(model.startsWith('gpt-5') ? {} : { temperature: 0.1 }),
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
      model: options.model || 'claude-sonnet-5',
      // 8192로 상향(라이브 검증 수리): 4000 토큰은 분전반 일람(차단기 30+·연결
      // 다수)의 JSON을 중간에 끊어 파싱 실패→결과 폐기를 유발했다. role-runner와 동일.
      max_tokens: 8192,
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
  const model = options.model || 'gemini-3.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': options.apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${SLD_SYSTEM_PROMPT}\n\nAnalyze this Single Line Diagram (SLD).` },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
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
