/**
 * ESVA Shared API Utilities with Lightweight Validation
 * ─────────────────────────────────────────────────────
 * Zod-like schema validation without the dependency.
 * Standard response wrappers, CORS, rate limit, pagination.
 *
 * PART 1: Lightweight schema validation
 * PART 2: Response wrappers
 * PART 3: CORS & rate limit headers
 * PART 4: Pagination parser
 */

// ─── PART 1: Lightweight Schema Validation ──────────────────────

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

interface Validator<T> {
  _parse(value: unknown): ValidationResult<T>;
}

// --- String validator ---

interface StringValidator extends Validator<string> {
  required(): StringValidator;
  min(n: number): StringValidator;
  max(n: number): StringValidator;
  pattern(re: RegExp): StringValidator;
}

export function string(): StringValidator {
  const checks: Array<(v: string) => string | null> = [];
  let isRequired = false;

  const validator: StringValidator = {
    _parse(value: unknown): ValidationResult<string> {
      if (value === undefined || value === null || value === '') {
        if (isRequired) return { success: false, error: 'required' };
        return { success: true, data: '' };
      }
      if (typeof value !== 'string') {
        return { success: false, error: 'expected string' };
      }
      for (const check of checks) {
        const err = check(value);
        if (err) return { success: false, error: err };
      }
      return { success: true, data: value };
    },
    required() {
      isRequired = true;
      return validator;
    },
    min(n: number) {
      checks.push((v) => (v.length < n ? `min length ${n}` : null));
      return validator;
    },
    max(n: number) {
      checks.push((v) => (v.length > n ? `max length ${n}` : null));
      return validator;
    },
    pattern(re: RegExp) {
      checks.push((v) => (!re.test(v) ? `must match ${re}` : null));
      return validator;
    },
  };
  return validator;
}

// --- Number validator ---

interface NumberValidator extends Validator<number> {
  required(): NumberValidator;
  min(n: number): NumberValidator;
  max(n: number): NumberValidator;
  integer(): NumberValidator;
}

export function number(): NumberValidator {
  const checks: Array<(v: number) => string | null> = [];
  let isRequired = false;

  const validator: NumberValidator = {
    _parse(value: unknown): ValidationResult<number> {
      if (value === undefined || value === null || value === '') {
        if (isRequired) return { success: false, error: 'required' };
        return { success: true, data: 0 };
      }
      const num = typeof value === 'string' ? Number(value) : value;
      if (typeof num !== 'number' || isNaN(num)) {
        return { success: false, error: 'expected number' };
      }
      for (const check of checks) {
        const err = check(num);
        if (err) return { success: false, error: err };
      }
      return { success: true, data: num };
    },
    required() {
      isRequired = true;
      return validator;
    },
    min(n: number) {
      checks.push((v) => (v < n ? `min ${n}` : null));
      return validator;
    },
    max(n: number) {
      checks.push((v) => (v > n ? `max ${n}` : null));
      return validator;
    },
    integer() {
      checks.push((v) => (!Number.isInteger(v) ? 'must be integer' : null));
      return validator;
    },
  };
  return validator;
}

// --- Boolean validator ---

interface BooleanValidator extends Validator<boolean> {
  required(): BooleanValidator;
}

export function boolean(): BooleanValidator {
  let isRequired = false;

  const validator: BooleanValidator = {
    _parse(value: unknown): ValidationResult<boolean> {
      if (value === undefined || value === null) {
        if (isRequired) return { success: false, error: 'required' };
        return { success: true, data: false };
      }
      if (typeof value === 'boolean') return { success: true, data: value };
      if (value === 'true') return { success: true, data: true };
      if (value === 'false') return { success: true, data: false };
      return { success: false, error: 'expected boolean' };
    },
    required() {
      isRequired = true;
      return validator;
    },
  };
  return validator;
}

// --- Array validator ---

interface ArrayValidator<T> extends Validator<T[]> {
  min(n: number): ArrayValidator<T>;
  max(n: number): ArrayValidator<T>;
}

