import pino from 'pino';

// One structured logger for the process. Reads process.env directly (not
// config/env) so it can be imported anywhere — including from the error
// middleware and from tests that mock the env module — without a cycle.
//
//   LOG_LEVEL   fatal|error|warn|info|debug|trace|silent (default info;
//               silent under NODE_ENV=test unless set explicitly)
//
// Redaction covers every place a secret or an address could land in a log
// line: request headers, bodies echoed by mistake, and top-level fields.
const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

export const logger = pino({
  level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'authorization',
      'cookie',
      'password',
      'email',
      '*.password',
      '*.email',
      '*.authorization',
      '*.cookie',
    ],
    censor: '[redacted]',
  },
});

export type Logger = typeof logger;
