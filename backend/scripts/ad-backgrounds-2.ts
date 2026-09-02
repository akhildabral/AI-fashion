// Wave 2: more raw backgrounds — broader scenes so the ad library is deep.
import fs from 'node:fs'; import path from 'node:path';
import { generateImage } from '../src/lib/imagegen';
const OUT = process.env.ADS_OUT ? process.env.ADS_OUT + '/raw' : require('node:path').resolve(process.cwd(), 'marketing/ads/raw');
require('node:fs').mkdirSync(OUT, { recursive: true });
const BASE =
  'Cinematic editorial fashion photograph, atelier aesthetic. Near-black charcoal background (#0B0A09), ' +
  'warm brass and gold tones (#D8B26A), bone and cream accents. One warm directional spotlight, deep shadows, ' +
  'moody and luxurious, film grain, medium format, shallow depth of field. No text, no words, no logos, no watermark. ';
const SHOTS: { key: string; prompt: string }[] = [
  { key: 'dressing-scene', prompt: BASE + 'A cinematic dressing room at dusk: a velvet stool, a brass floor mirror, a tailored jacket draped over a chair, warm lamplight, deep shadows, private atelier mood. Clean empty dark space for a headline. Absolutely no lettering anywhere.' },
  { key: 'mens-tailoring', prompt: BASE + 'A man\'s tailored outfit laid out — a navy blazer, crisp shirt, trousers, brown leather shoes and a watch — on a dark surface under warm spotlight, editorial menswear. Dark negative space for text.' },
  { key: 'packing-travel', prompt: BASE + 'An open leather suitcase on a dark bed, a neat capsule wardrobe folded inside — a few garments, shoes, a scarf — warm light, the romance of packing well. Dark space above for a headline.' },
  { key: 'phone-in-scene', prompt: BASE + 'A smartphone lying face-down on a dark marble surface beside a folded cashmere sweater and a gold ring, warm light, a quiet flat-lay, product-in-context, screen off. Empty space for text. No user interface.' },
  { key: 'color-rail', prompt: BASE + 'A brass rail holding a few rich jewel-tone garments — emerald, oxblood, deep gold silk — spotlit against darkness, the rest of the frame black. Luxurious. Dark negative space on one side.' },
  { key: 'jewellery-flatlay', prompt: BASE + 'A flat-lay of fine gold jewellery — a chain, hoop earrings, a signet ring, a slim watch — arranged on dark textured stone under warm light, editorial, minimal. Generous dark space for a headline.' },
  { key: 'coat-on-hook', prompt: BASE + 'A single elegant camel wool coat hanging on a brass wall hook in a dark room, one warm shaft of light across it, long shadow, minimal and reverent. Large dark space for copy.' },
  { key: 'silk-folds', prompt: BASE + 'Abstract close-up of draped silk and wool folds in warm raking light against darkness, deep amber and bone tones, tactile and luxurious, a pure textural backdrop. Room for text.' },
  { key: 'mirror-reflection', prompt: BASE + 'A brass-framed mirror in a dark room reflecting a beautifully styled outfit on a figure just out of frame, warm reflected light, cinematic and mysterious. Dark negative space beside the mirror.' },
  { key: 'shoe-shelf', prompt: BASE + 'A dark wooden shelf displaying a curated row of elegant shoes — heels, loafers, boots — each in a pool of warm museum light against black, editorial. Dark space above for a headline.' },
  { key: 'lookbook-spread', prompt: BASE + 'An open luxury fashion lookbook resting on a dark table beside a cup of espresso and reading glasses, warm lamplight, the pages showing elegant blurred garments, editorial still life. Empty dark space for copy. No readable text on the pages.' },
  { key: 'window-chair', prompt: BASE + 'A tailored outfit laid over a mid-century chair by a tall window at golden hour, soft light, a quiet bedroom, the calm of a morning well begun. Cinematic. Dark negative space for a headline.' },
];
async function one(key: string, prompt: string, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try { const b = await generateImage(prompt); if (b) { fs.writeFileSync(path.join(OUT, `${key}.png`), b); console.log('✓', key); return; } } catch (e) { console.log('· err', key, e instanceof Error ? e.message : e); }
  }
  console.log('· FAILED', key);
}
async function main() {
  for (let i = 0; i < SHOTS.length; i += 3) await Promise.all(SHOTS.slice(i, i + 3).map(s => one(s.key, s.prompt)));
  console.log('wave 2 done');
}
void main();
