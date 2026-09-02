import fs from 'node:fs';
import path from 'node:path';

// Server-rendered share cards set type in the Atelier faces. In production
// the fonts are installed system-wide (Dockerfile); in development, point
// fontconfig at the bundled files before the first render.
const local = path.resolve(process.cwd(), 'assets/fonts/fonts.conf');
if (!process.env.FONTCONFIG_FILE && fs.existsSync(local) && !fs.existsSync('/usr/share/fonts/truetype/atelier')) {
  process.env.FONTCONFIG_FILE = local;
}
export const CARD_FONTS = { display: 'Bodoni Moda', text: 'Archivo' };
