import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Request, Response } from 'express';

/** Pull a human-readable message out of an HttpException's response body. */
function httpExceptionMessage(exception: HttpException): unknown {
  const body = exception.getResponse();
  return typeof body === 'string'
    ? body
    : (body as { message?: unknown }).message ?? body;
}

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
      // WebSocket path. The scoreboard gateway's services throw ordinary HTTP
      // exceptions (NotFoundException "Match not found", BadRequestException
      // "Match is not active", etc). BaseWsExceptionFilter only understands
      // WsException — anything else it flattens to a generic "Internal server
      // error" and logs at error level. Map HttpException -> WsException first
      // so the table official sees the real reason and routine 404/400s don't
      // spam error logs during normal play.
      const wsError =
        exception instanceof HttpException
          ? new WsException(httpExceptionMessage(exception) as string | object)
          : exception;
      this.wsFilter.catch(wsError, host);
      return;
    }

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message: unknown =
      exception instanceof HttpException
        ? httpExceptionMessage(exception)
        : 'Internal server error';

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
