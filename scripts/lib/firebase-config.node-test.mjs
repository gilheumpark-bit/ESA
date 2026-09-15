import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Load actual production modules in isolated CommonJS realms. Invalid config
// must fail before importing any SDK; no Firebase service or key is used here.
const modules = Object.fromEntries(['firebase-client-config', 'firebase', 'security-headers'].map((name) => [name,
  ts.transpileModule(readFileSync(new URL(`../../src/lib/${name}.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText]));
const valid = { apiKey: 'synthetic-key', projectId: 'fixture', authDomain: 'fixture.firebaseapp.com' };
function load(env = {}, sdk) {
  const cache = new Map();
  const get = (name) => {
    name = name.replace(/^\.\//, '');
    if (name === 'firebase/app' && sdk) return sdk;
    assert.ok(name in modules, `Unexpected SDK import: ${name}`);
    if (cache.has(name)) return cache.get(name).exports;
    const loadedModule = { exports: {} }; cache.set(name, loadedModule);
    vm.runInNewContext(`(function(require,module,exports,process){${modules[name]}\n})`)(get, loadedModule, loadedModule.exports, { env });
    return loadedModule.exports;
  };
  return get;
}
const config = load()('firebase-client-config');
const csp = load()('security-headers');
const directive = (policy, key) => policy.split('; ').find((value) => value.startsWith(`${key} `));
for (const key of ['apiKey', 'authDomain', 'projectId']) {
  for (const value of ['', '   ', 'dummy', 'NULL', 'your-project-value']) test(`missing/placeholder ${key} cannot initialize auth: ${JSON.stringify(value)}`, () => {
    const input = { ...valid, [key]: value };
    assert.equal(config.hasFirebaseClientConfig(input), false);
    const policy = csp.buildContentSecurityPolicy(true, input);
    assert.ok(!directive(policy, 'script-src').includes('apis.google.com'));
    assert.ok(!directive(policy, 'frame-src').includes('firebaseapp.com'));
  });
}
for (const domain of ['https://auth.example.com', 'auth.example.com/path', 'auth.example.com:443', '*.firebaseapp.com',
  'a.com; script-src *', 'a.com\nX-Injected: true', 'user@a.com', 'a..com', '-a.com', 'a.com ']) {
  test(`authDomain cannot inject a URL/CSP expression: ${JSON.stringify(domain)}`, () => {
    assert.equal(config.firebaseAuthOrigin(domain), null);
    assert.equal(config.hasFirebaseClientConfig({ ...valid, authDomain: domain }), false);
  });
}
for (const domain of ['fixture.firebaseapp.com', 'login.company.example', 'XN--BCHER-KVA.example']) test(`exact DNS auth domain is supported: ${domain}`, () => {
  assert.equal(config.hasFirebaseClientConfig({ ...valid, authDomain: domain }), true);
  assert.equal(config.firebaseAuthOrigin(domain), `https://${domain.toLowerCase()}`);
});
test('configured auth permits only the necessary exact script origin and iframe path', () => {
  const policy = csp.buildContentSecurityPolicy(true, valid);
  assert.equal(directive(policy, 'script-src'), "script-src 'self' 'unsafe-inline' https://apis.google.com");
  assert.equal(directive(policy, 'frame-src'), "frame-src 'self' https://js.stripe.com https://fixture.firebaseapp.com/__/auth/");
  assert.ok(!directive(policy, 'script-src').includes("'unsafe-eval'"));
  assert.ok(policy.includes("frame-ancestors 'none'")); assert.ok(policy.includes("object-src 'none'"));
});
test('custom auth domain does not permit every Firebase tenant', () => {
  const policy = csp.buildContentSecurityPolicy(true, { ...valid, authDomain: 'login.company.example' });
  assert.ok(directive(policy, 'frame-src').includes('https://login.company.example/__/auth/'));
  assert.ok(!directive(policy, 'frame-src').includes('firebaseapp.com'));
});
test('configured development retains existing eval behavior without leaking it to production', () => {
  assert.ok(directive(csp.buildContentSecurityPolicy(false, valid), 'script-src').includes("'unsafe-eval'"));
  assert.ok(!directive(csp.buildContentSecurityPolicy(true, valid), 'script-src').includes("'unsafe-eval'"));
});
test('literal CI dummy values fail before the SDK is imported', async () => {
  const firebase = load({ NEXT_PUBLIC_FIREBASE_API_KEY: 'dummy', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'dummy', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'dummy' })('firebase');
  await assert.rejects(firebase.getFirebaseApp(), /배포 관리자에게 인증 구성을 확인/);
});
test('present config is passed to the SDK, not treated as user authentication', async () => {
  let calls = 0;
  const sdk = { getApps: () => [], initializeApp: (options) => { calls++; assert.equal(options.authDomain, valid.authDomain); return { synthetic: true }; } };
  const firebase = load({ NEXT_PUBLIC_FIREBASE_API_KEY: valid.apiKey, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: valid.authDomain,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: valid.projectId }, sdk)('firebase');
  const app = await firebase.getFirebaseApp(); assert.equal(app.synthetic, true); assert.equal(calls, 1);
  assert.equal(await firebase.getFirebaseApp(), app); assert.equal(calls, 1);
});
