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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Which one?</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f7f5f0; color: #1a1a1a; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 28px 16px 48px; }
  h1 { font-family: Georgia, serif; font-size: 26px; font-weight: 600; text-align: center; max-width: 26ch; text-wrap: balance; }
  p.sub { margin-top: 8px; color: rgba(26,26,26,.55); font-size: 14px; text-align: center; }
  .options { margin-top: 26px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; width: 100%; max-width: 560px; }
  button.opt { border: 1px solid rgba(26,26,26,.12); background: #fff; border-radius: 16px; overflow: hidden; padding: 0; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.06); transition: transform .12s ease, border-color .12s ease; }
  button.opt:hover { transform: translateY(-2px); border-color: rgba(185,141,111,.6); }
  button.opt img { display: block; width: 100%; aspect-ratio: 3/4; object-fit: cover; }
  button.opt .tag { display: block; padding: 10px; font-size: 14px; color: rgba(26,26,26,.7); }
  .state { margin-top: 40px; text-align: center; font-size: 17px; }
  .state small { display: block; margin-top: 8px; color: rgba(26,26,26,.5); font-size: 13px; }
  .brand { margin-top: auto; padding-top: 36px; font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: rgba(185,141,111,.9); }
</style>
</head>
<body>
  <h1 id="q">Loading…</h1>
  <p class="sub" id="sub"></p>
  <div class="options" id="opts"></div>
  <div class="state" id="state"></div>
  <div class="brand">AI Fashion</div>
<script>
  var pollId = ${JSON.stringify(pollId)};
  var LETTERS = { a: 'Option A', b: 'Option B', c: 'Option C' };
  function voterKey() {
    try {
      var k = localStorage.getItem('voter-key');
      if (!k) { k = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('voter-key', k); }
      return k;
    } catch (e) { return 'anon-' + Math.random().toString(36).slice(2); }
  }
  function show(msg, small) {
    document.getElementById('opts').innerHTML = '';
    document.getElementById('sub').textContent = '';
    document.getElementById('state').innerHTML = msg + (small ? '<small>' + small + '</small>' : '');
  }
  fetch('/api/polls/' + pollId + '/public').then(function (r) {
    if (!r.ok) throw new Error('not found');
    return r.json();
  }).then(function (poll) {
    document.getElementById('q').textContent = poll.question;
    if (poll.expired) { show('This poll has closed.', 'Ask them to send a new one!'); return; }
    document.getElementById('sub').textContent = 'Tap your pick — one vote each.';
    var opts = document.getElementById('opts');
    poll.options.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = '<img alt="' + LETTERS[o.id] + '" src="' + o.imageUrl + '" /><span class="tag">' + LETTERS[o.id] + '</span>';
      b.onclick = function () {
        b.disabled = true;
        fetch('/api/polls/' + pollId + '/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId: o.id, voterKey: voterKey() })
        }).then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
          .then(function (out) {
            show(out.alreadyVoted ? 'You already voted on this one ✓' : 'Vote counted ✓', 'Thanks for helping them decide!');
          })
          .catch(function () { show('This poll has closed.', ''); });
      };
      opts.appendChild(b);
    });
  }).catch(function () {
    document.getElementById('q').textContent = 'Poll not found';
    show('This link doesn\\u2019t point to an active poll.', '');
  });
</script>
</body>
</html>`;
}
