import { prisma } from '../src/lib/prisma';
import { tagGarment } from '../src/services/wardrobe.service';
import { readStored, mimeForKey, keyFromStored } from '../src/lib/storage';
import type { Prisma } from '@prisma/client';

// Tags, second edition, for the closet you already built: every piece
// without a cut-for tag is read again from its cut-out, and only empty
// fields are filled. Nothing you set is touched. Run on the VPS:
//   docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend npx tsx scripts/retag-v2.ts
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const items = await prisma.wardrobeItem.findMany({ where: { cutFor: null, status: 'ready' }, orderBy: { createdAt: 'asc' } });
  console.log(`${items.length} pieces to read again`);
  let done = 0;
  for (const item of items) {
    try {
      const source = item.imageUrl;
      const image = await readStored(source);
      const tags = await tagGarment(image, mimeForKey(keyFromStored(source)));
      const conf = (item.attrConfidence as Record<string, number> | null) ?? {};
      const data: Prisma.WardrobeItemUncheckedUpdateInput = {};
      const fill = (k: keyof typeof tags & keyof Prisma.WardrobeItemUncheckedUpdateInput, current: unknown) => {
        const v = tags[k];
        if (current == null && v != null && v !== '' && (conf[k] ?? 0) < 1) (data as Record<string, unknown>)[k] = v;
      };
      fill('secondaryColor', item.secondaryColor);
      fill('fit', item.fit);
      fill('length', item.length);
      fill('texture', item.texture);
      fill('weight', item.weight);
      if (item.occasions.length === 0 && tags.occasions.length) data.occasions = tags.occasions;
      if (item.details == null && tags.details) data.details = tags.details as Prisma.InputJsonValue;
      if (!item.material && tags.material) data.material = tags.material;
      let cutFor = tags.cutFor;
      const newConf = { ...conf };
      for (const k of ['secondaryColor', 'fit', 'length', 'texture', 'weight', 'cutFor'] as const) if ((conf[k] ?? 0) < 1 && tags.attrConfidence[k] != null) newConf[k] = tags.attrConfidence[k];
      if (!cutFor) {
        const profile = await prisma.styleProfile.findUnique({ where: { userId: item.userId }, select: { styleFor: true } });
        cutFor = profile?.styleFor === 'female' ? 'womens' : profile?.styleFor === 'male' ? 'mens' : 'unisex';
        newConf.cutFor = 0.4;
      }
      data.cutFor = cutFor;
      data.attrConfidence = newConf;
      await prisma.wardrobeItem.update({ where: { id: item.id }, data });
      done++;
      console.log(`${done}/${items.length} ${item.subtype ?? item.category} → ${cutFor}${tags.fit ? ', ' + tags.fit : ''}`);
    } catch (err) {
      console.error(`skip ${item.id}:`, err instanceof Error ? err.message : err);
    }
    await sleep(400);
  }
  await prisma.$disconnect();
}
void main();
