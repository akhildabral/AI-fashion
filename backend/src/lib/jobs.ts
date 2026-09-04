// Minimal in-process job queue: uploads return immediately and cataloging
// (matting + tagging) runs in the background with bounded concurrency, which
// is what makes burst capture possible — the camera never blocks on a spinner.
//
// Single-instance by design. When the backend scales past one process, this
// module is the seam where BullMQ + Redis drops in: same enqueue() contract,
// jobs move out-of-process, nothing else changes.

import { logger } from './logger';

const CONCURRENCY = 2;

interface Job {
  label: string;
  run: () => Promise<void>;
}

const queue: Job[] = [];
let active = 0;

function pump(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    active++;
    job
      .run()
      .catch((err) => {
        logger.error({ err, job: job.label }, 'Job failed');
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}

export function enqueue(label: string, run: () => Promise<void>): void {
  queue.push({ label, run });
  pump();
}

/** Jobs still waiting or running — zero means the process may exit cleanly. */
export function pendingJobs(): number {
  return queue.length + active;
}
