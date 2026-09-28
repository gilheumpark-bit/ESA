/** Runs the production calculator hook and receipt page effects without external
 * auth or network services. React scheduling is a narrow test harness; browser
 * QA is a separate gate. Restored from the unmerged 2026-09-08 PR #71 review
 * (archived commit c048dd5) and adapted to the current owner rule.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

// PART 1 — isolated module and effect runner
const root = process.cwd();
const require = createRequire(import.meta.url);
function harness({ uid = null, status = 404, deferFetch = false } = {}) {
  const storage = new Map();
  const effects = [], state = [], fetches = [];
  const modules = new Map();
  const references = new Map(), effectSlots = new Map(), responses = [];
  let cursor = 0;
  const auth = { user: uid ? { uid } : null, loading: false };
  const react = {
    use: () => ({ id: 'item' }), useParams: () => ({ id: 'item' }), useSearchParams: () => new URLSearchParams(),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const prior = effectSlots.get(index);
      if (!prior || !deps || deps.some((value, i) => value !== prior.deps?.[i])) effects.push(() => {
        prior?.cleanup?.();
        effectSlots.set(index, { effect, deps, cleanup: effect() });
      });
    },
    useCallback: (value) => { cursor++; return value; },
    useRef(value) {
      const index = cursor++;
      if (!references.has(index)) references.set(index, { current: value });
      return references.get(index);
    },
    createContext: () => ({ Provider: 'Provider' }),
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const context = vm.createContext({
    console, Headers, AbortController, URL, URLSearchParams, Promise, atob,
    process: { env: { NODE_ENV: 'test' } },
    window: {}, sessionStorage: {
      setItem: (key, value) => storage.set(key, value), getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
    },
    fetch: async (url, init) => {
      fetches.push({ url, init });
      if (deferFetch) await new Promise((resolve) => responses.push(resolve));
      return { ok: status === 200, status, json: async () => ({ data: {
        result: { value: 1, unit: 'A' }, receipt: { id: 'item', ...(auth.user ? { userId: auth.user.uid } : {}) },
      } }) };
    },
  });
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative).exports;
    const filename = path.join(root, relative);
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const compiledModule = { exports: {} };
    modules.set(relative, compiledModule);
    const localRequire = (id) => {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (id === 'next/navigation') return react;
      if (id === '@/contexts/AuthContext') return { useAuth: () => auth };
      if (id === '@/lib/firebase') return { getIdToken: async () => (auth.user ? 'test-token' : null) };
      if (id === '@/lib/tier-gate') return { OPEN_BETA: true, OPEN_BETA_TIER: 'pro' };
      if (id === '@/lib/feature-flags') return { isFeatureEnabled: () => false };
      if (id === '@/hooks/useSettings') return { readStoredCountry: () => 'KR', readStoredLanguage: () => 'ko' };
      if (id.startsWith('@/lib/')) return load(`src/${id.slice(2)}.ts`);
      if (id.startsWith('@/components/') || id === 'lucide-react' || id === 'next/link') {
        return new Proxy({ __esModule: true }, { get: (target, key) => (key in target ? target[key] : `${id}:${String(key)}`) });
      }
      return require(id);
    };
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, { filename })(localRequire, compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  return { load, storage, state, fetches, auth,
    render(callback) { cursor = 0; return callback(); },
    respond(index) { responses[index](); },
    replayEffects() {
      for (const slot of effectSlots.values()) { slot.cleanup?.(); slot.cleanup = slot.effect(); }
    },
    async flush() {
      for (const effect of effects.splice(0)) effect();
      for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

// PART 2 — calculator request identity and account switching
test('calculator A -> logout -> A clears the cancelled request and an old completion cannot clear a newer one', async () => {
  const h = harness({ uid: 'alice', status: 200, deferFetch: true });
  const { useCalculator } = h.load('src/hooks/useCalculator.ts');
  const render = () => h.render(() => useCalculator('voltage-drop'));
  let hook = render();
  await h.flush();
  const oldRequest = hook.execute({ length: 10 });
  await h.flush();
  assert.equal(render().isLoading, true);
  h.auth.user = null;
  render(); await h.flush();
  assert.equal(h.fetches[0].init.signal.aborted, true);
  h.auth.user = { uid: 'alice' };
  render(); await h.flush();
  hook = render();
  assert.equal(hook.isLoading, false);
  assert.equal(hook.result, null);
  assert.equal(hook.receipt, null);
  assert.equal(hook.error, null);
  const newRequest = hook.execute({ length: 20 });
  await h.flush();
  h.respond(0); await oldRequest;
  assert.equal(render().isLoading, true);
  h.respond(1); await newRequest;
  assert.equal(render().isLoading, false);
  assert.equal(render().result.value, 1);
});

test('StrictMode cleanup/setup cannot let an aborted request reset its replacement', async () => {
  const h = harness({ uid: 'alice', status: 200, deferFetch: true });
  const { useCalculator } = h.load('src/hooks/useCalculator.ts');
  const render = () => h.render(() => useCalculator('voltage-drop'));
  let hook = render(); await h.flush();
  const first = hook.execute({ length: 10 }); await h.flush();
  h.replayEffects();
  hook = render();
  assert.equal(hook.isLoading, false);
  const second = hook.execute({ length: 20 }); await h.flush();
  h.respond(0); await first;
  assert.equal(render().isLoading, true);
  h.respond(1); await second;
  assert.equal(render().isLoading, false);
  assert.equal(render().receipt.id, 'item');
});

test('a request made while auth is loading waits and then runs under the settled account', async () => {
  // InlineCalcResult executes exactly once on mount; dropping this call would
  // leave the inline calculation permanently unexecuted.
  const h = harness({ uid: 'alice', status: 200 });
  h.auth.loading = true;
  const { useCalculator } = h.load('src/hooks/useCalculator.ts');
  const render = () => h.render(() => useCalculator('voltage-drop'));
  render(); await h.flush();
  await render().execute({ length: 10 });
  await h.flush();
  assert.equal(h.fetches.length, 0);
  assert.equal(render().isLoading, true);
  h.auth.loading = false;
  render(); await h.flush();
  assert.equal(h.fetches.length, 1);
  assert.equal(new Headers(h.fetches[0].init.headers).get('Authorization'), 'Bearer test-token');
  render(); await h.flush();
  const hook = render();
  assert.equal(hook.isLoading, false);
  assert.equal(hook.result.value, 1);
});

test('calculator forwards the optional bearer and anonymous calculation stays usable', async () => {
  for (const uid of [null, 'alice']) {
    const h = harness({ uid, status: 200 });
    const hook = h.load('src/hooks/useCalculator.ts').useCalculator('voltage-drop');
    await hook.execute({ length: 10 });
    assert.equal(h.fetches[0].url, '/api/calculate');
    assert.equal(new Headers(h.fetches[0].init.headers).get('Authorization'), uid ? 'Bearer test-token' : null);
    assert.equal(h.load('src/lib/receipt-cache.ts').getCachedReceipt('item', uid)?.id, 'item');
  }
});

// PART 3 — receipt page denial and identity
test('401 and 403 never reveal a cached receipt and invalidate the denied copy', async () => {
  for (const status of [401, 403]) {
    const h = harness({ status });
    const cache = h.load('src/lib/receipt-cache.ts');
    cache.cacheReceipt({ id: 'item' }, null);
    const Page = h.load('src/app/(with-nav)/receipt/[id]/page.tsx').default;
    const element = Page({ params: Promise.resolve({ id: 'item' }) });
    if (typeof element.type === 'function') element.type(element.props);
    await h.flush();
    assert.equal(cache.getCachedReceipt('item', null), null);
    assert.equal(h.state.some((value) => value && typeof value === 'object' && value.id === 'item'), false);
    assert.ok(h.state.some((value) => typeof value === 'string' && /로그인|권한/.test(value)));
  }
});

test('receipt view identity changes immediately on account switch', () => {
  const h = harness({ uid: 'alice' });
  const Page = h.load('src/app/(with-nav)/receipt/[id]/page.tsx').default;
  const before = Page({ params: Promise.resolve({ id: 'item' }) });
  h.auth.user = { uid: 'bob' };
  const after = Page({ params: Promise.resolve({ id: 'item' }) });
  assert.notEqual(before.key, after.key);
});
