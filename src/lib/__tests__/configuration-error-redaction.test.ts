import { getFirebaseApp } from '../firebase';
import { resolveProviderKey } from '../server-ai';
import { getSupabaseClient } from '../supabase';

const ENV_NAMES = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'OPENAI_API_KEY',
] as const;

const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of ENV_NAMES) delete process.env[name];
});

afterAll(() => {
  for (const name of ENV_NAMES) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('configuration error redaction', () => {
  test('Firebase client error does not reveal deployment variable names', async () => {
    await expect(getFirebaseApp()).rejects.not.toThrow(/NEXT_PUBLIC_|FIREBASE_API_KEY/);
  });

  test('Supabase client error does not reveal deployment variable names', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => getSupabaseClient()).toThrow();
    expect(() => getSupabaseClient()).not.toThrow(/NEXT_PUBLIC_|SUPABASE_/);
  });

  test('AI key error identifies the provider without exposing the server variable name', () => {
    expect(() => resolveProviderKey('openai')).toThrow(/OpenAI/);
    expect(() => resolveProviderKey('openai')).not.toThrow(/OPENAI_API_KEY|environment variable/);
  });
});
