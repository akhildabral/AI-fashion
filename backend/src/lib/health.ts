import { prisma } from './prisma';

/**
 * True when the database answers `SELECT 1` within `timeoutMs`. Never
 * throws: a refused connection, an exhausted pool or a slow answer all
 * read as "not alive", which /api/health reports as 503 `degraded`.
 */
export async function dbAlive(timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([prisma.$queryRaw`SELECT 1`.then(() => true as const), timeout]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
