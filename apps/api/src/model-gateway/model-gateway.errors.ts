export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly options: {
      provider: string;
      attempts: number;
      cause?: unknown;
      retryable?: boolean;
      statusCode?: number;
    },
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}
