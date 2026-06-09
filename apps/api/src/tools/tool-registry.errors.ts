export class ToolRegistryError extends Error {
  constructor(
    message: string,
    readonly code:
      | "TOOL_NOT_FOUND"
      | "TOOL_DENIED"
      | "TOOL_VALIDATION_FAILED"
      | "TOOL_TIMEOUT"
      | "TOOL_EXECUTION_FAILED",
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ToolRegistryError";
  }
}
