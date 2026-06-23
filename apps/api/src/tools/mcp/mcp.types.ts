import type {
  JsonObject,
  ToolInputSchema,
  ToolPropertySchema,
  ToolRiskLevel,
} from "../tool.types.js";

export type McpServerConfig = {
  id?: string;
  tenantId?: string;
  name: string;
  transport: "stdio" | "streamable_http";
  command: string;
  url?: string;
  args: string[];
  env: Record<string, string>;
  headers?: Record<string, string>;
  authType?: "none" | "bearer" | "api_key";
  authSecretRef?: string;
  disabled: boolean;
  cwd?: string;
  toolNamePrefix?: string;
  timeoutMs?: number;
  riskLevel?: ToolRiskLevel;
  requiredPermissions?: string[];
};

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpCallToolResult = {
  content?: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  structuredContent?: JsonObject;
  isError?: boolean;
};

export function normalizeMcpToolName(
  serverName: string,
  toolName: string,
  prefix?: string,
): string {
  const base = `${prefix ?? serverName}.${toolName}`;
  return base.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export function toToolInputSchema(schema: unknown): ToolInputSchema {
  if (!isObject(schema) || schema["type"] !== "object") {
    return emptySchema();
  }

  const properties = isObject(schema["properties"])
    ? Object.fromEntries(
        Object.entries(schema["properties"]).map(([key, value]) => [
          key,
          toToolPropertySchema(value),
        ]),
      )
    : {};
  const required = Array.isArray(schema["required"])
    ? schema["required"].filter((value): value is string => typeof value === "string")
    : undefined;
  const additionalProperties =
    typeof schema["additionalProperties"] === "boolean"
      ? schema["additionalProperties"]
      : true;

  return {
    type: "object",
    properties,
    ...(required && required.length > 0 ? { required } : {}),
    additionalProperties,
  };
}

function toToolPropertySchema(schema: unknown): ToolPropertySchema {
  if (!isObject(schema)) {
    return { type: "string" };
  }

  const type = normalizeJsonSchemaType(schema["type"]);
  const property: ToolPropertySchema = { type };

  if (typeof schema["description"] === "string") {
    property.description = schema["description"];
  }
  if (Array.isArray(schema["enum"])) {
    property.enum = schema["enum"].filter(
      (value): value is string | number | boolean | null =>
        ["string", "number", "boolean"].includes(typeof value) || value === null,
    );
  }
  if (type === "object" && isObject(schema["properties"])) {
    property.properties = Object.fromEntries(
      Object.entries(schema["properties"]).map(([key, value]) => [
        key,
        toToolPropertySchema(value),
      ]),
    );
    if (Array.isArray(schema["required"])) {
      property.required = schema["required"].filter(
        (value): value is string => typeof value === "string",
      );
    }
    if (typeof schema["additionalProperties"] === "boolean") {
      property.additionalProperties = schema["additionalProperties"];
    }
  }
  if (type === "array") {
    property.items = toToolPropertySchema(schema["items"]);
  }

  return property;
}

function normalizeJsonSchemaType(value: unknown): ToolPropertySchema["type"] {
  if (Array.isArray(value)) {
    return normalizeJsonSchemaType(value.find((item) => item !== "null"));
  }

  switch (value) {
    case "string":
    case "number":
    case "integer":
    case "boolean":
    case "object":
    case "array":
      return value;
    default:
      return "string";
  }
}

function emptySchema(): ToolInputSchema {
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
