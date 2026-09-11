/** FIFO concurrency shared by overlapping council phases, scoped to one run. */
export function createBoundedTaskPool(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 8) {
    throw new Error('Source task concurrency must be an integer from 1 to 8.');
  }
  let active = 0;
  const pending: Array<() => void> = [];
  const pump = (): void => {
    while (active < limit && pending.length > 0) {
      active += 1;
      pending.shift()!();
    }
  };
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending.push(() => {
          void (async () => operation())().then(resolve, reject).finally(() => {
            active -= 1;
            pump();
          });
        });
        pump();
      });
    },
  };
}
