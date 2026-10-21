// Home: "My games". Results (newest first), then live, then coming up (soonest first). All in SGT.
import { esc, sg, todayKey, addDays, keyRange, keyLabel, icon, ago } from '../util.js';
import { picks, followingAny, DEMO, load, save, settings, set, sportOf } from '../store.js';
import { gamesFor, isLive, soon, net } from '../espn.js';
import { compLogo, compImg } from '../identity.js';
import { gameRow, hero, skel, errorCard } from '../ui.js';
import { calReady, status as calStatus } from '../cal.js';

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
<div class="card">${QUICK.map((q) => `<div class="li">${compImg(q.item.logo, 32, q.item.name)}<span class="grow"><span class="t">${esc(q.item.name)}</span><small>${esc(q.sub)}</small></span><button class="btn sm go lite" data-act="follow" data-kind="${q.kind}" data-item="${esc(JSON.stringify(q.item))}">${icon('plus')}Follow</button></div>`).join('')}</div>`;
}

// Calendar lag watch and failures (PRD 7.9): amber when a change hasn't reached the iPhone yet,
// red when the helper stops checking or the iPhone stops fetching.
function calBanners(ctx) {
  if (!calReady()) return '';
  const st = ctx.use('calstatus', calStatus, 60e3).v;
  if (!st) return '';
  const now = Date.now(), out = [];
  if (st.lastCheck && now - st.lastCheck > 30 * 60e3) out.push(`<div class="banner red">${icon('alert')}<span>Calendar not updated since ${sg(st.lastCheck).hm}. Kick-off times there may be out of date.</span></div>`);
  if (st.lastFetch && now - st.lastFetch.at > 2 * 3600e3) out.push(`<div class="banner red">${icon('alert')}<span>Your iPhone hasn’t fetched the calendar since ${sg(st.lastFetch.at).hm}. Open the Calendar app to refresh.</span></div>`);
  const moved = st.pending.find((p) => p.prev_start), off = st.pending.find((p) => p.status === 'postponed');
  const name = (p) => (p.sport === 'soccer' ? `${p.home} v ${p.away}` : `${p.away} @ ${p.home}`);
  if (moved) { const n = sg(moved.start_utc); out.push(`<div class="banner amber">${icon('clock')}<span>${esc(name(moved))}: kick-off moved to ${n.wd} ${n.hm}. Your Calendar app hasn’t picked it up yet. Open Calendar to refresh.</span></div>`); }
  else if (off) out.push(`<div class="banner amber">${icon('alert')}<span>${esc(name(off))} is postponed. Your Calendar app hasn’t picked it up yet. Open Calendar to refresh.</span></div>`);
  else if (st.pending.length) out.push(`<div class="banner amber">${icon('cal')}<span>${st.pending.length} calendar change${st.pending.length > 1 ? 's' : ''} not on your iPhone yet. Open the Calendar app to refresh.</span></div>`);
  const u = st.unconfirmed?.[0];
  if (u) { const t = u.second_start && sg(u.second_start); out.push(`<div class="banner amber">${icon('alert')}<span>${esc(name(u))}: time unconfirmed. ${t ? `ESPN and TheSportsDB disagree (TheSportsDB says ${t.wd} ${t.hm}).` : 'TheSportsDB lists it as postponed.'} Your calendar shows ESPN’s time until they agree.${st.unconfirmed.length > 1 ? ` ${st.unconfirmed.length - 1} more game${st.unconfirmed.length > 2 ? 's' : ''} like this.` : ''}</span></div>`); }
  return out.join('');
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
  if (f !== 'all') ctx.sport = f;

  const t = todayKey();
  const sub = DEMO ? 'Sample picks · SGT' : e.v?.backup ? `Backup · updated ${sg(e.v.backup.at).hm}` : net.offline && net.staleSince ? `Offline · from ${ago(net.staleSince)}` : e.t ? `SGT · updated ${sg(e.t).hm}` : 'SGT';
  let html = `<header class="top"><h1>My games</h1><span class="sub">${esc(sub)}</span></header>` + calBanners(ctx);

  const games = all?.filter(keep);
  const liveIn = new Set((all || []).filter(isLive).map((g) => g.sport));
  const ahead = (games || []).filter((g) => g.state === 'pre' || g.postponed);
  // Dates, then the sport filter, in one bar that stays at the top.
  const days = keyRange(t, addDays(t, 6));
  const has = new Set(ahead.map((g) => sg(g.date).key));
  html += `<div class="filterbar"><div class="days" role="list">${days.map((k) => { const x = sg(k + 'T04:00:00Z'); return `<button role="listitem" class="${k === t ? 'today ' : ''}${has.has(k) ? 'has' : ''}" data-act="jump" data-k="${k}" ${has.has(k) || k === t ? '' : 'disabled'} aria-label="${x.wdl} ${x.d} ${x.mo}${has.has(k) ? ', has games' : ', no games'}">${x.wd}<b>${x.d}</b></button>`; }).join('')}</div>`
    + `<div class="chips" role="group" aria-label="Sport">${SPORTS.map(([k, l]) => { const hid = f !== 'all' && k !== f && (k === 'all' ? [...liveIn].some((s) => s !== f) : liveIn.has(k)); return `<button class="chip txt" data-act="sport" data-s="${k}" aria-pressed="${f === k}"${hid ? ` aria-label="${l}, game live now"` : ''}>${hid ? '<i class="dot" aria-hidden="true"></i>' : ''}${l}</button>`; }).join('')}</div></div>`;

  if (!games) return html + (e.err ? errorCard() : skel(4, true));
  if (e.v?.backup) html += `<div class="banner amber">${icon('wifi')}<span>ESPN isn’t answering, so these games come from the backup${e.v.backup.espnOkAt ? ` (ESPN last answered at ${sg(e.v.backup.espnOkAt).hm})` : ''}. Live scores pause until ESPN is back. It switches back on its own.</span></div>`;
  else if (e.err && stale) html += `<div class="banner amber">${icon('wifi')}<span>Can’t reach the score feed. Showing games from ${ago(stale)}.</span></div>`;
  else if (e.v?.failed) html += `<div class="banner amber">${icon('alert')}<span>${e.v.failed} of your picks didn’t load. Showing the rest. It will try again.</span></div>`;

  ctx.live = all.some(isLive) || all.some(soon);
  ctx.wasLive = ctx.live;

  const label = SPORTS.find(([k]) => k === f)[1];
  if (f !== 'all' && !followed.has(f)) {
    return html + `<div class="empty"><h2>No ${label} yet</h2><p>You don’t follow any ${label} teams or leagues.</p><a class="btn go" href="#/follow">Find ${label} to follow</a></div>`;
  }
  // Results first, newest at the top. Then anything live. Then what's coming, soonest at the top.
  // While a game is on, Live now comes first so a quick score check never needs a scroll.
  const results = games.filter((g) => g.state === 'post' && !g.postponed).reverse();
  const live = games.filter(isLive);
  if (live.length) html += `<div class="sect"><h2 class="cap">Live now</h2></div>${live.map(hero).join('')}`;
  if (results.length) html += `<div class="sect"><h2 class="cap">Results</h2><span>Last 3 days</span></div>${results.map((g) => gameRow(g)).join('')}`;
  // NFL counts in weeks (R4): "Week 8", or "Weeks 7–8" across a week boundary.
  const wk = f === 'football' ? [...new Set(ahead.map((g) => g.week).filter(Boolean))].sort((a, b) => a - b) : [];
  const wkTxt = wk.length ? `<span>${wk.length > 1 ? `Weeks ${wk[0]}–${wk[wk.length - 1]}` : `Week ${wk[0]}`}</span>` : '';
  if (ahead.length) html += `<div class="sect" id="coming"><h2 class="cap">Coming up</h2>${wkTxt}</div>`;
  let day = '';
  for (const g of ahead) {
    const k = sg(g.date).key;
    if (k !== day) { html += `${day ? '</section>' : ''}<section id="d-${k}"><h3 class="dayh">${keyLabel(k)}</h3>`; day = k; }
    html += gameRow(g);
  }
  if (day) html += '</section>';
  const later = (e.v?.later || []).filter(keep);
  if (!ahead.length && !live.length && !later.length) html += `<div class="empty"><h2>Quiet week</h2><p>None of your ${f === 'all' ? 'picks' : `${label} picks`} play in the next 7 days.</p><a class="btn go" href="#/week">See games that suit you</a></div>`;
  if (later.length) html += `<div class="sect"><h2 class="cap">Later</h2><span>Next game for teams with none this week</span></div>${later.map((g) => gameRow(g)).join('')}`;
  return html + `<p class="foot">Times are Singapore time. Scores refresh every 10 seconds while a game is live and this screen is open.</p>`;
}

const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const barH = () => (document.querySelector('.filterbar')?.offsetHeight || 0) + 4;

home.actions = {
  jump(d) {
    const el = document.getElementById(`d-${d.k}`);
    scrollTo({ top: el ? el.getBoundingClientRect().top + scrollY - barH() : 0, behavior: smooth() });
  },
  // Tapping a sport shows that sport and goes straight to its next game (Coming up, soonest first).
  sport(d) {
    set('homeSport', d.s);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById('coming');
      scrollTo({ top: el ? Math.max(0, el.getBoundingClientRect().top + scrollY - barH()) : 0, behavior: smooth() });
    }));
  },
};
