// Fans tab (FTLTG 7.5; Darren chose "everything, as a feed", 22 Oct 2026). Filters: Your games (match and
// post-match threads under the game's shirt panels, with the top comments), Your teams (each team's subreddit) and
// Banter (top posts from r/soccer, r/nfl and r/nba). All read-only, every post credits its subreddit and author and
// links back to Reddit. Prototype: a snapshot of real Reddit content (feed.js).
import { esc, icon, sg, ago } from '../util.js';
import { kitsFor, crest, inkOn, readable, hex } from '../identity.js';
import { skel, errorCard, scoreText } from '../ui.js';
import { feedGames, mineFirst, threadsOf, teamSubs, banter, redditId, snapAt, snapshot } from '../feed.js';
import { liveBar } from '../livebar.js';

const state = { f: 'all' };
const FILTERS = [['all', 'All'], ['games', 'Your games'], ['teams', 'Your teams'], ['banter', 'Banter']];
const KIND = { pre: 'Pre-match thread', match: 'Match thread', post: 'Post-match thread' };
const when = (iso) => ago(new Date(iso).getTime());
export const kindName = (t, g) => (g && g.sport !== 'soccer' ? KIND[t.kind].replace('match', 'game').replace('Match', 'Game') : KIND[t.kind]);

// One game's thread: its shirt panels, the thread's title, then the first top comments.
export function threadCard(g, t, others, n = 2, kit = true) {
  const k = kitsFor(g), done = g.state === 'post';
  const p = (x) => `<div class="p${x === k.right ? ' r' : ''}" style="background:${x.bg};color:${x.ink}">${x === k.right ? `<b>${esc(x.team.abbr)}</b>${crest(x.team, 22, true)}` : `${crest(x.team, 22, true)}<b>${esc(x.team.abbr)}</b>`}</div>`;
  const mid = g.state === 'pre' ? `<b>${sg(g.date).hm}</b><span>${sg(g.date).wd}</span>` : `<b>${scoreText(k, done)}</b><span>${g.state === 'in' ? '<i class="dot"></i>Live' : g.sport === 'soccer' ? 'FT' : 'Final'}</span>`;
  const cm = (t.comments || []).slice(0, n).map((c) => `<p class="cm"><span>${esc(c.by)}</span><span class="ct">${esc(c.text)}</span></p>`).join('');
  const more = others.map((o) => `<a class="also" href="#/fans/t/${esc(redditId(o.url))}">${esc(kindName(o, g))}${icon('chev')}</a>`).join('');
  return `<article class="thr"><a class="thl" href="#/fans/t/${esc(redditId(t.url))}" aria-label="${esc(`${kindName(t, g)}: ${t.title}. ${t.sub}, ${when(t.at)}. Read top comments`)}">${kit ? `<div class="tk">${p(k.left)}<div class="mid">${mid}</div>${p(k.right)}</div>` : ''}<div class="tb"><h3>${esc(t.title)}</h3><small>${esc(t.sub)} · ${esc(kindName(t, g))} · ${when(t.at)}</small></div>${cm}</a>${more}</article>`;
}
function yourGames(games, max) {
  const out = [];
  for (const { g } of games) {
    const ts = threadsOf(g.id);
    if (!ts.length) continue;
    // After the whistle the post-match thread leads; during the game, the match thread.
    const order = g.state === 'post' ? ['post', 'match', 'pre'] : g.state === 'in' ? ['match', 'pre', 'post'] : ['pre', 'match', 'post'];
    ts.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    out.push(threadCard(g, ts[0], ts.slice(1)));
    if (out.length >= max) break;
  }
  return out;
}

// A team's subreddit: a header in the team's kit, then its top posts (they open on Reddit).
function teamCard(t, games, max) {
  const g = games.find((x) => x.g.home.id === t.id || x.g.away.id === t.id)?.g;
  const team = g ? (g.home.id === t.id ? g.home : g.away) : { name: t.name, abbr: '', logo: '' };
  const bg = readable(hex(team.color) || '#3a3d45'), ink = inkOn(bg, hex(team.alt));
  const posts = (t.posts || []).slice(0, max).map((x) => post(x)).join('');
  return `<article class="card tsub"><a class="tsh" href="https://www.reddit.com/${esc(t.sub)}/" target="_blank" rel="noopener" style="background:${bg};color:${ink}">${crest(team, 30, true)}<span><b>${esc(t.sub)}</b><small>${esc(t.name)} fans · top today</small></span>${icon('chev')}</a>${posts}</article>`;
}
function post(p, showSub = false) {
  const img = p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
  return `<a class="pst${img ? ' im' : ''}" href="${esc(p.url)}" target="_blank" rel="noopener"><span class="pt2"><b>${esc(p.title)}</b>${p.text ? `<span class="tx">${esc(p.text)}</span>` : ''}<small>${showSub ? `${esc(p.sub)} · ` : ''}${esc(p.by)} · ${when(p.at)}</small></span>${img}</a>`;
}
function banterCards(list) {
  return list.map((p) => `<article class="card bnt">${post(p, true)}</article>`).join('');
}

export default function fans(params, ctx) {
  ctx.title = 'Fans';
  const at = snapAt(), sub = at ? `Snapshot · ${sg(at).d} ${sg(at).mo} ${sg(at).hm}` : '';
  let html = liveBar(ctx) + `<header class="top"><h1>Fans</h1><span class="sub">${esc(sub)}</span></header>`;
  html += `<div class="chips" role="group" aria-label="Show">${FILTERS.map(([f, name]) => `<button class="chip txt" data-act="ff" data-f="${f}" aria-pressed="${state.f === f}">${name}</button>`).join('')}</div>`;
  const s = ctx.use('feed:snap', snapshot, 10 * 60e3);
  const e = ctx.use('feed:games', feedGames, 5 * 60e3);
  if (!s.v) return html + (s.err ? errorCard('Couldn’t load the fan feed.') : skel(3));
  const games = e.v ? mineFirst(e.v).list : [];
  const f = state.f;
  if (f === 'all' || f === 'games') {
    const cards = e.v ? yourGames(games, f === 'all' ? 3 : 40) : [skel(2)];
    html += `<div class="sect"><h2 class="cap">Your games</h2>${f === 'all' && cards.length >= 3 ? '<button class="lnk" data-act="ff" data-f="games">See all</button>' : ''}</div>`;
    html += cards.length ? cards.join('') : '<div class="banner info"><span>No match threads for your games yet. They open about an hour before kick-off.</span></div>';
  }
  if (f === 'all' || f === 'teams') {
    const { list, all } = teamSubs();
    html += `<div class="sect"><h2 class="cap">Your teams</h2></div>`;
    if (all && list.length) html += '<div class="banner info"><span>You don’t follow these teams, so the snapshot’s teams are shown.</span></div>';
    html += list.length ? list.slice(0, f === 'all' ? 2 : 20).map((t) => teamCard(t, games, f === 'all' ? 3 : 8)).join('') : '<div class="banner info"><span>Follow a team to see its fans here.</span></div>';
  }
  if (f === 'all' || f === 'banter') {
    const b = banter();
    html += `<div class="sect"><h2 class="cap">Banter</h2><span>r/soccer, r/nfl, r/nba</span></div>`;
    html += b.length ? banterCards(f === 'all' ? b.slice(0, 6) : b) : '<div class="banner info"><span>Nothing here right now.</span></div>';
  }
  return html;
}
fans.actions = {
  ff(d, el, e, ctx) { state.f = d.f; scrollTo(0, 0); ctx.redraw(); },
};
