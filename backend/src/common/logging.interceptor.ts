import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

/**
 * One log line per HTTP request: method, path, final status, and latency.
 * Logs both success and error outcomes so the failure case — the one you most
 * want a trail for — is never silently missing. Logs req.path (no query string)
 * to avoid leaking tokens passed in the URL.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const path = req.path ?? req.url;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(
            `${req.method} ${path} ${res.statusCode} ${Date.now() - start}ms`,
          ),
        error: (err) => {
          // On error the response isn't sent yet; report the HttpException
          // status if we can read it, else 500.
          const status =
            typeof err?.getStatus === 'function' ? err.getStatus() : 500;
          this.logger.warn(
            `${req.method} ${path} ${status} ${Date.now() - start}ms (errored)`,
          );
        },
      }),
    );
  }
}
