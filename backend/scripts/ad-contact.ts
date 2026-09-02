import fs from 'node:fs'; import path from 'node:path'; import sharp from 'sharp';
const DIR = (process.env.ADS_OUT || require('node:path').resolve(process.cwd(), 'marketing/ads')) + '/final';
async function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.jpg') && !f.startsWith('_')).sort();
  const cell = 360, cols = 5, pad = 12;
  const rows = Math.ceil(files.length / cols);
  const W = cols * cell + (cols + 1) * pad, H = rows * cell + (rows + 1) * pad;
  const tiles = await Promise.all(files.map(async (f, i) => {
    const buf = await sharp(path.join(DIR, f)).resize(cell, cell, { fit: 'contain', background: '#000' }).toBuffer();
    const c = i % cols, r = (i / cols | 0);
    return { input: buf, top: pad + r * (cell + pad), left: pad + c * (cell + pad) };
  }));
  await sharp({ create: { width: W, height: H, channels: 3, background: '#141210' } }).composite(tiles).jpeg({ quality: 82 }).toFile(path.join(DIR, '_contact.jpg'));
  console.log('contact', W + 'x' + H);
}
void main();
