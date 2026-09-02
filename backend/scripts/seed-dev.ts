/* eslint-disable no-console */
// Dev fixtures: a few members, closets built from cutouts already in
// ./uploads, follows, a shared look, an open verdict and a friend pick — so
// the Circle has something on the table locally. Never run against prod.
//
//   DEV_PASSWORD=… npx tsx scripts/seed-dev.ts
//
// Idempotent on email: existing users are updated, their closets left alone.

import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';
import { deriveReasoningAttributes } from '../src/services/wardrobe.service';

if (process.env.NODE_ENV === 'production') throw new Error('Not on prod.');
const PASSWORD = process.env.DEV_PASSWORD;
if (!PASSWORD) throw new Error('Set DEV_PASSWORD');

type Piece = { file: string; category: string; subtype: string; primaryColor: string; formality: string; material?: string; price?: number; visibility?: 'public' | 'private' };

const P = {
  jeans: { file: 'ec93f3b1-3265-49cf-8c9a-a96302ba9eab.png', category: 'bottom', subtype: 'jeans', primaryColor: 'black', formality: 'casual', material: 'denim', price: 2490, visibility: 'public' },
  sweats: { file: '1b1d08cf-320f-4489-bae2-5ee50e4aa758.png', category: 'bottom', subtype: 'sweatpants', primaryColor: 'grey', formality: 'athletic', material: 'cotton', price: 1200 },
  kaftan: { file: '1f7ea078-9629-43ef-bf75-4c372fe7120d.png', category: 'top', subtype: 'tunic', primaryColor: 'red', formality: 'casual', material: 'viscose', price: 1800, visibility: 'public' },
  flipflops: { file: 'd510ec6b-b655-4229-b8f1-d72480e85c46.png', category: 'footwear', subtype: 'flip-flops', primaryColor: 'black', formality: 'casual', price: 400 },
  redTrousers: { file: '42e49ce3-45e3-4471-ad29-11f5cb15b645.png', category: 'bottom', subtype: 'wide-leg trousers', primaryColor: 'red', formality: 'smart-casual', material: 'viscose', price: 2200, visibility: 'public' },
  blackTrousers: { file: '87249d6e-4d0b-457d-b9ce-ede6496d1e67.png', category: 'bottom', subtype: 'trousers', primaryColor: 'black', formality: 'business', material: 'wool', price: 3200, visibility: 'public' },
  blazer: { file: 'c30e5e27-af36-4872-8e2c-3e8bfd6a0d51.png', category: 'outerwear', subtype: 'blazer', primaryColor: 'rust', formality: 'business', material: 'wool', price: 6500, visibility: 'public' },
  polo: { file: 'baf5fe83-03eb-48fb-88ce-2a6f4e051780.png', category: 'top', subtype: 'polo shirt', primaryColor: 'blue', formality: 'casual', material: 'cotton', price: 1500, visibility: 'public' },
  nudePumps: { file: '65f11dbb-5687-4482-92e2-61e00f9117c8.png', category: 'footwear', subtype: 'slingback pumps', primaryColor: 'beige', formality: 'business', material: 'leather', price: 4200, visibility: 'public' },
  redBag: { file: '5919163f-a1dc-46d9-a279-3ef8128e4bfe.png', category: 'accessory', subtype: 'bag', primaryColor: 'red', formality: 'smart-casual', price: 2600, visibility: 'public' },
  blackPumps: { file: 'be4d350b-4f2a-4c0b-96af-0fab4fb73e25.png', category: 'footwear', subtype: 'pumps', primaryColor: 'black', formality: 'business', material: 'leather', price: 3900, visibility: 'public' },
  earrings: { file: '48bc59c9-f1cb-42a0-97c6-f8f9853c4e3a.png', category: 'accessory', subtype: 'earrings', primaryColor: 'gold', formality: 'smart-casual', price: 900, visibility: 'public' },
  tank: { file: '51b7e3da-b302-4837-8d45-f869f5532943.png', category: 'top', subtype: 'tank top', primaryColor: 'black', formality: 'casual', material: 'cotton', price: 700, visibility: 'public' },
} satisfies Record<string, Piece>;

async function member(email: string, handle: string, firstName: string, opts: { styleFor: string; city: string; signals: string[] }) {
  const passwordHash = await bcrypt.hash(PASSWORD as string, 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, firstName, handle, status: 'approved', emailVerified: true },
    update: { passwordHash, firstName, handle, status: 'approved', emailVerified: true },
  });
  await prisma.styleProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      styleFor: opts.styleFor,
      city: opts.city,
      styleVibe: 'pared-back',
      styleSignals: { signals: opts.signals, takenAt: new Date().toISOString() },
      intents: ['decided', 'friends'],
      occasions: ['work', 'casual', 'evening'],
      fittingStep: 9,
      fittingCompletedAt: new Date(),
    },
    update: {},
  });
  return user;
}

