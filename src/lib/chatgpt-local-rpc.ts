/** Untrusted app-server JSONL boundaries. Limits apply before retaining data. */
export const LOCAL_RPC_LIMITS = Object.freeze({
  frameBytes: 1024 * 1024,
  turnBytes: 8 * 1024 * 1024,
  backlogBytes: 1024 * 1024,
  backlogMessages: 100,
});

export interface RpcResponse {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: Record<string, unknown>;
}

export function isRpcRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isRpcIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

/** Unknown notification methods remain forward compatible, but known messages
 * must satisfy the fields we actually dereference. Never coerce malformed data. */
export function isRpcResponse(value: unknown): value is RpcResponse {
  if (!isRpcRecord(value)) return false;
  if (value.jsonrpc !== undefined && value.jsonrpc !== '2.0') return false;
  if ('id' in value && !(Number.isSafeInteger(value.id) || isRpcIdentifier(value.id))) return false;
  if ('method' in value) {
    if (!isRpcIdentifier(value.method) || 'result' in value || 'error' in value) return false;
    if (value.params !== undefined && !isRpcRecord(value.params)) return false;
    const params = value.params;
    if (params === undefined) {
      return !['item/agentMessage/delta', 'item/started', 'item/completed', 'turn/completed'].includes(value.method);
    }
    for (const key of ['threadId', 'turnId']) {
      if (key in params && !isRpcIdentifier(params[key])) return false;
    }
    if ('turn' in params && (!isRpcRecord(params.turn) || !isRpcIdentifier(params.turn.id))) return false;
    if (isRpcRecord(params.turn) && params.turnId !== undefined && params.turn.id !== params.turnId) return false;
    if (value.method === 'item/agentMessage/delta') {
      return isRpcIdentifier(params.turnId) && typeof params.delta === 'string';
    }
    if (value.method === 'item/started' || value.method === 'item/completed') {
      return isRpcIdentifier(params.turnId) && isRpcRecord(params.item) && isRpcIdentifier(params.item.type);
    }
    if (value.method === 'turn/completed') {
      if (!isRpcRecord(params.turn) || typeof params.turn.status !== 'string') return false;
      if (params.turn.items !== undefined && (!Array.isArray(params.turn.items)
        || !params.turn.items.every((item) => isRpcRecord(item) && typeof item.type === 'string'))) return false;
    }
    return true;
  }
  if (!Number.isSafeInteger(value.id)) return false;
  // A response has exactly one result/error. A null result is valid for void RPCs.
  if (('result' in value) === ('error' in value)) return false;
  return !('error' in value) || isRpcRecord(value.error);
}

export function rpcTurnId(message: RpcResponse): string | null {
  const params = message.params;
  if (isRpcIdentifier(params?.turnId)) return params.turnId;
  return isRpcRecord(params?.turn) && isRpcIdentifier(params.turn.id) ? params.turn.id : null;
}

export function hasStartId(value: unknown, key: 'thread' | 'turn'): value is Record<string, { id: string }> {
  if (!isRpcRecord(value)) return false;
  const item = value[key];
  return isRpcRecord(item) && isRpcIdentifier(item.id);
}
