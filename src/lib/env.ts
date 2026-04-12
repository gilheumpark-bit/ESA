/**
 * ESVA Centralized Environment Variable Validation
 * ─────────────────────────────────────────────────
 * Single source of truth for all env vars used across the project.
 * Validates at import time for build-time safety.
 *
 * PART 1: Types & helpers
 * PART 2: Environment variable groups
 * PART 3: getEnv / getOptionalEnv
 * PART 4: validateEnv()
 * PART 5: Typed config exports
 */

// ─── PART 1: Types & Helpers ────────────────────────────────────

interface EnvVarDef {
  key: string;
  required: boolean;
  fallback?: string;
}

type EnvGroup = Record<string, EnvVarDef[]>;

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env[key];
}

// ─── PART 2: Environment Variable Groups ────────────────────────

const AI_KEYS: EnvVarDef[] = [
  { key: 'OPENAI_API_KEY', required: false },
  { key: 'ANTHROPIC_API_KEY', required: false },
  { key: 'GOOGLE_GENERATIVE_AI_API_KEY', required: false },
  { key: 'DEEPSEEK_API_KEY', required: false },
  { key: 'MISTRAL_API_KEY', required: false },
];

const FIREBASE: EnvVarDef[] = [
  { key: 'NEXT_PUBLIC_FIREBASE_API_KEY', required: true },
  { key: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', required: true },
  { key: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', required: true },
  { key: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', required: false },
  { key: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', required: false },
  { key: 'NEXT_PUBLIC_FIREBASE_APP_ID', required: true },
  { key: 'FIREBASE_ADMIN_CLIENT_EMAIL', required: false },
  { key: 'FIREBASE_ADMIN_PRIVATE_KEY', required: false },
];

const SUPABASE: EnvVarDef[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', required: true },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', required: false },
];

const STRIPE: EnvVarDef[] = [
  { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', required: false },
  { key: 'STRIPE_SECRET_KEY', required: false },
  { key: 'STRIPE_WEBHOOK_SECRET', required: false },
];

const WEAVIATE: EnvVarDef[] = [
  { key: 'WEAVIATE_URL', required: false },
  { key: 'WEAVIATE_API_KEY', required: false },
];

const SENTRY: EnvVarDef[] = [
  { key: 'NEXT_PUBLIC_SENTRY_DSN', required: false },
  { key: 'SENTRY_AUTH_TOKEN', required: false },
];

const APP: EnvVarDef[] = [
  { key: 'NEXT_PUBLIC_APP_URL', required: false, fallback: 'http://localhost:3000' },
  { key: 'NEXT_PUBLIC_ALLOWED_ORIGINS', required: false },
  { key: 'NODE_ENV', required: false, fallback: 'development' },
  { key: 'LOG_LEVEL', required: false, fallback: 'info' },
];

export const ENV_GROUPS: EnvGroup = {
  AI_KEYS,
  FIREBASE,
  SUPABASE,
  STRIPE,
  WEAVIATE,
  SENTRY,
  APP,
};

const ALL_VARS: EnvVarDef[] = Object.values(ENV_GROUPS).flat();

// ─── PART 3: getEnv / getOptionalEnv ────────────────────────────

/**
 * Get a required environment variable. Throws if missing.
 */
export function getEnv(key: string): string {
  const value = readEnv(key);
  if (value !== undefined && value !== '') return value;

  // Check for a fallback in definitions
  const def = ALL_VARS.find((v) => v.key === key);
  if (def?.fallback !== undefined) return def.fallback;

  throw new Error(`[ESA-9001] Missing required environment variable: ${key}`);
}

/**
 * Get an optional environment variable with an optional fallback.
 */
export function getOptionalEnv(key: string, fallback?: string): string | undefined {
  const value = readEnv(key);
  if (value !== undefined && value !== '') return value;

  // Check definition-level fallback first
  const def = ALL_VARS.find((v) => v.key === key);
  if (def?.fallback !== undefined) return def.fallback;

  return fallback;
}

// ─── PART 4: validateEnv() ──────────────────────────────────────

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate all defined environment variables.
 * Returns missing required vars and warnings for optional ones.
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const varDef of ALL_VARS) {
    const value = readEnv(varDef.key);
    const hasValue = value !== undefined && value !== '';

    if (varDef.required && !hasValue && varDef.fallback === undefined) {
      missing.push(varDef.key);
    } else if (!varDef.required && !hasValue) {
      warnings.push(`Optional env var ${varDef.key} is not set`);
    }
  }

  // Check that at least one AI key is present
  const hasAnyAiKey = AI_KEYS.some((v) => {
    const val = readEnv(v.key);
    return val !== undefined && val !== '';
  });
  if (!hasAnyAiKey) {
    warnings.push('No AI API keys configured. BYOK users must supply their own keys.');
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

// ─── PART 5: Typed Config Exports ───────────────────────────────

export const FIREBASE_CONFIG = {
  apiKey: getOptionalEnv('NEXT_PUBLIC_FIREBASE_API_KEY') ?? '',
  authDomain: getOptionalEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN') ?? '',
  projectId: getOptionalEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID') ?? '',
  storageBucket: getOptionalEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET') ?? '',
  messagingSenderId: getOptionalEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') ?? '',
  appId: getOptionalEnv('NEXT_PUBLIC_FIREBASE_APP_ID') ?? '',
} as const;

export const SUPABASE_CONFIG = {
  url: getOptionalEnv('NEXT_PUBLIC_SUPABASE_URL') ?? '',
  anonKey: getOptionalEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? '',
} as const;

export const STRIPE_CONFIG = {
  publishableKey: getOptionalEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY') ?? '',
} as const;

export const WEAVIATE_CONFIG = {
  url: getOptionalEnv('WEAVIATE_URL') ?? '',
  apiKey: getOptionalEnv('WEAVIATE_API_KEY') ?? '',
} as const;

export const APP_CONFIG = {
  url: getOptionalEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')!,
  allowedOrigins: getOptionalEnv('NEXT_PUBLIC_ALLOWED_ORIGINS')?.split(',').map((s) => s.trim()) ?? [],
  nodeEnv: getOptionalEnv('NODE_ENV', 'development')!,
  isProd: getOptionalEnv('NODE_ENV') === 'production',
} as const;
