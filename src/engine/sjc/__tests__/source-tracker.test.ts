/**
 * Source Tracker Tests
 *
 * Tests the value provenance tracking system.
 * Every value in ESVA must have an origin: USER, CODE, CALC, or CONST.
 * Untracked values trigger BLOCK judgment.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  trackSource,
  isSourced,
  getSource,
  validateSources,
  fromUser,
  fromCalc,
  fromCode,
  fromConst,
  clearSourceTracking,
  isTrackedValue,
} from '../source-tracker';
import { createSource } from '../types';

// -- Setup -------------------------------------------------------------------

beforeEach(() => {
  clearSourceTracking();
});

// -- Core Tracking -----------------------------------------------------------

describe('Source Tracker - Core API', () => {
  test('Track USER source -- retrieve source type', () => {
    const tracked = fromUser(42, 'User input voltage');
    expect(tracked.sourceType).toBe('USER');
    expect(tracked.value).toBe(42);
    expect(tracked.description).toBe('User input voltage');
    expect(tracked.trackedAt).toBeDefined();
  });

  test('Track CALC source -- validate', () => {
    const sourceTag = createSource('KEC', '232.52', { edition: '2021' });
    const tracked = fromCalc(3.14, sourceTag, 'Calculated voltage drop');
    expect(tracked.sourceType).toBe('CALC');
    expect(tracked.sourceTag).toBeDefined();
    expect(tracked.sourceTag!.standard).toBe('KEC');
  });

  test('Track CODE source -- standard DB lookup', () => {
    const sourceTag = createSource('KEC', '232.3');
    const tracked = fromCode(129, sourceTag, 'XLPE Cu 25mm2 ampacity');
    expect(tracked.sourceType).toBe('CODE');
    expect(tracked.value).toBe(129);
  });

  test('CONST source on physical constants', () => {
    const tracked = fromConst(0.017241, 'Copper resistivity at 20C (ohm*mm2/m)');
    expect(tracked.sourceType).toBe('CONST');
    expect(tracked.value).toBe(0.017241);
  });

  test('isTrackedValue type guard works', () => {
    const tracked = fromUser(100);
    expect(isTrackedValue(tracked)).toBe(true);
    expect(isTrackedValue({ value: 100 })).toBe(false);
    expect(isTrackedValue(null)).toBe(false);
    expect(isTrackedValue(42)).toBe(false);
  });
});

// -- Source Lookup ------------------------------------------------------------

describe('Source Tracker - Lookup', () => {
  test('isSourced returns true for tracked primitive', () => {
    const _tracked = trackSource(42, 'USER');
    expect(isSourced(42)).toBe(true);
  });

  test('isSourced returns false for untracked primitive', () => {
    expect(isSourced(999)).toBe(false);
  });

  test('getSource retrieves tracked value metadata', () => {
    trackSource(100, 'USER', undefined, 'test value');
    const source = getSource(100);
    expect(source).not.toBeNull();
    expect(source!.sourceType).toBe('USER');
    expect(source!.description).toBe('test value');
  });

  test('isSourced on TrackedValue object itself returns true', () => {
    const tracked = fromUser(50);
    expect(isSourced(tracked)).toBe(true);
  });
});

// -- Source Validation -------------------------------------------------------

describe('Source Tracker - validateSources', () => {
  test('CalcResult with source array -- value is tagged', () => {
    const result = {
      value: 42,
      unit: 'A',
      source: [createSource('KEC', '232.52')],
      formula: 'test',
    };

    const validation = validateSources(result);
    expect(validation.tagged).toContain('value');
  });

  test('Untracked value without source array -- untagged', () => {
    const result = {
      value: 42,
      unit: 'A',
      source: [],
    };

    const validation = validateSources(result);
    // 'unit' is an untracked primitive
    expect(validation.untagged.length).toBeGreaterThan(0);
  });

  test('clearSourceTracking resets primitive map', () => {
    trackSource(42, 'USER');
    expect(isSourced(42)).toBe(true);
    clearSourceTracking();
    expect(isSourced(42)).toBe(false);
  });
});
