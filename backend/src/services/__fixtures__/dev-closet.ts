import type { PairingPiece } from '../pairing.service';

// The dev closet the live probes ran against, as the rules see it. Every
// field the pool filters, the validator and the pairer read is here; the
// ids are stable so a test can name a piece.

export type ClosetPiece = PairingPiece & {
  status: string;
  suppressed: boolean;
  owned: boolean;
  twinOfId: string | null;
  twinResolvedAt: Date | null;
  season: string[];
  material: string | null;
  fit: string | null;
  length: string | null;
  texture: string | null;
  details: Record<string, string> | null;
};

function piece(p: Partial<ClosetPiece> & Pick<ClosetPiece, 'id' | 'category' | 'subtype'>): ClosetPiece {
  return {
    primaryColor: null,
    pattern: 'solid',
    formalityScore: null,
    warmthValue: null,
    layerRole: null,
    colorPalette: null,
    state: 'clean',
    imageUrl: '',
    cutFor: 'unisex',
    status: 'ready',
    suppressed: false,
    owned: true,
    twinOfId: null,
    twinResolvedAt: null,
    season: [],
    material: null,
    fit: 'regular',
    length: 'regular',
    texture: null,
    details: null,
    ...p,
  };
}

export const goldSwatch = piece({ id: 'gold-swatch', category: 'other', subtype: 'gold fabric swatch', primaryColor: 'gold', formalityScore: 4, warmthValue: null, layerRole: null });
export const blackPumps = piece({ id: 'black-pumps', category: 'footwear', subtype: 'black pumps', primaryColor: 'black', formalityScore: 4, warmthValue: 1, layerRole: 'footwear', material: 'leather', details: { heel: 'mid', toe: 'pointed' } });
export const blackTank = piece({ id: 'black-tank', category: 'top', subtype: 'tank top', primaryColor: 'black', formalityScore: 2, warmthValue: 0, layerRole: 'base', state: 'in-wash', material: 'cotton', details: { sleeve: 'sleeveless', neckline: 'scoop' } });
// The blazer as the old catalogue stored it: category outerwear, role outer.
export const rustBlazer = piece({ id: 'rust-blazer', category: 'outerwear', subtype: 'wool blazer', primaryColor: 'rust', formalityScore: 4, warmthValue: 5, layerRole: 'outer', material: 'wool', season: ['fall', 'winter', 'spring'] });
export const blackTrousers = piece({ id: 'black-trousers', category: 'bottom', subtype: 'tailored wool trousers', primaryColor: 'black', formalityScore: 4, warmthValue: 4, layerRole: 'bottom', material: 'wool', details: { rise: 'mid', leg: 'straight' } });
export const bluePolo = piece({ id: 'blue-polo', category: 'top', subtype: 'polo shirt', primaryColor: 'blue', formalityScore: 2, warmthValue: 1, layerRole: 'base', material: 'cotton', details: { sleeve: 'short', neckline: 'collar' } });
export const greySweatpants = piece({ id: 'grey-sweatpants', category: 'bottom', subtype: 'sweatpants', primaryColor: 'grey', formalityScore: 1, warmthValue: 3, layerRole: 'bottom', material: 'cotton', fit: 'relaxed' });
export const blackJeans = piece({ id: 'black-jeans', category: 'bottom', subtype: 'jeans', primaryColor: 'black', formalityScore: 2, warmthValue: 3, layerRole: 'bottom', material: 'denim', details: { rise: 'mid', leg: 'slim' } });

export const devCloset: ClosetPiece[] = [goldSwatch, blackPumps, blackTank, rustBlazer, blackTrousers, bluePolo, greySweatpants, blackJeans];

// Extras some tests add: clean shoes at the casual end, a clean tank.
export const whiteSneakers = piece({ id: 'white-sneakers', category: 'footwear', subtype: 'white sneakers', primaryColor: 'white', formalityScore: 2, warmthValue: 2, layerRole: 'footwear', material: 'leather' });
export const cleanTank = piece({ ...blackTank, id: 'clean-tank', state: 'clean' });
