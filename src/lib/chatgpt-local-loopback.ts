export function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  try {
    const hostname = new URL(`http://${host}`).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export function assertLoopbackRequest(request: Pick<Request, 'headers' | 'url'>): void {
  if (!isLoopbackHost(request.headers.get('host'))) {
    throw new Error('LOCAL_CHATGPT_NOT_AVAILABLE');
  }
}
