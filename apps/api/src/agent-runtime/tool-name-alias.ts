import type { ModelToolCall } from "../model-gateway/model-gateway.types.js";

export function toModelSafeToolName(name: string, aliases: Map<string, string>): string {
  const base = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "tool";
  let candidate = base;
  let suffix = 2;
  while (aliases.has(candidate) && aliases.get(candidate) !== name) {
    const suffixText = `_${suffix}`;
    candidate = `${base.slice(0, 64 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  aliases.set(candidate, name);
  return candidate;
}

export function resolveModelToolCall(
  toolCall: ModelToolCall,
  aliases: Map<string, string>,
): ModelToolCall {
  const originalName = aliases.get(toolCall.name);
  if (!originalName) {
    return toolCall;
  }
  return {
    ...toolCall,
    name: originalName,
  };
}