async function closet(userId: string, pieces: Piece[]) {
  const existing = await prisma.wardrobeItem.count({ where: { userId } });
  if (existing > 0) return prisma.wardrobeItem.findMany({ where: { userId } });
  const rows = [];
  for (const p of pieces) {
    const derived = deriveReasoningAttributes({ category: p.category, subtype: p.subtype, material: p.material ?? null, formality: p.formality });
    rows.push(
      await prisma.wardrobeItem.create({
        data: {
          userId,
          imageUrl: `/api/uploads/${p.file}`,
          category: p.category,
          subtype: p.subtype,
          primaryColor: p.primaryColor,
          formality: p.formality,
          material: p.material ?? null,
          season: ['all'],
          price: p.price ?? null,
          visibility: p.visibility ?? 'private',
          status: 'ready',
          ...derived,
        },
      }),
    );
  }
  return rows;
}

async function follow(a: string, b: string) {
  await prisma.follow.createMany({ data: [{ followerId: a, followingId: b }], skipDuplicates: true });
}

async function main() {
  const smoke = await member('smoke@test.dev', 'smoke_tester', 'Sam', { styleFor: 'unisex', city: 'Bengaluru', signals: ['minimal', 'tailored', 'dark'] });
  const bestie = await member('bestie@test.dev', 'bestie', 'Bea', { styleFor: 'female', city: 'Mumbai', signals: ['minimal', 'colour', 'tailored'] });
  const walk = await member('walk_client@test.dev', 'walk_client', 'Wren', { styleFor: 'female', city: 'Delhi', signals: ['dark', 'street'] });
  const abc = await member('abc@test.dev', 'abc', 'Abe', { styleFor: 'male', city: 'Pune', signals: ['minimal', 'tailored'] });

  const smokeItems = await closet(smoke.id, [P.jeans, P.sweats, P.polo, P.blackTrousers, P.blazer, P.blackPumps, P.tank]);
  const bestieItems = await closet(bestie.id, [P.kaftan, P.redTrousers, P.nudePumps, P.redBag, P.earrings, P.flipflops]);
  await closet(walk.id, [P.blackTrousers, P.tank, P.blackPumps]);
  await closet(abc.id, [P.polo, P.jeans]);

  // Friends: smoke <-> bestie. One way: smoke -> walk_client. abc stands alone.
  await follow(smoke.id, bestie.id);
  await follow(bestie.id, smoke.id);
  await follow(smoke.id, walk.id);

  const by = (items: { subtype: string | null; id: string }[], sub: string) => items.find((i) => i.subtype === sub)!.id;

  if ((await prisma.wearLog.count({ where: { userId: bestie.id } })) === 0) {
    // Bestie's shared look, on the table today.
    await prisma.wearLog.create({
      data: {
        userId: bestie.id,
        itemIds: [by(bestieItems, 'tunic'), by(bestieItems, 'wide-leg trousers'), by(bestieItems, 'slingback pumps'), by(bestieItems, 'earrings')],
        eventType: 'evening',
        sharedAt: new Date(),
      },
    });
    // Her open verdict.
    await prisma.poll.create({
      data: {
        userId: bestie.id,
        question: 'Dinner tonight — which one?',
        options: [
          { id: 'a', imageUrl: bestieItems.find((i) => i.subtype === 'tunic')!.imageUrl },
          { id: 'b', imageUrl: bestieItems.find((i) => i.subtype === 'bag')!.imageUrl },
        ],
        expiresAt: new Date(Date.now() + 12 * 3_600_000),
      },
    });
    // A look she styled for smoke, from smoke's public pieces.
    await prisma.friendPick.create({
      data: {
        forUserId: smoke.id,
        byUserId: bestie.id,
        itemIds: [by(smokeItems, 'polo shirt'), by(smokeItems, 'jeans'), by(smokeItems, 'pumps')],
        note: 'This combo is so you — wear it Friday!',
      },
    });
    // Smoke wore something yesterday, so Today has a ledger to draw on.
    await prisma.wearLog.create({
      data: {
        userId: smoke.id,
        itemIds: [by(smokeItems, 'polo shirt'), by(smokeItems, 'trousers'), by(smokeItems, 'pumps')],
        eventType: 'work',
        wornOn: new Date(Date.now() - 86_400_000),
      },
    });
  }

  console.log('seeded:', { smoke: smoke.id, bestie: bestie.id, walk: walk.id, abc: abc.id, smokeItems: smokeItems.length, bestieItems: bestieItems.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
