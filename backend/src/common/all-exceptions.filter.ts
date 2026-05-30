import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { Request, Response } from 'express';

/**
 * Catches every uncaught exception, logs it (5xx with stack, 4xx as warn), and
 * returns a consistent JSON error envelope for HTTP requests. Without this, an
 * unhandled throw leaks a raw 500 with no log line — blind on day one of a
 * tournament.
 *
 * Because this is registered as a GLOBAL filter, it also sits in front of the
 * Socket.IO scoreboard gateway. A bare re-throw would NOT fall back to Nest's
 * default WS handling (global filters are terminal), so the gateway's
 * WsException would never reach the table-official's client. We delegate
 * non-HTTP contexts to BaseWsExceptionFilter, which preserves the
 * emit('exception', ...) behaviour the gateway relies on.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');
  private readonly wsFilter = new BaseWsExceptionFilter();

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      // WebSocket (and any non-HTTP) errors keep their framework default.
      this.wsFilter.catch(exception, host);
      return;
    }

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: unknown = 'Internal server error';
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : (body as { message?: unknown }).message ?? body;
    }

    // req.path excludes the query string — avoids leaking anything passed in the
    // query (tokens in share links, etc.) into logs and the error body.
    const path = req.path ?? req.url;
    const context = `${req.method} ${path} -> ${status}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        context,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(context);
    }

    res.status(status).json({
      statusCode: status,
      path,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
