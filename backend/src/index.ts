import './lib/fonts';
import sharp from 'sharp';
import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { pendingJobs } from './lib/jobs';
import { startScheduler } from './lib/scheduler';
import { sweepStaleJobs } from './lib/recovery';

// Image work is CPU-bound and shares a small box with the event loop: one
// libvips thread keeps a burst of uploads from starving request handling.
// (The matting model is pinned to one thread the same way.)
sharp.concurrency(1);

// Anything queued or rendering from before this instant belonged to a
// previous process and is swept once the server is up.
const STARTED_AT = new Date();

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `ZAUQ API listening on http://localhost:${env.PORT}`);
  // Non-blocking: the server is already serving while this runs.
  sweepStaleJobs(STARTED_AT)
    .then((r) => logger.info(r, 'Boot sweep done'))
    .catch((err) => logger.error({ err }, 'Boot sweep failed'));
});
const stopScheduler = startScheduler();

// Graceful drain: stop taking connections, let in-flight responses finish,
// let queued background jobs (renders, cataloging) finish, then leave.
// Each phase is capped so a wedged connection or job can't hold the
// process past what the orchestrator allows before a kill.
const DRAIN_CAP_MS = 15_000;
let shuttingDown = false;

function withCap<T>(p: Promise<T>, ms: number, what: string): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const cap = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      logger.warn({ what, ms }, 'Shutdown phase hit its cap; moving on');
      resolve(undefined);
    }, ms);
  });
  return Promise.race([p, cap]).finally(() => clearTimeout(timer));
}

function jobsDrained(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (pendingJobs() === 0) return resolve();
      setTimeout(check, 250);
    };
    check();
  });
}

async function shutdown(signal: string, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  stopScheduler();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  // Idle keep-alive sockets would otherwise keep close() from ever resolving.
  server.closeIdleConnections();
  await withCap(closed, DRAIN_CAP_MS, 'server.close');
  const pending = pendingJobs();
  if (pending > 0) logger.info({ pending }, 'Waiting for background jobs');
  await withCap(jobsDrained(), DRAIN_CAP_MS, 'jobs');
  await prisma.$disconnect().catch(() => undefined);
  process.exit(code);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// A rejected promise nobody awaited is a bug to log, not a reason to drop
// every request in flight; an uncaught exception means state is unknown,
// so the process drains and exits for the orchestrator to restart it.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});
