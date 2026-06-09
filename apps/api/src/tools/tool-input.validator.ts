import type {
  ToolInputSchema,
  ToolPropertySchema,
} from "./tool.types.js";

export type ToolValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: string[] };

export function validateToolInput(
  schema: ToolInputSchema,
  input: Record<string, unknown>,
): ToolValidationResult {
  const errors: string[] = [];
  validateObject(schema, input, "$", errors);
  return errors.length === 0 ? { ok: true, value: input } : { ok: false, errors };
}

function validateObject(
  schema: ToolInputSchema | ToolPropertySchema,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }

  const required = schema.required ?? [];
  for (const key of required) {
    if (!(key in value)) {
      errors.push(`${path}.${key} is required`);
    }
  }

  const properties = schema.properties ?? {};
  const allowAdditional = schema.additionalProperties ?? false;
  if (!allowAdditional) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        errors.push(`${path}.${key} is not allowed`);
      }
    }
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!(key in value)) {
      continue;
    }
    validateValue(propertySchema, value[key], `${path}.${key}`, errors);
  }
}

function validateValue(
  schema: ToolPropertySchema,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (schema.enum && !schema.enum.includes(value as never)) {
    errors.push(`${path} must be one of: ${schema.enum.join(", ")}`);
    return;
  }

  switch (schema.type) {
    case "string":
      if (typeof value !== "string") {
        errors.push(`${path} must be a string`);
      }
      return;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(`${path} must be a number`);
      }
      return;
    case "integer":
      if (!Number.isInteger(value)) {
        errors.push(`${path} must be an integer`);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        errors.push(`${path} must be a boolean`);
      }
      return;
    case "array":
      validateArray(schema, value, path, errors);
      return;
    case "object":
      validateObject(schema, value, path, errors);
      return;
  }
}

function validateArray(
  schema: ToolPropertySchema,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  if (!schema.items) {
    return;
  }

  value.forEach((item, index) => {
    validateValue(schema.items as ToolPropertySchema, item, `${path}[${index}]`, errors);
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
