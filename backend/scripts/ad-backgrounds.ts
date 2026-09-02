// Raw photographic backgrounds for ZAUQ social ads, in the app's atelier
// aesthetic (dark #0B0A09 ground, brass/gold #D8B26A, bone, warm cinematic
// rim light, the arched mirror motif). Each prompt keeps deliberate negative
// space so a headline can sit on it. No text baked in — copy is composited
// after. Run: npx tsx scripts/ad-backgrounds.ts [keyfilter]
import fs from 'node:fs';
import path from 'node:path';
import { generateImage } from '../src/lib/imagegen';

const OUT = process.env.ADS_OUT ? process.env.ADS_OUT + '/raw' : require('node:path').resolve(process.cwd(), 'marketing/ads/raw');
require('node:fs').mkdirSync(OUT, { recursive: true });

const BASE =
  'Cinematic editorial fashion photograph, atelier aesthetic. Near-black charcoal ' +
  'background (#0B0A09), warm brass and gold tones (#D8B26A), bone and cream accents. ' +
  'A single warm directional spotlight, deep shadows, moody and luxurious, film grain, ' +
  'shot on medium format, shallow depth of field. No text, no words, no logos, no watermark. ';

// Each entry: negative space noted so the compositor knows where copy goes.
const SHOTS: { key: string; prompt: string }[] = [
  { key: 'mirror-empty', prompt: BASE + 'A tall brass arched full-length mirror standing alone in an empty dark atelier room, catching a shaft of warm light, reflecting nothing but shadow. Vast empty dark space above and around it for a headline. Vertical composition.' },
  { key: 'rail-garments', prompt: BASE + 'A brass clothing rail in a dark room holding a few muted garments — a camel blazer, a black dress, cream silk — lit by one warm spotlight, the rest of the frame falling into darkness. Empty dark space on the left for text.' },
  { key: 'flatlay-outfit', prompt: BASE + 'Overhead flat-lay of a composed outfit on bone-cream linen: a folded blazer, trousers, leather shoes, a delicate gold necklace, arranged with generous spacing. Warm overhead light, soft shadows. Empty cream space at the top for a headline.' },
  { key: 'woman-mirror', prompt: BASE + 'A woman seen from behind standing before a brass arched mirror in a dark atelier, dressed in an elegant tailored outfit, warm rim light catching her silhouette and the brass frame. Cinematic. Dark negative space to one side.' },
  { key: 'fabric-detail', prompt: BASE + 'Extreme close-up of luxurious fabric textures overlapping — brushed wool, silk, a brass button, fine stitching — in warm raking light against darkness. Abstract, tactile, editorial. Room at the bottom for text.' },
  { key: 'vitrine-single', prompt: BASE + 'A single garment — an elegant camel coat — spotlit inside a dark arched niche like a museum vitrine, everything else in deep shadow. Reverent, minimal. Large dark area above for a headline.' },
  { key: 'wardrobe-light', prompt: BASE + 'An open wooden wardrobe in a dark room, soft morning light spilling across neatly hung clothes, dust motes in the beam, warm and quiet. Cinematic. Dark space on one side for copy.' },
  { key: 'collar-jewellery', prompt: BASE + 'Close-up of a tailored blazer collar and a fine gold chain necklace at the neckline, warm light, dark background, editorial and intimate. No face. Negative space to the right.' },
  { key: 'dressing-scene', prompt: BASE + 'A cinematic dressing-room scene: a velvet stool, a brass floor mirror, a garment draped over a chair, warm lamplight, deep shadows, the feeling of a private atelier at dusk. Empty dark space for a headline.' },
  { key: 'hands-lapel', prompt: BASE + 'Close-up of a woman\'s hands adjusting the lapel of a beautifully tailored blazer, warm light on the fabric, dark background, no face visible, elegant and human. Space above for text.' },
  { key: 'shoes-pair', prompt: BASE + 'A single pair of elegant leather heels placed in a pool of warm spotlight on a dark polished floor, long soft shadow, the rest of the frame black. Minimal, luxurious. Vast dark space above for copy.' },
  { key: 'closet-chaos-calm', prompt: BASE + 'A moody wardrobe half in chaos, half composed — a jumble of clothes on one side dissolving into a single perfectly styled outfit on a hanger on the other, warm spotlight on the composed side. Conceptual, cinematic.' },
  { key: 'arch-portrait', prompt: BASE + 'A confident woman in a striking monochrome outfit framed within a glowing brass arch against pure darkness, warm light sculpting her form, editorial fashion cover energy. Dark space at top and bottom for text.' },
  { key: 'coffee-morning', prompt: BASE + 'A quiet morning still life: a cup of coffee on a dark surface beside a folded outfit laid ready, soft window light, warm and calm, the start of a day. Editorial. Empty space for a headline.' },
  { key: 'brass-texture-bg', prompt: BASE + 'An abstract luxurious background: brushed brass and deep charcoal meeting in a soft diagonal, warm gradient light, subtle grain, no objects. A pure textural backdrop for text. Minimal.' },
  { key: 'silhouette-window', prompt: BASE + 'The silhouette of a well-dressed woman standing at a tall window in a dark room, warm backlight glowing around her tailored coat, cinematic and aspirational. Large dark negative space beside her.' },
];

async function one(key: string, prompt: string, tries = 2): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const buf = await generateImage(prompt);
      if (buf) { fs.writeFileSync(path.join(OUT, `${key}.png`), buf); console.log('✓', key, (buf.length / 1024 | 0) + 'KB'); return true; }
      console.log('· null', key, `(try ${i + 1})`);
    } catch (e) { console.log('· err', key, e instanceof Error ? e.message : e, `(try ${i + 1})`); }
  }
  return false;
}

async function main() {
  const filter = process.argv[2];
  const list = filter ? SHOTS.filter((s) => s.key.includes(filter)) : SHOTS;
  console.log('provider:', (await import('../src/lib/imagegen')).resolveImageProvider(), '· generating', list.length);
  // Gentle concurrency: 3 at a time.
  for (let i = 0; i < list.length; i += 3) {
    await Promise.all(list.slice(i, i + 3).map((s) => one(s.key, s.prompt)));
  }
  console.log('done →', OUT);
}
void main();
