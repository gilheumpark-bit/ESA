import type { DrawingReasoningEffort } from '@/lib/drawing-reasoning-effort';

export interface ClaudeLocalModel {
  id: string;
  name: string;
  inputModalities: Array<'text' | 'image'>;
}

export interface ClaudeLocalStatus {
  available: boolean;
  connected: boolean;
  account?: {
    email: string | null;
    subscriptionType: string;
  };
  models: ClaudeLocalModel[];
  reason?: 'CLAUDE_NOT_FOUND' | 'NOT_LOGGED_IN' | 'PROTOCOL_ERROR';
}

export interface ClaudeLocalTurnParams {
  model: string;
  /** 역할 프롬프트. argv가 아니라 stdin으로 전달한다. */
  developerInstructions: string;
  image: {
    /** base64 원문. 호출부가 이미 base64로 들고 있어 재변환을 만들지 않는다. */
    base64: string;
    mimeType: string;
  };
  /** 역할별 JSON Schema. 프롬프트 안에 계약으로 싣는다. */
  outputSchema?: unknown;
  effort?: DrawingReasoningEffort;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ClaudeLocalTurnResult {
  text: string;
  model: string;
  durationMs: number;
}

// IDENTITY_SEAL: lib/claude-local-contract | role=로컬 Claude CLI 공급자 계약 | inputs=역할 프롬프트·이미지·스키마 | outputs=상태·턴 결과
