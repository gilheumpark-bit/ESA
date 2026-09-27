import { validateOnpremiseTarget } from './onpremise-policy';

/** Validate every SDK request; never follow redirects outside the selected origin. */
export function createOnpremiseFetch(baseUrl: string): typeof fetch {
  const origin = new URL(baseUrl).origin;
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const target = validateOnpremiseTarget(url);
    if (!target.ok || new URL(url).origin !== origin) throw new Error('ONPREMISE_TARGET_BLOCKED');
    return fetch(input, { ...init, redirect: 'error' });
  };
}
