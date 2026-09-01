import { Router } from 'express';
import {
  createPoll,
  deletePoll,
  getPublicPoll,
  listPolls,
  votePoll,
} from '../controllers/poll.controller';
import { requireAuth } from '../middleware/auth';

export const pollRouter = Router();

pollRouter.post('/polls', requireAuth, createPoll);
pollRouter.get('/polls', requireAuth, listPolls);
pollRouter.delete('/polls/:id', requireAuth, deletePoll);

// Public — a friend with the link needs no account.
pollRouter.get('/polls/:id/public', getPublicPoll);
pollRouter.post('/polls/:id/vote', votePoll);

// Self-contained public vote page, served straight from the backend so share
// links work anywhere the API is reachable (including through the dev tunnel).
export const votePageRouter = Router();

votePageRouter.get('/vote/:id', (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9-]/g, '');
  res.type('html').send(votePage(id));
});

function votePage(pollId: string): string {
  // Self-contained, in the Atelier language — dark brass-on-black, twin arches,
  // the vote is a tap on the look. Many people's first contact with the
  // product, so it's given real care and needs no account.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#0E0D0B" />
<title>Which one?</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..600;1,6..96,400..500&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root { color-scheme: dark; --brass:#C8A45E; --brass-hi:#E4CB94; --brass-lo:#8F6E32; --bone:#ECE5D8; --soft:#B4A991; --faint:#7E7365; --bg:#0E0D0B; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Archivo', -apple-system, 'Segoe UI', sans-serif; background: var(--bg); color: var(--bone); min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 18px 40px; -webkit-font-smoothing: antialiased;
    background-image: radial-gradient(680px 460px at 82% -8%, rgba(200,164,94,.10), transparent 62%), radial-gradient(560px 420px at -8% 10%, rgba(124,45,42,.06), transparent 60%); background-repeat: no-repeat; }
  .mark { font-family: 'Bodoni Moda', Georgia, serif; font-weight: 600; font-size: 15px; letter-spacing: .02em; }
  .mark i { color: var(--brass); font-style: normal; }
  h1 { font-family: 'Bodoni Moda', Georgia, serif; font-size: clamp(26px, 6vw, 34px); font-weight: 500; text-align: center; max-width: 20ch; text-wrap: balance; line-height: 1.1; margin-top: 30px; }
  h1 em { font-style: italic; color: var(--brass); }
  p.sub { margin-top: 12px; color: var(--soft); font-size: 13px; letter-spacing: .04em; text-align: center; }
  .row { margin-top: 34px; display: flex; align-items: center; gap: 0; width: 100%; max-width: 620px; }
  .opt { flex: 1; border: none; background: none; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform .14s ease-out; }
  .opt:active { transform: scale(0.97); }
  .bezel { border-radius: 46% 46% 5px 5px / 28% 28% 5px 5px; padding: 3px; background: linear-gradient(160deg, var(--brass-hi), var(--brass-lo) 62%, var(--brass-lo)); transition: filter .2s; }
  .opt:hover .bezel, .opt.chosen .bezel { filter: brightness(1.18) saturate(1.05); }
  .niche { position: relative; border-radius: 46% 46% 5px 5px / 28% 28% 5px 5px; overflow: hidden; aspect-ratio: 3/4; background: radial-gradient(76% 66% at 50% 30%, #211d17, #0c0b09 84%); }
  .niche img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .niche::after { content: ''; position: absolute; inset: 0; background: linear-gradient(120deg, transparent 42%, rgba(233,217,188,.16) 48%, transparent 57%); }
  .seam { flex: 0 0 auto; width: 44px; text-align: center; font-family: 'Bodoni Moda', Georgia, serif; font-style: italic; font-size: 20px; color: var(--faint); }
  .state { margin-top: 44px; text-align: center; }
  .state .big { font-family: 'Bodoni Moda', Georgia, serif; font-size: 26px; font-weight: 500; color: var(--bone); }
  .state .big em { font-style: italic; color: var(--brass); }
  .state small { display: block; margin-top: 10px; color: var(--soft); font-size: 14px; }
  .state a { display: inline-block; margin-top: 22px; color: var(--brass); font-weight: 600; font-size: 13px; letter-spacing: .04em; text-decoration: none; border: 1px solid rgba(200,164,94,.35); border-radius: 3px; padding: 10px 18px; }
  .brand { margin-top: auto; padding-top: 40px; font-size: 11px; letter-spacing: .24em; text-transform: uppercase; color: var(--faint); }
</style>
</head>
<body>
  <div class="mark">Atelier<i>.</i></div>
  <h1 id="q">Loading…</h1>
  <p class="sub" id="sub"></p>
  <div class="row" id="opts"></div>
  <div class="state" id="state"></div>
  <div class="brand">A personal stylist</div>
<script>
  var pollId = ${JSON.stringify(pollId)};
  var APP_ORIGIN = location.origin;
  function voterKey() {
    try {
      var k = localStorage.getItem('voter-key');
      if (!k) { k = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('voter-key', k); }
      return k;
    } catch (e) { return 'anon-' + Math.random().toString(36).slice(2); }
  }
  function haptic() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }
  function resolve(big, small, cta) {
    document.getElementById('opts').innerHTML = '';
    document.getElementById('sub').textContent = '';
    document.getElementById('q').style.display = 'none';
    document.getElementById('state').innerHTML =
      '<div class="big">' + big + '</div>' + (small ? '<small>' + small + '</small>' : '') +
      (cta ? '<a href="' + APP_ORIGIN + '">Settle your own tomorrow</a>' : '');
  }
  fetch('/api/polls/' + pollId + '/public').then(function (r) {
    if (!r.ok) throw new Error('not found');
    return r.json();
  }).then(function (poll) {
    document.getElementById('q').textContent = poll.question || 'Which one should I wear?';
    if (poll.expired) { resolve('They&rsquo;ve already <em>decided.</em>', 'This look is off the rack — ask them for a fresh one.', true); return; }
    document.getElementById('sub').textContent = 'Tap the one you\\u2019d wear.';
    var opts = document.getElementById('opts');
    poll.options.forEach(function (o, i) {
      if (i > 0) { var s = document.createElement('div'); s.className = 'seam'; s.textContent = 'or'; opts.appendChild(s); }
      var b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = '<div class="bezel"><div class="niche"><img alt="Look" src="' + o.imageUrl + '" /></div></div>';
      b.onclick = function () {
        if (b.disabled) return;
        b.classList.add('chosen'); haptic();
        [].forEach.call(opts.querySelectorAll('.opt'), function (x) { x.disabled = true; });
        fetch('/api/polls/' + pollId + '/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId: o.id, voterKey: voterKey() })
        }).then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
          .then(function (out) {
            resolve(out.alreadyVoted ? 'Already <em>counted.</em>' : 'Sent to <em>them.</em>', out.alreadyVoted ? 'One vote each — yours is in.' : 'Thanks for helping them decide.', true);
          })
          .catch(function () { resolve('They&rsquo;ve already <em>decided.</em>', '', true); });
      };
      opts.appendChild(b);
    });
  }).catch(function () {
    document.getElementById('q').textContent = '';
    resolve('This link has <em>closed.</em>', 'It doesn&rsquo;t point to an open verdict anymore.', true);
  });
</script>
</body>
</html>`;
}
