import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { displayName } from '../lib/people';
import { requireAuth } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { renderLookCard, renderPhotoCard, renderPieceCard } from '../services/share.service';

// Share cards, rendered on demand for the signed-in owner. The app fetches
// the PNG and hands it to the OS share sheet; nothing here is public.

export const shareRouter = Router();

function png(res: Response, buf: Buffer) {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(buf);
}

async function who(userId: string): Promise<string | undefined> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true, firstName: true, lastName: true } });
  return u ? displayName(u) : undefined;
}

// GET /share/outfit/:id.png — a saved outfit
shareRouter.get('/share/outfit/:id.png', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const o = await prisma.outfit.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!o) throw new HttpError(404, 'Outfit not found');
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: o.itemIds } } });
  const title = o.provenance === 'user' ? 'Composed by me' : 'From my stylist';
  png(res, await renderLookCard(items, { title, line: o.rationale ?? undefined, who: await who(req.user.id) }));
});

// GET /share/look/:id.png — a look you wore (wear log)
shareRouter.get('/share/look/:id.png', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const log = await prisma.wearLog.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!log) throw new HttpError(404, 'Look not found');
  const day = log.wornOn.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const handle = await who(req.user.id);
  if (log.photoUrl) {
    png(res, await renderPhotoCard(log.photoUrl, { title: 'Wearing it', line: day, who: handle }));
    return;
  }
  const items = await prisma.wardrobeItem.findMany({ where: { id: { in: log.itemIds } } });
  png(res, await renderLookCard(items, { title: 'Wearing it', line: day, who: handle }));
});

// GET /share/piece/:id.png — one piece and its story
shareRouter.get('/share/piece/:id.png', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const it = await prisma.wardrobeItem.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!it) throw new HttpError(404, 'Piece not found');
  const wears = await prisma.wearLog.count({ where: { userId: req.user.id, itemIds: { has: it.id } } });
  const title = [it.primaryColor, it.subtype ?? it.category].filter(Boolean).join(' ');
  const cur = (await prisma.styleProfile.findUnique({ where: { userId: req.user.id }, select: { currency: true } }))?.currency ?? 'AED';
  const fmt = new Intl.NumberFormat('en', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  const line = wears > 0 ? `worn ${wears} time${wears === 1 ? '' : 's'}${it.price && wears ? ` · ${fmt.format(Math.round(it.price / wears))} a wear` : ''}` : 'new to the closet';
  png(res, await renderPieceCard(it, { title: title.charAt(0).toUpperCase() + title.slice(1), line, who: await who(req.user.id) }));
});

// GET /share/render/:id.png — a Mirror render (try-on)
shareRouter.get('/share/render/:id.png', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const t = await prisma.tryOn.findFirst({ where: { id: String(req.params.id), userId: req.user.id } });
  if (!t) throw new HttpError(404, 'Render not found');
  png(res, await renderPhotoCard(t.imageUrl, { title: 'In the Mirror', line: 'rendered on me, from my closet', who: await who(req.user.id) }));
});
