import type { ExtendedParamDef } from '@/components/CalculatorForm';

/** A standalone calculator may visibly propose defaults. Drawing bulk execution
 * may not silently fill them: missing measured values/assumptions require review. */
export function prepareDrawingCalculationInputs(definitions: readonly ExtendedParamDef[], values: Record<string, unknown>) {
  const input: Record<string, unknown> = {};
  const missing: string[] = [], invalid: string[] = [];
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const read = (definition: ExtendedParamDef, value: unknown, path: string, depth: number): unknown => {
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      missing.push(path); return undefined;
    }
    if (definition.type === 'array') {
      if (depth >= 4 || !Array.isArray(value) || value.length > 2000 || value.length < (definition.minItems ?? 1)) {
        invalid.push(path); return undefined;
      }
      const schema = definition.itemSchema ?? [];
      return value.map((row, index) => {
        if (definition.flatten && schema.length === 1 && !record(row)) return read(schema[0], row, `${path}[${index}]`, depth + 1);
        if (!record(row)) { invalid.push(`${path}[${index}]`); return undefined; }
        const fields = Object.fromEntries(schema.map((field) => [field.name,
          read(field, Object.hasOwn(row, field.name) ? row[field.name] : undefined, `${path}[${index}].${field.name}`, depth + 1)]));
        return definition.flatten && schema.length === 1 ? fields[schema[0].name] : fields;
      });
    }
    if (definition.type === 'number') {
      const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
      if (!Number.isFinite(n) || (definition.min !== undefined && n < definition.min)
        || (definition.max !== undefined && n > definition.max)) { invalid.push(path); return undefined; }
      return n;
    }
    if (definition.type === 'boolean') {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 'false') return value === 'true';
      invalid.push(path); return undefined;
    }
    if (typeof value !== 'string' || (definition.options && !definition.options.some((option) => option.value === value))) {
      invalid.push(path); return undefined;
    }
    return value;
  };
  if (!definitions.length) invalid.push('calculator');
  for (const definition of definitions) {
    const raw = Object.hasOwn(values, definition.name) ? values[definition.name] : undefined;
    const parsed = read(definition, raw, definition.name, 0);
    if (parsed !== undefined) input[definition.name] = parsed;
  }
  return { input, missing, invalid, ready: missing.length === 0 && invalid.length === 0 };
}
