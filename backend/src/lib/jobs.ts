// Minimal in-process job queue: uploads return immediately and cataloging
// (matting + tagging) runs in the background with bounded concurrency, which
// is what makes burst capture possible — the camera never blocks on a spinner.
//
// Single-instance by design. When the backend scales past one process, this
// module is the seam where BullMQ + Redis drops in: same enqueue() contract,
// jobs move out-of-process, nothing else changes.

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
        console.error(`Job "${job.label}" failed:`, err instanceof Error ? err.message : err);
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

export function pendingJobs(): number {
  return queue.length + active;
}