export function array<T>(itemValidator: Validator<T>): ArrayValidator<T> {
  const checks: Array<(v: T[]) => string | null> = [];

  const validator: ArrayValidator<T> = {
    _parse(value: unknown): ValidationResult<T[]> {
      if (!Array.isArray(value)) {
        return { success: false, error: 'expected array' };
      }
      const results: T[] = [];
      for (let i = 0; i < value.length; i++) {
        const r = itemValidator._parse(value[i]);
        if (!r.success) return { success: false, error: `[${i}]: ${r.error}` };
        results.push(r.data);
      }
      for (const check of checks) {
        const err = check(results);
        if (err) return { success: false, error: err };
      }
      return { success: true, data: results };
    },
    min(n: number) {
      checks.push((v) => (v.length < n ? `min ${n} items` : null));
      return validator;
    },
    max(n: number) {
      checks.push((v) => (v.length > n ? `max ${n} items` : null));
      return validator;
    },
  };
  return validator;
}

// --- oneOf validator ---

export function oneOf<T extends string | number>(allowed: readonly T[]): Validator<T> {
  return {
    _parse(value: unknown): ValidationResult<T> {
      if (allowed.includes(value as T)) {
        return { success: true, data: value as T };
      }
      return { success: false, error: `must be one of: ${allowed.join(', ')}` };
    },
  };
}

// --- Optional wrapper ---

export function optional<T>(inner: Validator<T>): Validator<T | undefined> {
  return {
    _parse(value: unknown): ValidationResult<T | undefined> {
      if (value === undefined || value === null) {
        return { success: true, data: undefined };
      }
      return inner._parse(value);
    },
  };
}

// --- Object schema ---

type SchemaShape = Record<string, Validator<unknown>>;
type InferSchema<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends Validator<infer T> ? T : never;
};

export interface Schema<T> {
  _parse(value: unknown): ValidationResult<T>;
}

export function object<S extends SchemaShape>(shape: S): Schema<InferSchema<S>> {
  return {
    _parse(value: unknown): ValidationResult<InferSchema<S>> {
      if (typeof value !== 'object' || value === null) {
        return { success: false, error: 'expected object' };
      }
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      const errors: string[] = [];

      for (const [key, validator] of Object.entries(shape)) {
        const r = validator._parse(obj[key]);
        if (!r.success) {
          errors.push(`${key}: ${r.error}`);
        } else {
          result[key] = r.data;
        }
      }

      if (errors.length > 0) {
        return { success: false, error: errors.join('; ') };
      }
      return { success: true, data: result as InferSchema<S> };
    },
  };
}

/**
 * Validate an unknown body against a schema.
 */
export function validateBody<T>(
  body: unknown,
  schema: Schema<T>,
): ValidationResult<T> {
  return schema._parse(body);
}

// ─── PART 2: Response Wrappers ──────────────────────────────────

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string };
}

/**
 * Standard success response.
 */
export function apiResponse<T>(data: T, status = 200): Response {
  const body: ApiSuccessResponse<T> = { success: true, data };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Standard error response.
 */
export function apiError(code: string, message: string, status = 400): Response {
  const body: ApiErrorResponse = { success: false, error: { code, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── PART 3: CORS & Rate Limit Headers ──────────────────────────

/**
 * Add CORS headers to a response.
 */
export function withCORS(response: Response, origin = '*'): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  headers.set('Access-Control-Max-Age', '86400');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Add rate limit headers to a response.
 */
export function withRateLimit(
  response: Response,
  remaining: number,
  reset: number,
): Response {
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Remaining', String(remaining));
  headers.set('X-RateLimit-Reset', String(reset));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ─── PART 4: Pagination Parser ──────────────────────────────────

interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Extract pagination parameters from URL search params.
 */
export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const rawPage = Number(searchParams.get('page'));
  const rawPageSize = Number(searchParams.get('pageSize') ?? searchParams.get('limit'));

  const page = !isNaN(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : DEFAULT_PAGE;
  const pageSize = !isNaN(rawPageSize) && rawPageSize >= 1
    ? Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}
