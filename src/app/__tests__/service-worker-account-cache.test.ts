import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Runs the real public/sw.js against an in-memory Cache API. The caches are
// keyed by URL alone, so an account-bound response must never be stored.
type Listener = (event: Record<string, unknown>) => void;

function loadWorker(network: (request: Request) => Promise<Response>) {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, Response>>();
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (request: Request, response: Response) => { store.set(request.url, response); },
      match: async (request: Request) => store.get(request.url)?.clone(),
      addAll: async () => undefined,
    };
  };
  const caches = {
    open: async (name: string) => open(name),
    match: async (request: Request) => {
      for (const store of stores.values()) {
        const hit = store.get(request.url);
        if (hit) return hit.clone();
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const self = {
    location: { origin: 'https://esa.example' },
    addEventListener: (type: string, handler: Listener) => { listeners.set(type, handler); },
    skipWaiting: () => undefined,
    clients: { claim: () => undefined, openWindow: () => undefined },
    registration: { showNotification: () => undefined },
  };
  // No indexedDB in this context: the worker's IDB helpers must stay non-fatal.
  const context = vm.createContext({ self, caches, fetch: network, URL, Request, Response, Headers, console, Promise, JSON, Date });
  vm.runInContext(fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8'), context);
  return {
    stores,
    async fetch(request: Request): Promise<Response | undefined> {
      let responded: Promise<Response> | undefined;
      listeners.get('fetch')!({ request, respondWith: (value: Promise<Response>) => { responded = value; } });
      return responded ? await responded : undefined;
    },
    async activate() {
      let pending: Promise<unknown> = Promise.resolve();
      listeners.get('activate')!({ waitUntil: (value: Promise<unknown>) => { pending = value; } });
      await pending;
    },
  };
}

const url = 'https://esa.example/api/receipt/r1';
const json = (body: unknown, cacheControl: string) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheControl } });
const stored = (worker: ReturnType<typeof loadWorker>) =>
  [...worker.stores.values()].reduce((count, store) => count + store.size, 0);

describe('service worker account-bound responses', () => {
  test('a response fetched with Authorization is never stored or replayed offline', async () => {
    let online = true;
    const worker = loadWorker(async () => {
      if (!online) throw new TypeError('offline');
      return json({ owner: 'alice' }, 'public, max-age=60');
    });
    const response = await worker.fetch(new Request(url, { headers: { Authorization: 'Bearer alice-token' } }));
    expect(await response?.json()).toEqual({ owner: 'alice' });
    expect(stored(worker)).toBe(0);
    online = false;
    const offline = await worker.fetch(new Request(url));
    expect(offline?.status).toBe(503);
    expect(await offline?.json()).toEqual({ error: 'Offline', offline: true });
  });

  test.each(['private, no-store', 'private, max-age=300', 'no-store'])('a response marked "%s" is not stored', async (cacheControl) => {
    const worker = loadWorker(async () => json({ owner: 'alice' }, cacheControl));
    await worker.fetch(new Request('https://esa.example/api/calculate?page=1&pageSize=100'));
    expect(stored(worker)).toBe(0);
  });

  test('a shareable public response is still available offline', async () => {
    let online = true;
    const worker = loadWorker(async () => {
      if (!online) throw new TypeError('offline');
      return json({ items: ['KEC 232'] }, 'public, max-age=120');
    });
    await worker.fetch(new Request('https://esa.example/api/autocomplete?q=KEC'));
    expect(stored(worker)).toBe(1);
    online = false;
    const offline = await worker.fetch(new Request('https://esa.example/api/autocomplete?q=KEC'));
    expect(await offline?.json()).toEqual({ items: ['KEC 232'] });
  });

  test('activation drops caches written by earlier versions', async () => {
    const worker = loadWorker(async () => json({}, 'public, max-age=60'));
    const legacy = new Map([[url, json({ owner: 'alice' }, 'private, max-age=300')]]);
    worker.stores.set('esa-v4-api', legacy);
    await worker.activate();
    expect(worker.stores.has('esa-v4-api')).toBe(false);
  });
});
