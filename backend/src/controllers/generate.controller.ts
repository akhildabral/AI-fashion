import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { generateLooks, surpriseBrief, type LookPiece } from '../services/stylist.service';
import { getProfile } from '../services/profile.service';
import { deriveReasoningAttributes } from '../services/wardrobe.service';
import { matchPiece, type MatchCandidate } from '../services/closet-match.service';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { normalizeColorName } from '../lib/attributes';

const generateSchema = z.object({
  // A mood, an occasion, a place — or nothing, for a surprise.
  occasion: z.string().max(300).optional(),
  surprise: z.boolean().optional(),
  gender: z.enum(['female', 'male', 'unisex']).optional(),
});

const lookSelect = {
  id: true,
  occasion: true,
  gender: true,
  outfit: true,
  rationale: true,
  imageUrl: true,
  favorite: true,
  verdict: true,
  createdAt: true,
} as const;

function genderFor(styleFor: string | null | undefined): 'female' | 'male' | 'unisex' {
  return styleFor === 'female' ? 'female' : styleFor === 'male' ? 'male' : 'unisex';
}

/** A kept look in a phrase, for the next surprise's brief and the taste signals. */
function phraseOf(outfit: unknown): string {
  const o = outfit as { title?: string; pieces?: LookPiece[] } | null;
  if (o?.title) return o.title;
  const p = o?.pieces ?? [];
  return p.slice(0, 3).map((x) => `${x.color} ${x.subtype}`).join(', ');
}

export async function generate(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');

  const body = generateSchema.parse(req.body);

  // Personalize using the user's saved style profile (may be null).
  const profile = await getProfile(req.user.id);
  const gender = body.gender ?? genderFor(profile?.styleFor);
  const asked = body.occasion?.trim();
  let occasion = asked || '';
  if (body.surprise || !asked) {
    const keptRows = await prisma.look.findMany({ where: { userId: req.user.id, verdict: 'keep' }, orderBy: { createdAt: 'desc' }, take: 5, select: { outfit: true } });
    occasion = surpriseBrief(profile, keptRows.map((k) => phraseOf(k.outfit)));
  }
  const generated = await generateLooks(occasion, gender, profile);

  // Persist every generated look so it survives sessions.
  const looks = await Promise.all(
    generated.map((look) =>
      prisma.look.create({
        data: {
          userId: req.user!.id,
          // The record keeps what was asked, not the brief behind a surprise.
          occasion: asked || 'a surprise',
          gender,
          outfit: look.outfit as unknown as Prisma.InputJsonValue,
          rationale: look.rationale,
          imageUrl: look.imageUrl,
        },
        select: lookSelect,
      }),
    ),
  );

  res.json({ looks });
}

