import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

type ErrorBody = {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp: string;
  path: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = this.normalizeBody(status, exceptionResponse, request.url ?? "");
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `Unhandled exception for ${request.url ?? "unknown path"}: ${this.errorMessage(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private normalizeBody(
    statusCode: number,
    exceptionResponse: unknown,
    path: string,
  ): ErrorBody {
    if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
      const payload = exceptionResponse as Partial<ErrorBody> &
        Record<string, unknown>;
      const body: ErrorBody = {
        statusCode,
        message: payload.message ?? "Unexpected error",
        timestamp: new Date().toISOString(),
        path,
      };
      if (payload.error) {
        body.error = payload.error;
      }
      for (const [key, value] of Object.entries(payload)) {
        if (!["statusCode", "message", "error", "timestamp", "path"].includes(key)) {
          (body as ErrorBody & Record<string, unknown>)[key] = value;
        }
      }
      return body;
    }

    return {
      statusCode,
      message:
        typeof exceptionResponse === "string"
          ? exceptionResponse
          : "Unexpected error",
      timestamp: new Date().toISOString(),
      path,
    };
  }

  private errorMessage(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.message;
    }
    return typeof exception === "string" ? exception : "Unknown error";
  }
}
