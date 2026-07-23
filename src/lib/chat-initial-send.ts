interface BooleanRef {
  current: boolean;
}

/** Schedule the initial chat query without losing it to React Strict Mode cleanup. */
export function scheduleInitialChatSend(
  query: string,
  sentRef: BooleanRef,
  send: (text: string) => void | Promise<void>,
): () => void {
  if (!query.trim() || sentRef.current) return () => undefined;

  const timer = setTimeout(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    void send(query);
  }, 0);

  return () => clearTimeout(timer);
}
