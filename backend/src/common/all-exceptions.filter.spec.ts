import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { AllExceptionsFilter } from './all-exceptions.filter';

// Builds a minimal ArgumentsHost. For 'ws' we capture what the underlying
// BaseWsExceptionFilter emits to the client so we can assert the mapped message.
function wsHost(): { host: ArgumentsHost; emitted: unknown[] } {
  const emitted: unknown[] = [];
  const client = {
    emit: (_event: string, payload: unknown) => emitted.push(payload),
  };
  const host = {
    getType: () => 'ws',
    switchToWs: () => ({
      getClient: () => client,
      getData: () => ({}),
      getPattern: () => 'test-event',
    }),
  } as unknown as ArgumentsHost;
  return { host, emitted };
}

function httpHost(): { host: ArgumentsHost; res: { code?: number; body?: unknown } } {
  const captured: { code?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      captured.code = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
    set() {},
  };
  const req = { method: 'GET', path: '/competitions/1/standings', url: '/competitions/1/standings' };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, res: captured };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps an HttpException thrown over WS to a readable WsException message', () => {
    const { host, emitted } = wsHost();
    filter.catch(new NotFoundException('Match not found'), host);
    // BaseWsExceptionFilter emits { status, message } — the message must be the
    // real reason, NOT the generic "Internal server error".
    expect(emitted).toHaveLength(1);
    expect(JSON.stringify(emitted[0])).toContain('Match not found');
    expect(JSON.stringify(emitted[0])).not.toContain('Internal server error');
  });

  it('passes a genuine WsException through unchanged over WS', () => {
    const { host, emitted } = wsHost();
    filter.catch(new WsException('Invalid winMethod: BOGUS'), host);
    expect(JSON.stringify(emitted[0])).toContain('Invalid winMethod: BOGUS');
  });

  it('returns a JSON error envelope with the real message for an HTTP request', () => {
    const { host, res } = httpHost();
    filter.catch(new NotFoundException('Competition not found'), host);
    expect(res.code).toBe(404);
    expect((res.body as { message?: unknown }).message).toBe('Competition not found');
    expect((res.body as { path?: string }).path).toBe('/competitions/1/standings');
  });

  it('masks an unknown (non-HTTP) error as a generic 500 envelope', () => {
    const { host, res } = httpHost();
    filter.catch(new Error('raw db driver blew up'), host);
    expect(res.code).toBe(500);
    expect((res.body as { message?: unknown }).message).toBe('Internal server error');
  });
});
