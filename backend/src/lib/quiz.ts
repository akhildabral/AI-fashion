// The cold-start taste quiz: visual this-or-that pairs that produce style
// signals before any wear data exists. Each pair tests one taste axis; the
// chosen side's signals are stored on the style profile and fed into the
// stylist prompt. Feels like a personality quiz, not setup.

export interface QuizSideDef {
  label: string;
  // Phrases appended to the profile brief when this side is chosen.
  signals: string[];
  // Prompt used once by scripts/generate-quiz-assets.ts to render the image.
  imagePrompt: string;
}

export interface QuizPairDef {
  id: string;
  question: string;
  left: QuizSideDef;
  right: QuizSideDef;
}

const FLATLAY =
  'Editorial flat-lay outfit photography, top-down on a plain warm light-grey ' +
  'studio background, no people, no faces, no text, catalog style: ';

export const QUIZ_PAIRS: QuizPairDef[] = [
  {
    id: 'silhouette',
    question: 'Which feels more like you?',
    left: {
      label: 'Pared back',
      signals: ['prefers minimal, pared-back outfits with few pieces'],
      imagePrompt:
        FLATLAY +
        'a minimal outfit — plain white tee, straight-leg trousers, clean low-profile sneakers, nothing else.',
    },
    right: {
      label: 'Layered up',
      signals: ['enjoys expressive layered outfits with multiple pieces'],
      imagePrompt:
        FLATLAY +
        'an expressive layered outfit — patterned shirt over a graphic tee, jacket, scarf, hat, and boots arranged together.',
    },
  },
  {
    id: 'palette',
    question: 'Pick a palette.',
    left: {
      label: 'Neutrals',
      signals: ['gravitates to a neutral palette (black, white, grey, beige)'],
      imagePrompt:
        FLATLAY +
        'an all-neutral outfit in black, white, grey, and beige — knit sweater, trousers, minimal accessories.',
    },
    right: {
      label: 'Color',
      signals: ['loves wearing saturated color'],
      imagePrompt:
        FLATLAY +
        'a colorful outfit — cobalt blue sweater, mustard trousers, red accessories, vivid but coordinated.',
    },
  },
  {
    id: 'era',
    question: 'Which wardrobe would you raid?',
    left: {
      label: 'Timeless',
      signals: ['prefers timeless classics over trends'],
      imagePrompt:
        FLATLAY +
        'timeless classics — crisp oxford shirt, navy blazer, dark denim, leather loafers, simple watch.',
    },
    right: {
      label: 'Of the moment',
      signals: ['likes trend-forward, current pieces'],
      imagePrompt:
        FLATLAY +
        'trend-forward streetwear-inflected pieces — boxy cropped jacket, wide cargo trousers, chunky sneakers, small shoulder bag.',
    },
  },
  {
    id: 'fit',
    question: 'How should clothes sit?',
    left: {
      label: 'Sharp & tailored',
      signals: ['prefers tailored, structured fits'],
      imagePrompt:
        FLATLAY +
        'sharply tailored pieces — structured blazer, pressed slim trousers, tucked shirt, polished derby shoes.',
    },
    right: {
      label: 'Easy & relaxed',
      signals: ['prefers relaxed, oversized fits'],
      imagePrompt:
        FLATLAY +
        'relaxed oversized pieces — slouchy knit, wide-leg soft trousers, unstructured overshirt, suede sneakers.',
    },
  },
  {
    id: 'pattern',
    question: 'Solid ground or bold print?',
    left: {
      label: 'Solids',
      signals: ['sticks to solid colors and subtle textures'],
      imagePrompt:
        FLATLAY +
        'an outfit of only solid colors — plain shirt, plain trousers, subtle texture, no prints anywhere.',
    },
    right: {
      label: 'Prints',
      signals: ['embraces bold patterns and prints'],
      imagePrompt:
        FLATLAY +
        'an outfit built on bold prints — striped shirt, floral scarf, checked trousers mixed confidently.',
    },
  },
  {
    id: 'energy',
    question: 'Default setting?',
    left: {
      label: 'Laid-back',
      signals: ['dresses casual-first, comfort matters'],
      imagePrompt:
        FLATLAY +
        'a laid-back casual outfit — soft hoodie, relaxed jeans, canvas sneakers, beanie.',
    },
    right: {
      label: 'Put-together',
      signals: ['likes looking polished even on ordinary days'],
      imagePrompt:
        FLATLAY +
        'a polished smart-casual outfit — fine-knit polo, pleated trousers, leather belt, suede loafers.',
    },
  },
  {
    id: 'accessories',
    question: 'Accessories: whisper or shout?',
    left: {
      label: 'Understated',
      signals: ['keeps accessories minimal and quiet'],
      imagePrompt:
        FLATLAY +
        'minimal accessories arranged neatly — one thin watch, plain leather belt, simple sunglasses.',
    },
    right: {
      label: 'Statement',
      signals: ['uses statement accessories to anchor outfits'],
      imagePrompt:
        FLATLAY +
        'statement accessories arranged together — bold chunky jewelry, printed silk scarf, standout bag, colorful socks.',
    },
  },
  {
    id: 'tone',
    question: 'Which mood?',
    left: {
      label: 'Dark & moody',
      signals: ['drawn to dark, moody tones'],
      imagePrompt:
        FLATLAY +
        'a dark moody outfit — black overcoat, charcoal knit, black jeans, black boots.',
    },
    right: {
      label: 'Light & airy',
      signals: ['drawn to light, airy tones'],
      imagePrompt:
        FLATLAY +
        'a light airy outfit — cream linen shirt, off-white trousers, pale espadrilles, straw hat.',
    },
  },
];

export type QuizChoices = Record<string, 'left' | 'right'>;

// Turn a set of answers into the signal phrases stored on the profile.
export function signalsFromChoices(choices: QuizChoices): string[] {
  const signals: string[] = [];
  for (const pair of QUIZ_PAIRS) {
    const side = choices[pair.id];
    if (side === 'left' || side === 'right') {
      signals.push(...pair[side].signals);
    }
  }
  return signals;
}
