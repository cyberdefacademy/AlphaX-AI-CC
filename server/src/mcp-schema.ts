export interface SchemaValidationResult { ok: boolean; error?: string; }

const MAX_DEPTH = 12;
const MAX_KEYS = 256;

function fail(message: string): SchemaValidationResult { return { ok: false, error: message }; }

function validate(value: unknown, schema: any, path: string, depth: number, seenKeys: { count: number }): SchemaValidationResult {
  if (depth > MAX_DEPTH) return fail(`${path}: schema depth exceeds ${MAX_DEPTH}`);
  if (schema === true || schema == null) return { ok: true };
  if (schema === false) return fail(`${path}: value rejected by schema`);
  if (typeof schema !== 'object') return fail(`${path}: invalid schema`);

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate: unknown) => validate(value, candidate, path, depth + 1, seenKeys).ok);
    if (matches.length !== 1) return fail(`${path}: oneOf requires exactly one matching schema`);
    return { ok: true };
  }
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((candidate: unknown) => validate(value, candidate, path, depth + 1, seenKeys).ok)) return fail(`${path}: no anyOf schema matched`);
    return { ok: true };
  }
  if (Array.isArray(schema.allOf)) {
    for (const candidate of schema.allOf) {
      const result = validate(value, candidate, path, depth + 1, seenKeys);
      if (!result.ok) return result;
    }
  }

  if (schema.enum && Array.isArray(schema.enum) && !schema.enum.some((item: unknown) => JSON.stringify(item) === JSON.stringify(value))) {
    return fail(`${path}: value is not in enum`);
  }

  const typeMatches = (type: string): boolean => {
    if (type === 'null') return value === null;
    if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
    if (type === 'array') return Array.isArray(value);
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'string') return typeof value === 'string';
    return true;
  };

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(typeMatches)) return fail(`${path}: expected ${types.join(' or ')}`);
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) return fail(`${path}: string shorter than minLength`);
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) return fail(`${path}: string longer than maxLength`);
    if (typeof schema.pattern === 'string') {
      try { if (!new RegExp(schema.pattern).test(value)) return fail(`${path}: string does not match pattern`); } catch { return fail(`${path}: invalid schema pattern`); }
    }
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return fail(`${path}: number below minimum`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) return fail(`${path}: number above maximum`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) return fail(`${path}: array shorter than minItems`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return fail(`${path}: array longer than maxItems`);
    if (schema.items) for (let i = 0; i < value.length; i++) {
      const result = validate(value[i], schema.items, `${path}[${i}]`, depth + 1, seenKeys);
      if (!result.ok) return result;
    }
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    const keys = Object.keys(value as Record<string, unknown>);
    seenKeys.count += keys.length;
    if (seenKeys.count > MAX_KEYS) return fail(`${path}: object key budget exceeded`);
    for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) return fail(`${path}: missing required property '${key}'`);
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        const result = validate((value as any)[key], properties[key], `${path}.${key}`, depth + 1, seenKeys);
        if (!result.ok) return result;
      } else if (schema.additionalProperties === false) {
        return fail(`${path}: unexpected property '${key}'`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const result = validate((value as any)[key], schema.additionalProperties, `${path}.${key}`, depth + 1, seenKeys);
        if (!result.ok) return result;
      }
    }
  }
  return { ok: true };
}

export function validateToolArguments(value: unknown, schema: unknown): SchemaValidationResult {
  if (schema === undefined || schema === null || schema === '') return { ok: true };
  return validate(value, schema, '$', 0, { count: 0 });
}
