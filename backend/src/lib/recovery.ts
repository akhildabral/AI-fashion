import { prisma } from './prisma';
import { logger } from './logger';
import { refundTryOn } from '../controllers/tryon.controller';
import { enqueueCatalog, readCatalogSource } from '../controllers/wardrobe.controller';

// Jobs live in memory (lib/jobs), so a restart loses every one that was
// queued or running. This sweep runs once after the server is up and puts
// the database back in an honest state:
//   - a TryOn still `queued`/`rendering` from before the process started is
//     failed and refunded, exactly as a render that errored would be;
//   - a WardrobeItem still `processing` from before is re-queued from its
//     stored original, as a re-read would.
// Only rows older than the process start are touched, so a job queued a
// moment ago by this very process is left alone.

const RESTART_MESSAGE = 'The server restarted before this render finished. Nothing was spent; try it again.';

export interface SweepResult {
  rendersFailed: number;
  itemsRequeued: number;
  itemsFailed: number;
}

export async function sweepStaleJobs(before: Date): Promise<SweepResult> {
  const result: SweepResult = { rendersFailed: 0, itemsRequeued: 0, itemsFailed: 0 };

  const renders = await prisma.tryOn.findMany({
    where: { status: { in: ['queued', 'rendering'] }, createdAt: { lt: before } },
    select: { id: true, usageEventId: true },
  });
  for (const r of renders) {
    await prisma.tryOn.update({ where: { id: r.id }, data: { status: 'failed', error: RESTART_MESSAGE } }).catch(() => undefined);
    await refundTryOn(r.usageEventId, r.id);
    result.rendersFailed++;
  }

  const items = await prisma.wardrobeItem.findMany({
    where: { status: 'processing', updatedAt: { lt: before } },
    select: { id: true, imageUrl: true, originalUrl: true, description: true, subtype: true, category: true, cropped: true },
  });
  for (const item of items) {
    try {
      const image = await readCatalogSource(item);
      enqueueCatalog(item.id, item, image);
      result.itemsRequeued++;
    } catch (err) {
      // No source to read from: the piece can't be cataloged; say so
      // instead of leaving it spinning forever.
      logger.warn({ err, itemId: item.id }, 'Boot sweep: item source unreadable');
      await prisma.wardrobeItem.update({ where: { id: item.id }, data: { status: 'failed' } }).catch(() => undefined);
      result.itemsFailed++;
    }
  }
  return result;
}
