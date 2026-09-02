import { Router, type Request } from 'express';
import { prisma } from '../lib/prisma';

// A shared look's public page — the card a link unfurls into when someone
// posts it to a group chat. No account needed; the only ask is to come
// recreate it from your own closet. Served by the backend so it works
// wherever the API is reachable, with Open Graph tags for the unfurl.

export const lookPageRouter = Router();

function origin(req: Request): string {
  const proto = (req.get('x-forwarded-proto') ?? req.protocol).split(',')[0];
  return `${proto}://${req.get('host')}`;
}

export function absoluteImage(base: string, url: string): string {
  return /^https?:\/\//.test(url) ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

lookPageRouter.get('/look/:id', async (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9-]/g, '');
  const base = origin(req);
  const log = await prisma.wearLog.findFirst({
    where: { id, sharedAt: { not: null } },
    include: { user: { select: { handle: true } } },
  });
  if (!log) {
    res.status(404).type('html').send(page({ title: 'This look isn’t here', base, body: `<div class="state"><div class="big">This look isn’t on the circle.</div><a href="${base}">Come see what is</a></div>` }));
    return;
  }
  const items = await prisma.wardrobeItem.findMany({
    where: { id: { in: log.itemIds } },
    select: { id: true, imageUrl: true, subtype: true, category: true },
  });
  const ordered = log.itemIds.map((i) => items.find((x) => x.id === i)).filter((x): x is (typeof items)[number] => Boolean(x));
  const who = log.user.handle ? `@${esc(log.user.handle)}` : 'Someone';
  const title = `${who} wore this${log.eventType ? ` — ${esc(log.eventType)}` : ''}`;
  const arches = ordered
    .slice(0, 4)
    .map(
      (it) =>
        `<div class="bezel"><div class="niche"><img src="${esc(absoluteImage(base, it.imageUrl))}" alt="${esc(it.subtype ?? it.category)}" /></div><p class="lbl">${esc(it.subtype ?? it.category)}</p></div>`,
    )
    .join('');
  res.type('html').send(
    page({
      title,
      base,
      ogImage: ordered[0] ? absoluteImage(base, ordered[0].imageUrl) : undefined,
      body: `
  <h1>${who} <em>wore this.</em></h1>
  <p class="sub">${ordered.length} piece${ordered.length === 1 ? '' : 's'} · from a closet they already own</p>
  <div class="row">${arches}</div>
  <div class="state">
    <div class="big">Could you wear it <em>from your closet?</em></div>
    <small>A personal stylist that knows what you own — and your friends' looks.</small>
    <a href="${base}">Recreate it from yours</a>
  </div>`,
    }),
  );
});

function page(o: { title: string; base: string; body: string; ogImage?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#0E0D0B" />
<title>${esc(o.title)}</title>
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(o.title)}" />
<meta property="og:description" content="A look from the circle — recreate it from your own closet." />
${o.ogImage ? `<meta property="og:image" content="${esc(o.ogImage)}" />\n<meta name="twitter:card" content="summary_large_image" />` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..600;1,6..96,400..500&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root { color-scheme: dark; --brass:#C8A45E; --brass-hi:#E4CB94; --brass-lo:#8F6E32; --bone:#ECE5D8; --soft:#B4A991; --faint:#7E7365; --bg:#0E0D0B; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Archivo', -apple-system, 'Segoe UI', sans-serif; background: var(--bg); color: var(--bone); min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 18px; -webkit-font-smoothing: antialiased;
    background-image: radial-gradient(680px 460px at 82% -8%, rgba(200,164,94,.10), transparent 62%), radial-gradient(560px 420px at -8% 10%, rgba(124,45,42,.06), transparent 60%); background-repeat: no-repeat; }
  .mark { font-family: 'Bodoni Moda', Georgia, serif; font-weight: 600; font-size: 15px; letter-spacing: .02em; }
  .mark i { color: var(--brass); font-style: normal; }
  h1 { font-family: 'Bodoni Moda', Georgia, serif; font-size: clamp(28px, 6vw, 40px); font-weight: 500; text-align: center; max-width: 20ch; text-wrap: balance; line-height: 1.08; margin-top: 30px; }
  h1 em, .big em { font-style: italic; color: var(--brass); }
  p.sub { margin-top: 10px; color: var(--soft); font-size: 13px; letter-spacing: .04em; text-align: center; }
  .row { margin-top: 32px; display: flex; gap: 12px; width: 100%; max-width: 640px; justify-content: center; flex-wrap: wrap; }
  .bezel { width: calc(25% - 9px); min-width: 120px; }
  .niche { border-radius: 46% 46% 5px 5px / 28% 28% 5px 5px; padding: 2px; background: linear-gradient(160deg, var(--brass-hi), var(--brass-lo) 62%, var(--brass-lo)); }
  .niche img { display: block; width: 100%; aspect-ratio: 5/6; object-fit: contain; padding: 7%; border-radius: 46% 46% 4px 4px / 28% 28% 4px 4px; background: radial-gradient(82% 78% at 50% 26%, #fdfbf6, #efe7d7 96%); }
  .lbl { margin-top: 8px; text-align: center; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--soft); }
  .state { margin-top: 44px; text-align: center; }
  .state .big { font-family: 'Bodoni Moda', Georgia, serif; font-size: 26px; font-weight: 500; max-width: 22ch; text-wrap: balance; line-height: 1.15; }
  .state small { display: block; margin-top: 10px; color: var(--soft); font-size: 14px; }
  .state a { display: inline-block; margin-top: 22px; color: #1a1509; background: var(--brass); font-weight: 700; font-size: 13px; letter-spacing: .04em; text-decoration: none; border-radius: 3px; padding: 12px 20px; }
  .brand { margin-top: auto; padding-top: 40px; font-size: 11px; letter-spacing: .24em; text-transform: uppercase; color: var(--faint); }
</style>
</head>
<body>
  <div class="mark">Atelier<i>.</i></div>
  ${o.body}
  <div class="brand">A personal stylist</div>
</body>
</html>`;
}