export async function listLooks(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const kept = String(req.query.kept ?? '') === '1';
  const looks = await prisma.look.findMany({
    where: { userId: req.user.id, ...(kept ? { verdict: 'keep' } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: lookSelect,
  });
  res.json({ looks });
}

const favoriteSchema = z.object({ favorite: z.boolean() });

export async function setFavorite(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const { favorite } = favoriteSchema.parse(req.body);

  // Scope the update to the owner so users can't touch others' looks.
  const result = await prisma.look.updateMany({
    where: { id, userId: req.user.id },
    data: { favorite },
  });
  if (result.count === 0) throw new HttpError(404, 'Look not found');

  const look = await prisma.look.findUnique({ where: { id }, select: lookSelect });
  res.json({ look });
}

export async function deleteLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const result = await prisma.look.deleteMany({
    where: { id, userId: req.user.id },
  });
  if (result.count === 0) throw new HttpError(404, 'Look not found');
  res.status(204).send();
}

const verdictSchema = z.object({ verdict: z.enum(['keep', 'no']).nullable() });

// POST /looks/:id/verdict — keep it, or throw it back. Kept looks fold into
// the profile's taste signals, the same field the fitting writes.
export async function setVerdict(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const { verdict } = verdictSchema.parse(req.body);
  const look = await prisma.look.findFirst({ where: { id, userId: req.user.id } });
  if (!look) throw new HttpError(404, 'Look not found');
  const updated = await prisma.look.update({ where: { id }, data: { verdict, favorite: verdict === 'keep' }, select: lookSelect });

  const profile = await prisma.styleProfile.findUnique({ where: { userId: req.user.id }, select: { styleSignals: true } });
  if (profile) {
    const signals = (profile.styleSignals as { signals?: string[]; kept?: string[]; takenAt?: string } | null) ?? {};
    const phrase = phraseOf(look.outfit);
    const kept = (signals.kept ?? []).filter((k) => k !== phrase);
    if (verdict === 'keep' && phrase) kept.unshift(phrase);
    await prisma.styleProfile.update({ where: { userId: req.user.id }, data: { styleSignals: { ...signals, kept: kept.slice(0, 12) } } });
  }
  res.json({ look: updated });
}

// POST /looks/:id/recreate — how much of this look do I already own?
// Each piece of the look is matched to the closet with the twin matcher,
// from words: same category, then type, colour, material, formality, warmth.
export async function recreateLook(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const id = String(req.params.id);
  const look = await prisma.look.findFirst({ where: { id, userId: req.user.id } });
  if (!look) throw new HttpError(404, 'Look not found');
  const pieces = (look.outfit as { pieces?: LookPiece[] } | null)?.pieces ?? [];
  if (pieces.length === 0) throw new HttpError(400, 'This look has no pieces to match — ask for a fresh one');

  // Everything you own, whatever its state today — a piece in the wash is
  // still yours. Only the other side of the closet is out (the cut-for gate).
  const profile = await prisma.styleProfile.findUnique({ where: { userId: req.user.id }, select: { styleFor: true } });
  const notForYou = profile?.styleFor === 'female' ? 'mens' : profile?.styleFor === 'male' ? 'womens' : null;
  const closet = await prisma.wardrobeItem.findMany({
    where: { userId: req.user.id, owned: true, status: 'ready', state: { not: 'retired' }, ...(notForYou ? { NOT: { cutFor: notForYou } } : {}) },
  });
  const candidates: MatchCandidate[] = closet.map((c) => ({
    id: c.id, category: c.category, subtype: c.subtype, primaryColor: c.primaryColor, formalityScore: c.formalityScore,
    warmthValue: c.warmthValue, pattern: c.pattern, colorPalette: c.colorPalette, fingerprint: c.fingerprint, material: c.material,
  }));
  const byId = new Map(closet.map((c) => [c.id, c]));
  const used = new Set<string>();
  const pairs: { piece: LookPiece; item: unknown; band: string; score: number; reasons: string[] }[] = [];
  const missing: LookPiece[] = [];
  for (const piece of pieces) {
    const derived = deriveReasoningAttributes({ category: piece.category, subtype: piece.subtype, material: piece.material, formality: null });
    const [best] = matchPiece(
      // The plan says "charcoal"; the closet says "grey". One vocabulary before scoring.
      { id: `look-${piece.subtype}`, category: piece.category, subtype: piece.subtype, primaryColor: normalizeColorName(piece.color), formalityScore: derived.formalityScore, warmthValue: derived.warmthValue, pattern: piece.pattern, material: piece.material },
      candidates,
      { exclude: used, limit: 1 },
    );
    // From words alone the bar is lower than for a twin: the same kind of
    // thing in the same colour is a fair stand-in.
    if (best && best.score >= 4) {
      used.add(best.candidate.id);
      pairs.push({ piece, item: byId.get(best.candidate.id), band: best.band, score: best.score, reasons: best.reasons });
    } else {
      missing.push(piece);
    }
  }
  res.json({ pairs, missing, itemIds: pairs.map((p) => (p.item as { id: string }).id) });
}
