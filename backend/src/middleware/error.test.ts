import { describe, expect, it } from 'vitest';
import { errorHandler } from './error';

function res() {
  const r = { code: 0, body: null as unknown, status(c: number) { r.code = c; return r; }, json(b: unknown) { r.body = b; return r; } };
  return r;
}

describe('errorHandler 4xx passthrough', () => {
  it('turns a body-parser parse failure into a 400 with advice', () => {
    const r = res();
    const err = Object.assign(new Error('Unexpected token } in JSON'), { status: 400, type: 'entity.parse.failed' });
    errorHandler(err, { method: 'POST', originalUrl: '/api/x' } as never, r as never, () => undefined);
    expect(r.code).toBe(400);
    expect(r.body).toEqual({ error: 'Send valid JSON in the request body.' });
  });
  it('keeps unknown errors as a 500 with a calm sentence', () => {
    const r = res();
    errorHandler(new Error('boom'), { method: 'GET', originalUrl: '/api/y' } as never, r as never, () => undefined);
    expect(r.code).toBe(500);
    expect((r.body as { error: string }).error).toMatch(/Something went wrong/);
  });
});
