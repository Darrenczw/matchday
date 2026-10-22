// Clips tab (FTLTG 7.4; Darren picked "Sticker Album + Kit Rings", 22 Oct 2026). Across the top, a ring for each
// game with clips, split into the two kit colours: tap it and the game's moments play full screen, one after
// another. Below, each game is an album page: its shirt panels, then a sticker for every goal or scoring play in
// the scoring team's kit. Stickers you've watched fade and get a tick; a goal whose clip isn't up yet is an empty
// slot. Official full highlights are the last sticker.
import { esc, icon, sg } from '../util.js';
import { kitsFor, crest, inkOn, isDark, kitEdge } from '../identity.js';
import { net } from '../espn.js';
import { face, skel, errorCard, gameRow } from '../ui.js';
import { feedGames, mineFirst, moments, fullHighlights, isSeen, feedLabel, feedMode } from '../feed.js';
import { openReel } from '../reel.js';
import { liveBar } from '../livebar.js';
import { followingAny } from '../store.js';

let queue = [], matchQueue = [];
// a share of colour a, the rest b (both #rrggbb).
function mix(a, b, w) {
  const c = (h, i) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(c(a, i) * w + c(b, i) * (1 - w)).toString(16).padStart(2, '0')).join('');
}
const kitOf = (k, t) => (t === k.left.team.id ? k.left : t === k.right.team.id ? k.right : null);

function ring(x, i) {
  const { g, k } = x, n = x.list.length, fresh = x.list.some((m) => !isSeen(m.clip));
  const L = k.left.team, R = k.right.team;
  const label = `${n} clip${n > 1 ? 's' : ''}: ${L.short} ${L.score ?? ''}, ${R.short} ${R.score ?? ''}${g.state === 'in' ? ', live' : ''}${fresh ? '' : ', all watched'}`;
  // The two teams' codes inside the ring, each on its own kit's side; the score under it.
  return `<button class="ring${fresh ? '' : ' seen'}" data-act="reel" data-q="tab" data-gi="${i}" aria-label="${esc(label)}"><span class="rg" style="--a:${k.left.bg};--b:${k.right.bg}"><span class="ri">${g.state === 'in' ? '<i class="dot"></i>' : ''}<b><span>${esc(L.abbr)}</span><span>${esc(R.abbr)}</span></b></span></span><span class="rl">${esc(L.score ?? '')}–${esc(R.score ?? '')}</span></button>`;
}

function sticker(x, m, qi, q = 'tab') {
  const { g, k } = x, s = kitOf(k, m.team) || { bg: '#3a3d45', ink: '#ffffff', team: {} };
  // No scorer known (some fan clips, scoring plays): the scoring team's crest on the white patch, its name below.
  const pic = m.athlete ? face(m.athlete, s, 52) : m.who ? `<span class="sf">${esc(m.ini)}</span>` : `<span class="sf">${s.team.id ? crest(s.team, 34) : ''}</span>`;
  const name = m.who || (g.sport === 'basketball' ? m.title || '' : s.team.short || '');
  const big = g.sport === 'basketball' ? '' : `<b class="sm">${esc(m.label)}</b>`;
  const sub = m.sub ? `<small>${esc(m.sub)}</small>` : '';
  const who = `<span class="sw">${esc(name)}</span>`;
  if (!m.clip) {
    // ESPN has the goal, no clip is matched yet: an empty slot, so you can see what's still coming.
    const old = Date.now() - new Date(g.date).getTime() > 12 * 3600e3;
    return `<div class="stk wait" role="listitem" style="--c:${s.bg}" aria-label="${esc(`${m.label} ${name}. ${old ? 'No clip found' : 'Clip coming'}`)}">${m.who ? `<span class="sf">${esc(m.ini)}</span>` : `<span class="sf">${s.team.id ? crest(s.team, 34) : ''}</span>`}${big}${sub}${who}<span class="sx">${old ? 'No clip' : 'Clip coming'}</span></div>`;
  }
  const seen = isSeen(m.clip);
  const said = `${g.sport === 'basketball' ? m.title || m.who : `${m.label} ${m.who || ''}`}${seen ? ', watched' : ''}. Play`;
  // Watched: the kit fades toward the card and the text turns to whichever ink reads on it (4.5:1); the tick
  // carries the meaning, so nothing fades the text itself.
  const bg = seen ? mix(s.bg, isDark() ? '#1c1d22' : '#ffffff', 0.45) : s.bg, ink = seen ? inkOn(bg) : s.ink;
  return `<button class="stk${seen ? ' seen' : !m.team ? '' : kitEdge(s)}" role="listitem" data-act="reel" data-q="${q}" data-gi="${qi}" data-clip="${esc(m.clip.src)}" style="background:${bg};color:${ink}" aria-label="${esc(said)}">${pic}${big}${sub}${who}${seen ? `<span class="st">${icon('check')}</span>` : ''}</button>`;
}

