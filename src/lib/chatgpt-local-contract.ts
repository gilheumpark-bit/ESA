export interface ChatGPTLocalModel {
  id: string;
  name: string;
  inputModalities: Array<'text' | 'image'>;
}

export interface ChatGPTLocalStatus {
  available: boolean;
  connected: boolean;
  account?: {
    email: string | null;
    planType: string;
  };
  models: ChatGPTLocalModel[];
  reason?: 'CODEX_NOT_FOUND' | 'NOT_LOGGED_IN' | 'PROTOCOL_ERROR';
}
