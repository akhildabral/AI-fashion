// One-time generator for the taste-quiz pair images. Renders each side's
// flat-lay via the configured image provider and stores a compact JPEG in
// backend/assets/quiz (committed to the repo, served at /api/quiz-assets).
// Re-run only to regenerate: pnpm exec tsx scripts/generate-quiz-assets.ts
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { QUIZ_PAIRS } from '../src/lib/quiz';
import { generateImage } from '../src/lib/imagegen';

const OUT_DIR = path.resolve(__dirname, '../assets/quiz');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const pair of QUIZ_PAIRS) {
    for (const side of ['left', 'right'] as const) {
      const file = path.join(OUT_DIR, `${pair.id}-${side}.jpg`);
      if (fs.existsSync(file)) {
        console.log('skip (exists):', path.basename(file));
        continue;
      }
      const image = await generateImage(pair[side].imagePrompt);
      if (!image) {
        console.error('FAILED:', pair.id, side);
        continue;
      }
      await sharp(image).resize(640, 640, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(file);
      console.log('generated:', path.basename(file));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
