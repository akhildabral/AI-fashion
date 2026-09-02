// Builds the ZAUQ Ad Kit page: every finished ad with its Meta Ads copy,
// the outside-the-box concepts, and how to run them. Embeds downscaled
// previews so the page is self-contained.
import fs from 'node:fs'; import path from 'node:path'; import sharp from 'sharp';
const DIR = process.env.ADS_OUT || require('node:path').resolve(process.cwd(), 'marketing/ads');
const FIN = path.join(DIR, 'final');
const copy = JSON.parse(fs.readFileSync(path.join(DIR, 'copy.json'), 'utf8'));
const SIZELABEL: Record<string, string> = { sq: '1:1 · 1080', pt: '4:5 · 1080×1350', st: '9:16 · story' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  const files = fs.readdirSync(FIN).filter(f => f.endsWith('.jpg') && !f.startsWith('_')).sort();
  // Order: lead with the strongest angles.
  const lead = ['nothing-to-wear','already-in-your-closet','the-math','see-it-on-you','already-waiting','same-shirt-thrice','delete-shopping-apps','taste'];
  files.sort((a, b) => {
    const ka = a.replace(/-(sq|pt|st)\.jpg$/, ''), kb = b.replace(/-(sq|pt|st)\.jpg$/, '');
    const ia = lead.indexOf(ka), ib = lead.indexOf(kb);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const cards: string[] = [];
  for (const f of files) {
    const key = f.replace(/-(sq|pt|st)\.jpg$/, '');
    const size = (f.match(/-(sq|pt|st)\.jpg$/) || [])[1] || 'sq';
    const c = copy.ads[key]; if (!c) { console.log('no copy for', key); }
    const b64 = (await sharp(path.join(FIN, f)).resize({ width: 560 }).jpeg({ quality: 74 }).toBuffer()).toString('base64');
    cards.push(`<article class="card">
      <div class="shot ${size}"><img loading="lazy" src="data:image/jpeg;base64,${b64}" alt="${esc(c?.headline || key)}"></div>
      <div class="meta">
        <div class="tags"><span class="badge">${SIZELABEL[size]}</span><span class="angle">${esc(c?.angle || '')}</span></div>
        ${c ? `<p class="ptxt">${esc(c.primary)}</p>
        <dl><dt>Headline</dt><dd>${esc(c.headline)}</dd><dt>Button</dt><dd>${esc(c.cta)}</dd><dt>Best for</dt><dd>${esc(c.audience)}</dd></dl>` : ''}
      </div>
    </article>`);
  }
  const concepts = copy.concepts.map((k: any) => `<div class="concept"><h4>${esc(k.t)}</h4><p>${esc(k.d)}</p></div>`).join('');

  const html = `<title>ZAUQ Ad Kit</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..600;1,6..96,400..500&family=Playfair+Display:wght@400;500&family=Archivo:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap">
<style>
:root{--bg:#0B0A09;--surface:#151310;--line:rgba(236,229,216,.12);--ink:#ECE5D8;--muted:#A79E8A;--faint:#6f6757;--gold:#D8B26A;--cream:#F2EDE3}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Archivo,system-ui,sans-serif;font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1240px;margin:0 auto;padding:30px 22px 90px}
header.top{text-align:center;padding:26px 0 30px;border-bottom:1px solid var(--line)}
.wm{font-family:'Playfair Display',serif;font-size:34px;letter-spacing:.02em}
.wm b{display:inline}
.kick{font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:var(--gold);font-weight:700;margin-top:14px}
h1{font-family:'Bodoni Moda',serif;font-weight:500;font-size:40px;line-height:1.05;margin:8px 0 12px;text-wrap:balance}
h1 em{font-style:italic;color:var(--gold)}
.lead{max-width:70ch;margin:0 auto;color:var(--muted)}
.stats{display:flex;gap:26px;justify-content:center;flex-wrap:wrap;margin-top:22px;color:var(--muted);font-size:13px}
.stats b{color:var(--ink);font-family:'Bodoni Moda',serif;font-size:22px;display:block}
h2{font-family:'Bodoni Moda',serif;font-weight:500;font-size:26px;margin:54px 0 6px}
h2 em{color:var(--gold);font-style:italic}
.sub{color:var(--muted);max-width:76ch;margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:4px;overflow:hidden;display:flex;flex-direction:column}
.shot{background:#000;display:grid;place-items:center}
.shot img{display:block;width:100%;height:auto}
.meta{padding:14px 16px 16px}
.tags{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.badge{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);border:1px solid rgba(216,178,106,.4);border-radius:3px;padding:2px 7px;font-weight:700}
.angle{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600}
.ptxt{margin:6px 0 12px;font-size:13.5px;color:var(--ink)}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;font-size:12.5px}
dt{color:var(--faint);text-transform:uppercase;letter-spacing:.1em;font-size:10px;font-weight:700;align-self:center}
dd{margin:0;color:var(--muted)}
.concepts{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.concept{background:var(--surface);border:1px solid var(--line);border-left:2px solid var(--gold);border-radius:3px;padding:14px 16px}
.concept h4{font-family:'Bodoni Moda',serif;font-weight:500;font-size:17px;margin:0 0 4px}
.concept p{margin:0;color:var(--muted);font-size:13px}
.note{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:16px 18px;color:var(--muted);margin-top:16px}
.note b{color:var(--ink)}
footer{margin-top:60px;padding-top:20px;border-top:1px solid var(--line);color:var(--faint);font-size:12px;text-align:center}
</style>
<div class="wrap">
<header class="top">
  <div class="wm">ZAUQ</div>
  <p class="kick">Ad Kit · Instagram &amp; Facebook</p>
  <h1>Ready-to-run creative for <em>the clothes you own.</em></h1>
  <p class="lead">${esc(copy.positioning)}</p>
  <div class="stats"><div><b>${files.length}</b> finished ads</div><div><b>27</b> raw backgrounds</div><div><b>3</b> sizes</div><div><b>${copy.concepts.length}</b> video &amp; carousel concepts</div></div>
</header>

<h2>The <em>creatives.</em></h2>
<p class="sub">Every image below is export-ready at the size shown. The copy under each is written for Meta Ads Manager — paste the Primary Text and Headline, set the button, point the URL at myzauq.com. The on-image line and the ad copy reinforce each other; they never repeat word-for-word.</p>
<div class="grid">${cards.join('')}</div>

<h2>Outside the box — <em>what to film next.</em></h2>
<p class="sub">Static images test angles cheaply; these are the moving pieces that scale a winner. Each is built from the same atelier world.</p>
<div class="concepts">${concepts}</div>

<h2>Formats &amp; <em>how to run them.</em></h2>
<div class="note"><b>Sizes.</b> ${esc(copy.formats)}</div>
<div class="note"><b>Running them.</b> ${esc(copy.howto)}</div>

<footer>ZAUQ · Ad Kit · Backgrounds generated in the atelier aesthetic; copy and concepts written for cold and retargeting audiences. Full-resolution files delivered separately.</footer>
</div>`;
  fs.writeFileSync(path.join(DIR, 'adkit.html'), html);
  console.log('adkit.html', (html.length / 1024 / 1024).toFixed(1) + 'MB', '·', files.length, 'ads');
}
void main();
