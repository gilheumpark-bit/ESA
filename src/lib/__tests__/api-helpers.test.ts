/**
 * API Helpers Validation Tests
 *
 * Tests the lightweight Zod-like schema validation system
 * and standard API response wrappers.
 */

import { describe, test, expect } from '@jest/globals';
import {
  string,
  number,
  boolean,
  array,
  oneOf,
  object,
  apiResponse,
  apiError,
  parsePagination,
} from '../api-helpers';

// -- String Validator --------------------------------------------------------

describe('String Validator', () => {
  test('string().required() fails on empty', () => {
    const v = string().required();
    const result = v._parse('');
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe('required');
  });

  test('string().required() fails on null', () => {
    const v = string().required();
    const result = v._parse(null);
    expect(result.success).toBe(false);
  });

  test('string().required() passes on valid string', () => {
    const v = string().required();
    const result = v._parse('hello');
    expect(result.success).toBe(true);
    expect((result as { data: string }).data).toBe('hello');
  });

  test('string().min(3) fails on short string', () => {
    const v = string().min(3);
    const result = v._parse('ab');
    expect(result.success).toBe(false);
  });

  test('string().max(5) fails on long string', () => {
    const v = string().max(5);
    const result = v._parse('abcdef');
    expect(result.success).toBe(false);
  });

  test('string().pattern() validates regex', () => {
    const v = string().pattern(/^\d+$/);
    expect(v._parse('123').success).toBe(true);
    expect(v._parse('abc').success).toBe(false);
  });
});

// -- Number Validator --------------------------------------------------------

describe('Number Validator', () => {
  test('number().min(0).max(100) fails on 101', () => {
    const v = number().min(0).max(100);
    const result = v._parse(101);
    expect(result.success).toBe(false);
  });

  test('number().min(0).max(100) passes on 50', () => {
    const v = number().min(0).max(100);
    const result = v._parse(50);
    expect(result.success).toBe(true);
    expect((result as { data: number }).data).toBe(50);
  });

  test('number().required() fails on null', () => {
    const v = number().required();
    expect(v._parse(null).success).toBe(false);
  });

  test('number() coerces string to number', () => {
    const v = number();
    const result = v._parse('42');
    expect(result.success).toBe(true);
    expect((result as { data: number }).data).toBe(42);
  });

  test('number() rejects non-numeric string', () => {
    const v = number();
    expect(v._parse('abc').success).toBe(false);
  });

  test('number().integer() rejects decimal', () => {
    const v = number().integer();
    expect(v._parse(3.14).success).toBe(false);
    expect(v._parse(3).success).toBe(true);
  });
});

// -- Boolean Validator -------------------------------------------------------

describe('Boolean Validator', () => {
  test('boolean() accepts true/false', () => {
    const v = boolean();
    expect(v._parse(true).success).toBe(true);
    expect(v._parse(false).success).toBe(true);
  });

  test('boolean() coerces string "true"/"false"', () => {
    const v = boolean();
    expect((v._parse('true') as { data: boolean }).data).toBe(true);
    expect((v._parse('false') as { data: boolean }).data).toBe(false);
  });

  test('boolean().required() fails on null', () => {
    const v = boolean().required();
    expect(v._parse(null).success).toBe(false);
  });
});

// -- Object Validator --------------------------------------------------------

describe('Object Validator', () => {
  test('Object validation with correct types', () => {
    const schema = object({
      name: string().required(),
      age: number().min(0),
      active: boolean(),
    });

    const result = schema._parse({ name: 'Alice', age: 30, active: true });
    expect(result.success).toBe(true);
  });

  test('Object validation fails on missing required field', () => {
    const schema = object({
      name: string().required(),
      age: number(),
    });

    const result = schema._parse({ age: 25 });
    expect(result.success).toBe(false);
  });

  test('Object validation fails on non-object input', () => {
    const schema = object({ name: string() });
    expect(schema._parse('not an object').success).toBe(false);
    expect(schema._parse(null).success).toBe(false);
  });
});

// -- Array & oneOf Validators ------------------------------------------------

describe('Array and oneOf Validators', () => {
  test('array of numbers validates each item', () => {
    const v = array(number().min(0));
    expect(v._parse([1, 2, 3]).success).toBe(true);
    expect(v._parse([1, -1, 3]).success).toBe(false);
  });

  test('oneOf validates against allowed values', () => {
    const v = oneOf(['Cu', 'Al'] as const);
    expect(v._parse('Cu').success).toBe(true);
    expect(v._parse('Fe').success).toBe(false);
  });
});

// -- API Response Wrappers ---------------------------------------------------

describe('API Response Wrappers', () => {
  test('apiResponse returns success format', async () => {
    const res = apiResponse({ value: 42 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.value).toBe(42);
  });

  test('apiError returns error format', async () => {
    const res = apiError('ESVA-4001', 'Invalid input', 400);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('ESVA-4001');
    expect(body.error.message).toBe('Invalid input');
  });

  test('apiResponse with custom status code', async () => {
    const res = apiResponse({ created: true }, 201);
    expect(res.status).toBe(201);
  });
});

// -- Pagination Parser -------------------------------------------------------

describe('Pagination Parser', () => {
  test('Default pagination values', () => {
    const params = new URLSearchParams();
    const result = parsePagination(params);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.offset).toBe(0);
  });

  test('Custom page and pageSize', () => {
    const params = new URLSearchParams('page=3&pageSize=50');
    const result = parsePagination(params);
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
    expect(result.offset).toBe(100);
  });

  test('pageSize capped at 100', () => {
    const params = new URLSearchParams('page=1&pageSize=500');
    const result = parsePagination(params);
    expect(result.pageSize).toBe(100);
  });
});
