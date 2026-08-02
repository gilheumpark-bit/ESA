export type DisplayableSLDConnection = {
  from: string;
  to: string;
  flowDirection?: 'from_to' | 'to_from' | 'bidirectional' | 'unknown';
};

/** 저장 방향과 실제 전력 흐름 방향을 화면에서 혼동하지 않게 하는 순수 UI 계약. */
export function orderSLDConnectionEndpoints(
  connection: DisplayableSLDConnection,
): { from: string; to: string } {
  return connection.flowDirection === 'to_from'
    ? { from: connection.to, to: connection.from }
    : { from: connection.from, to: connection.to };
}
