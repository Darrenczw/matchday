// Home: "My games". One timeline, oldest result first, opening at the latest game. All in SGT.
import { esc, sg, todayKey, addDays, keyRange, keyLabel, icon, ago } from '../util.js';
import { picks, followingAny, DEMO, load, save, settings, set, sportOf } from '../store.js';
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

const SPORTS = [['all', 'All'], ['soccer', 'Football'], ['football', 'NFL'], ['basketball', 'NBA']];

export default function home(params, ctx) {
  if (!followingAny()) return empty();
  const s = sig();
  if (s !== lastSig) { lastSig = s; ver++; }
  const e = ctx.use(`mine:${ver}`, () => gamesFor(picks, { live: ctx.wasLive }), ctx.wasLive ? 10e3 : 60e3);
  let all = e.v?.games;
  let stale = null;
  if (e.v) save('snap', { t: Date.now(), sig: s, games: all });
  else { const snap = load('snap', null); if (snap?.sig === s) { all = snap.games; stale = snap.t; } }

  // Sport filter: always there, so it's never a surprise; a sport you don't follow yet says so.
  const followed = new Set([...picks.comps, ...picks.teams, ...picks.games].map((x) => sportOf(x.path)));
  const f = SPORTS.some(([k]) => k === settings.homeSport) ? settings.homeSport : 'all';
  const keep = (g) => f === 'all' || g.sport === f;

  const t = todayKey();
  const sub = DEMO ? 'Sample picks · SGT' : net.offline && net.staleSince ? `Offline · from ${ago(net.staleSince)}` : e.t ? `SGT · updated ${sg(e.t).hm}` : 'SGT';
  let html = `<header class="top"><h1>My games</h1><span class="sub">${esc(sub)}</span></header>`;
  html += `<div class="filterbar"><div class="chips" role="group" aria-label="Sport">${SPORTS.map(([k, l]) => `<button class="chip txt" data-act="sport" data-s="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div></div>`;

  const games = all?.filter(keep);
  const days = keyRange(t, addDays(t, 6));
  const has = new Set((games || []).filter((g) => g.state !== 'post').map((g) => sg(g.date).key));
  html += `<div class="days" role="list">${days.map((k) => { const x = sg(k + 'T04:00:00Z'); return `<button role="listitem" class="${k === t ? 'today ' : ''}${has.has(k) ? 'has' : ''}" data-act="jump" data-k="${k}" ${has.has(k) || k === t ? '' : 'disabled'} aria-label="${x.wdl} ${x.d} ${x.mo}${has.has(k) ? ', has games' : ', no games'}">${x.wd}<b>${x.d}</b></button>`; }).join('')}</div>`;

  if (!games) return html + (e.err ? errorCard() : skel(4, true));
  if (e.err && stale) html += `<div class="banner amber">${icon('wifi')}<span>Can’t reach the score feed. Showing games from ${ago(stale)}.</span></div>`;
  else if (e.v?.failed) html += `<div class="banner amber">${icon('alert')}<span>${e.v.failed} of your picks didn’t load. Showing the rest. It will try again.</span></div>`;

  ctx.live = all.some(isLive) || all.some(soon);
  ctx.wasLive = ctx.live;

  // One timeline, oldest first. The screen opens at "now": the latest live or finished game (id="now").
  const started = games.filter((g) => g.state !== 'pre');
  const nowId = (games.filter(isLive)[0] || started[started.length - 1])?.id;
  const byDay = new Map();
  for (const g of games) { const k = sg(g.date).key; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(g); }
  for (const [k, list] of byDay) {
    const done = list.filter((g) => g.state === 'post').length;
    const rows = list.map((g) => {
      const html = isLive(g) ? hero(g) : gameRow(g);
      return g.id === nowId ? html.replace(/^<a /, '<a id="now" ') : html;
    }).join('');
    html += `<section id="d-${k}"><div class="sect"><h2 class="cap">${keyLabel(k)}</h2>${k === t && done && done < list.length ? `<span>${done} finished</span>` : ''}</div>${rows}</section>`;
  }
  const later = (e.v?.later || []).filter(keep);
  const label = SPORTS.find(([k]) => k === f)[1];
  if (f !== 'all' && !followed.has(f)) html += `<div class="empty"><h2>No ${label} yet</h2><p>You don’t follow any ${label} teams or leagues.</p><a class="btn go" href="#/follow">Find ${label} to follow</a></div>`;
  else if (!games.some((g) => g.state !== 'post') && !later.length) html += `<div class="empty"><h2>Quiet week</h2><p>None of your ${f === 'all' ? 'picks' : `${label} picks`} play in the next 7 days.</p><a class="btn go" href="#/week">See games that suit you</a></div>`;
  if (later.length) html += `<div class="sect"><h2 class="cap">Later</h2><span>Next game for teams with none this week</span></div>${later.map((g) => gameRow(g)).join('')}`;
  html += `<p class="foot">Times are Singapore time. Scores refresh every 10 seconds while a game is live and this screen is open.</p><i data-ready hidden></i>`;
  return html;
}

const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const barH = () => (document.querySelector('.filterbar')?.offsetHeight || 0) + 6;
// Where "now" is: the most recent game at the top, with its day label when it opens the day.
function nowTop() {
  const el = document.getElementById('now');
  if (!el) return 0;
  const sec = el.closest('section');
  const target = sec && sec.querySelector('.row, .hero') === el ? sec : el;
  return Math.max(0, target.getBoundingClientRect().top + scrollY - barH());
}
// Called by the app after drawing; returns false until the games are on screen.
home.anchor = (behavior = 'auto') => {
  if (!document.querySelector('[data-ready]')) return false;
  scrollTo({ top: nowTop(), behavior });
  return true;
};
// Tapping My games while on it: go to "now"; tap again there to go to the very top.
home.tabTap = () => {
  const y = nowTop();
  scrollTo({ top: Math.abs(scrollY - y) < 8 ? 0 : y, behavior: smooth() });
};

home.actions = {
  jump(d) {
    const el = document.getElementById(`d-${d.k}`);
    scrollTo({ top: el ? el.getBoundingClientRect().top + scrollY - barH() : 0, behavior: smooth() });
  },
  sport(d) { set('homeSport', d.s); requestAnimationFrame(() => requestAnimationFrame(() => home.anchor())); },
};
