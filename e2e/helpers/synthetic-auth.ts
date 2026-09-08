import { expect, type Page } from '@playwright/test';

export const UI_USER = 'ui-only-frontend-audit';
export const UI_EMAIL = 'frontend-audit@example.invalid';

/**
 * Browser UI fixture only. The token has no valid signature and cannot authorize
 * a real server. All API calls are intercepted by default, and external network
 * traffic is blocked. Production authentication code and policies are unchanged.
 */
export async function syntheticAuth(page: Page, tier = 'team') {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'dummy';
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'dummy';
  const now = Math.floor(Date.now() / 1000);
  const token = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({
    sub: UI_USER, user_id: UI_USER, aud: project, iss: `https://securetoken.google.com/${project}`,
    iat: now, exp: now + 3600, auth_time: now, email: UI_EMAIL, email_verified: true,
    firebase: { sign_in_provider: 'google.com', identities: { email: [UI_EMAIL] } },
  })).toString('base64url')}.UI_TEST_INVALID_SIGNATURE`;
  await page.context().route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{
        localId: UI_USER, email: UI_EMAIL, emailVerified: true, displayName: 'UI 검증 사용자',
        providerUserInfo: [{ providerId: 'google.com', rawId: UI_USER, email: UI_EMAIL }],
        createdAt: String(Date.now() - 10000), lastLoginAt: String(Date.now()),
      }] }) });
    }
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) return route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: '합성 UI 검사에서 연결하지 않은 서비스입니다.' } }),
    });
    return route.continue();
  });
  await page.route('**/api/account/tier', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { tier } }) }));
  await page.goto('/login');
  await page.evaluate(async ({ apiKey, token, uid, email }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('firebaseLocalStorageDb', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('firebaseLocalStorage')) request.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('firebaseLocalStorage', 'readwrite');
      tx.objectStore('firebaseLocalStorage').put({
        fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`,
        value: {
          uid, email, emailVerified: true, displayName: 'UI 검증 사용자', isAnonymous: false,
          providerData: [{ providerId: 'google.com', uid, email, displayName: 'UI 검증 사용자', photoURL: null }],
          stsTokenManager: { refreshToken: 'UI_TEST_NOT_A_SECRET', accessToken: token, expirationTime: Date.now() + 3600000 },
          createdAt: String(Date.now() - 10000), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
        },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { apiKey, token, uid: UI_USER, email: UI_EMAIL });
  await page.goto('/settings');
  await expect(page.getByText(UI_EMAIL, { exact: true }).first()).toBeVisible();
}
