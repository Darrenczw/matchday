// Home: "My games". Live first, then each day ahead, then recent results. All in SGT (PRD 7.4).
import { esc, sg, todayKey, addDays, keyRange, keyLabel, icon, ago } from '../util.js';
import { picks, followingAny, DEMO, load, save } from '../store.js';
import { gamesFor, isLive, soon, net } from '../espn.js';
import { compLogo, compImg } from '../identity.js';
import { gameRow, hero, skel, errorCard } from '../ui.js';

let ver = 0;
const sig = () => JSON.stringify(picks);
let lastSig = '';

const QUICK = [
  { kind: 'comp', item: { path: 'soccer/eng.1', name: 'Premier League', logo: compLogo('soccer/eng.1', '23') }, sub: 'Every Premier League game' },
  { kind: 'comp', item: { path: 'football/nfl', name: 'NFL', logo: compLogo('football/nfl') }, sub: 'The whole league, all 32 teams' },
  { kind: 'comp', item: { path: 'basketball/nba', name: 'NBA', logo: compLogo('basketball/nba') }, sub: 'The whole league, all 30 teams' },
];

function empty() {
  return `<header class="top"><h1>My games</h1><span class="sub">SGT</span></header>
<section class="empty"><h2>Pick what you follow</h2><p>Matchday shows only your games: clubs, national teams, whole leagues or single games. Nothing is picked for you.</p>
<a class="btn go big" href="#/follow">${icon('search')}Find clubs and leagues</a></section>
<div class="sect"><h2 class="cap">Or start with a whole league</h2></div>
<div class="card">${QUICK.map((q) => `<div class="li">${compImg(q.item.logo, 32, q.item.name)}<span class="grow"><span class="t">${esc(q.item.name)}</span><small>${esc(q.sub)}</small></span><button class="btn sm go" data-act="follow" data-kind="${q.kind}" data-item="${esc(JSON.stringify(q.item))}">${icon('plus')}Follow</button></div>`).join('')}</div>`;
}

export default function home(params, ctx) {
  if (!followingAny()) return empty();
  const s = sig();
  if (s !== lastSig) { lastSig = s; ver++; }
  const e = ctx.use(`mine:${ver}`, () => gamesFor(picks, { live: ctx.wasLive }), ctx.wasLive ? 10e3 : 60e3);
  let games = e.v?.games;
  let stale = null;
  if (e.v) save('snap', { t: Date.now(), sig: s, games });
  else { const snap = load('snap', null); if (snap?.sig === s) { games = snap.games; stale = snap.t; } }

  const t = todayKey();
  const sub = DEMO ? 'Sample picks · SGT' : net.offline && net.staleSince ? `Offline · from ${ago(net.staleSince)}` : e.t ? `SGT · updated ${sg(e.t).hm}` : 'SGT';
  let html = `<header class="top"><h1>My games</h1><span class="sub">${esc(sub)}</span></header>`;

  const days = keyRange(t, addDays(t, 6));
  const has = new Set((games || []).filter((g) => g.state !== 'post').map((g) => sg(g.date).key));
  html += `<div class="days" role="list">${days.map((k) => { const x = sg(k + 'T04:00:00Z'); return `<button role="listitem" class="${k === t ? 'today ' : ''}${has.has(k) ? 'has' : ''}" data-act="jump" data-k="${k}" ${has.has(k) || k === t ? '' : 'disabled'} aria-label="${x.wdl} ${x.d} ${x.mo}${has.has(k) ? ', has games' : ', no games'}">${x.wd}<b>${x.d}</b></button>`; }).join('')}</div>`;

  if (!games) return html + (e.err ? errorCard() : skel(4, true));
  if (e.err && stale) html += `<div class="banner amber">${icon('wifi')}<span>Can’t reach the score feed. Showing games from ${ago(stale)}.</span></div>`;
  else if (e.v?.failed) html += `<div class="banner amber">${icon('alert')}<span>${e.v.failed} of your picks didn’t load. Showing the rest. It will try again.</span></div>`;

  const live = games.filter(isLive);
  ctx.live = live.length > 0 || games.some(soon);
  ctx.wasLive = ctx.live;
  if (live.length) html += `<div class="sect"><h2 class="cap">Live now</h2></div>` + live.map(hero).join('');

  const ahead = games.filter((g) => g.state === 'pre');
  let any = false;
  for (const k of keyRange(t, addDays(t, 7))) {
    const list = ahead.filter((g) => sg(g.date).key === k);
    const done = k === t ? games.filter((g) => g.state === 'post' && sg(g.date).key === k) : [];
    if (!list.length && !done.length) continue;
    any = true;
    html += `<section id="d-${k}"><div class="sect"><h2 class="cap">${keyLabel(k)}</h2>${k === t && done.length ? `<span>${done.length} finished</span>` : ''}</div>${list.map((g) => gameRow(g)).join('')}${done.map((g) => gameRow(g)).join('')}</section>`;
  }
  const later = e.v?.later || [];
  if (!any && !live.length && !later.length) html += `<div class="empty"><h2>Quiet week</h2><p>None of your picks play in the next 7 days.</p><a class="btn go" href="#/week">See games that suit you</a></div>`;

  if (later.length) html += `<div class="sect"><h2 class="cap">Later</h2><span>Next game for teams with none this week</span></div>${later.map((g) => gameRow(g)).join('')}`;

  const past = games.filter((g) => g.state === 'post' && sg(g.date).key < t).reverse();
  if (past.length) html += `<div class="sect"><h2 class="cap">Results</h2><span>Last 3 days</span></div>${past.map((g) => gameRow(g)).join('')}`;
  html += `<p class="foot">Times are Singapore time. Scores refresh every 10 seconds while a game is live and this screen is open.</p>`;
  return html;
}

home.actions = {
  jump(d) {
    const el = document.getElementById(`d-${d.k}`);
    scrollTo({ top: el ? el.getBoundingClientRect().top + scrollY - 8 : 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  },
};