function page(x, qi) {
  const { g } = x;
  const ms = x.ms, withClip = ms.filter((m) => m.clip).length;
  const vias = [...new Set(ms.map((m) => m.clip?.via).filter(Boolean))].join(', ');
  const full = x.full ? `<button class="stk full${isSeen(x.full) ? ' seen' : ''}" role="listitem" data-act="reel" data-q="tab" data-gi="${qi}" data-clip="${esc(x.full.src)}" aria-label="${esc(`Full highlights from ${x.full.via}. Play`)}"><span class="fp">${PLAY}</span><b class="sm">Full</b><span class="sw">${esc(x.full.via)}</span></button>` : '';
  const goals = g.sport === 'soccer' ? 'goal' : g.sport === 'football' ? 'score' : 'clip';
  const foot = ms.length
    ? `${withClip} of ${ms.length} ${goals === 'clip' ? 'clips' : `${goals}s with a clip`}${vias ? ` · ${esc(vias)}` : ''}`
    : g.sport === 'soccer' && g.state === 'post' ? 'No goals' : 'No clips yet';
  return `<section class="album" aria-label="${esc(`${g.home.short} v ${g.away.short} clips`)}">${gameRow(g, { why: false, tv: false, badge: false })}${ms.length || full ? `<div class="stks" role="list">${ms.map((m) => sticker(x, m, qi)).join('')}${full}</div>` : ''}<p class="afoot">${foot}</p></section>`;
}

export default function clipsTab(params, ctx) {
  ctx.title = 'Clips';
  let html = liveBar(ctx) + `<header class="top"><h1>Clips</h1><span class="sub">${esc(feedLabel())}</span></header>`;
  if (!followingAny()) {
    return html + `<section class="empty"><h2>Follow a team to fill this</h2><p>Goals and big plays from your games show up here within minutes, game by game.</p><a class="btn go big" href="#/follow">${icon('search')}Find clubs and leagues</a></section>`;
  }
  const e = ctx.use('feed:games', feedGames, 2 * 60e3);
  if (!e.v) return html + (e.err ? (net.offline || !navigator.onLine ? `<div class="banner amber">${icon('wifi')}<span>Clips need a connection. They load again when you’re back online.</span></div>` : errorCard('Couldn’t load the clips.')) : `<div class="rings">${'<span class="ring sk"><span class="rg"></span></span>'.repeat(4)}</div>${skel(2)}`);
  const { list, all } = mineFirst(e.v);
  const pages = list.map(({ g, d }) => {
    const k = kitsFor(g), ms = moments(g, d), full = fullHighlights(g);
    return { g, d, k, ms, full, list: [...ms.filter((m) => m.clip).map((m) => ({ ...m })), ...(full ? [{ clip: full }] : [])] };
  });
  // The rings and the player use the same queue: every game with at least one clip, newest first.
  queue = pages.filter((x) => x.list.length);
  const qi = (x) => queue.indexOf(x);
  if (all && feedMode() === 'snapshot') html += `<div class="banner info">${icon('alert')}<span>The fan feed isn’t answering, so this is a saved snapshot. None of its games are ones you follow, so all of them are shown.</span></div>`;
  else if (feedMode() === 'snapshot') html += `<div class="banner info">${icon('alert')}<span>The fan feed isn’t answering, so this is a saved snapshot of real clips.</span></div>`;
  if (!pages.length) html += `<div class="banner info"><span>No finished or live games of yours in the last three nights. Clips show up here within minutes of a goal.</span></div>`;
  if (queue.length) html += `<div class="rings" role="list" aria-label="Games with clips">${queue.map((x, i) => ring(x, i)).join('')}</div>`;
  html += pages.map((x) => page(x, qi(x))).join('');
  return html;
}

// On a match page: the same stickers for that one game, under a "Clips" heading.
export function matchClips(g, d) {
  const k = kitsFor(g), ms = moments(g, d), full = fullHighlights(g);
  if (!ms.some((m) => m.clip) && !full) return '';
  const x = { g, d, k, ms, full, list: [...ms.filter((m) => m.clip), ...(full ? [{ clip: full }] : [])] };
  matchQueue = [x];
  const fullBtn = full ? `<button class="stk full${isSeen(full) ? ' seen' : ''}" role="listitem" data-act="reel" data-q="match" data-gi="0" data-clip="${esc(full.src)}" aria-label="${esc(`Full highlights from ${full.via}. Play`)}"><span class="fp">${PLAY}</span><b class="sm">Full</b><span class="sw">${esc(full.via)}</span></button>` : '';
  return `<section class="card album inmatch"><h2 class="h">Clips<span>${(() => { const n = x.list.filter((m) => !isSeen(m.clip)).length; return n ? `${n} to watch` : 'All watched'; })()}</span></h2><div class="stks" role="list">${ms.map((m) => sticker(x, m, 0, 'match')).join('')}${fullBtn}</div></section>`;
}
export function playClip(d) {
  const Q = d.q === 'match' ? matchQueue : queue;
  const gi = +d.gi;
  if (!(gi >= 0) || !Q[gi]) return;
  const x = Q[gi];
  let mi = d.clip ? x.list.findIndex((m) => m.clip.src === d.clip) : x.list.findIndex((m) => !isSeen(m.clip));
  if (mi < 0) mi = 0;
  openReel(Q.map((q) => ({ g: q.g, k: q.k, moments: q.ms, full: q.full })), gi, mi);
}

clipsTab.actions = { reel: playClip };

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
