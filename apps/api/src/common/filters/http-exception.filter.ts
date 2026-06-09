import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
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

    response.status(status).json(body);
  }

  private normalizeBody(
    statusCode: number,
    exceptionResponse: unknown,
    path: string,
  ): ErrorBody {
    if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
      const payload = exceptionResponse as Partial<ErrorBody>;
      const body: ErrorBody = {
        statusCode,
        message: payload.message ?? "Unexpected error",
        timestamp: new Date().toISOString(),
        path,
      };
      if (payload.error) {
        body.error = payload.error;
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
}
