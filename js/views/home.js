// Home: "My games". Live first while a game is on, then results (newest first), then coming up (soonest first). All in SGT.
import { esc, sg, nightKey, nightToday, todayKey, addDays, keyRange, keyLabel, icon, ago } from '../util.js';
import { picks, followingAny, DEMO, load, save, sportOf, teamKey } from '../store.js';
import { gamesFor, isLive, soon, net, sortGames } from '../espn.js';
import { compLogo, compImg, kitsFor, crest, kitEdge } from '../identity.js';
import { gameRow, hero, skel, errorCard, scoreText, spoken, href } from '../ui.js';
import { calReady, status as calStatus } from '../cal.js';
import { useTables } from '../suggest.js';

let ver = 0;
// The sport filter lives for this visit only: a fresh start always opens on All, so no sport is ever hidden by surprise.
let cur = 'all';
// Older league results, opened with "4 more results since Sun" (for this visit).
let openOlder = false;
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
<div class="card">${QUICK.map((q) => `<div class="li">${compImg(q.item.logo, 32, q.item.name)}<span class="grow"><span class="t">${esc(q.item.name)}</span><small>${esc(q.sub)}</small></span><button class="btn sm go lite" data-act="follow" data-kind="${q.kind}" data-item="${esc(JSON.stringify(q.item))}" aria-label="Follow ${esc(q.item.name)}">${icon('plus')}Follow</button></div>`).join('')}</div>`;
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

// ---------- The season, a week at a time (Darren, 22 Oct 2026). The first screen covers 3 nights back to a week
// ahead; the next week loads as you near the bottom, earlier results on a tap. Beyond this week, games turn into
// compact one-line rows under month headings, so a long scroll stays tidy.
const MAX_WEEKS = 42; // about the rest of a football season
let more = 0, earlier = 0, curDay = null, pendingJump = null, homeCtx = null;
const placed = new WeakSet(); // strips already scrolled to today (a new screen makes a new strip)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = (k) => MONTHS[+k.slice(5, 7) - 1];

function chunks(ctx) {
  const tk = todayKey(), out = [];
  for (let i = 1; i <= more; i++) { const k0 = addDays(tk, 8 + 7 * (i - 1)); out.push(ctx.use(`mine:${ver}:+${i}`, () => gamesFor(picks, { k0, k1: addDays(k0, 6) }), 10 * 60e3)); }
  for (let j = 1; j <= earlier; j++) { const k1 = addDays(tk, -4 - 7 * (j - 1)); out.push(ctx.use(`mine:${ver}:-${j}`, () => gamesFor(picks, { k0: addDays(k1, -6), k1 }), 6 * 3600e3)); }
  return out;
}

export default function home(params, ctx) {
  if (!followingAny()) return empty();
  homeCtx = ctx;
  const s = sig();
  if (s !== lastSig) { lastSig = s; ver++; more = 0; earlier = 0; }
  const e = ctx.use(`mine:${ver}`, () => gamesFor(picks, { live: ctx.wasLive }), ctx.wasLive ? 10e3 : 60e3);
  let base = e.v?.games;
  let stale = null;
  if (e.v) save('snap', { t: Date.now(), sig: s, games: base });
  else { const snap = load('snap', null); if (snap?.sig === s) { base = snap.games; stale = snap.t; } }
  const ext = chunks(ctx);
  const loading = ext.some((x) => !x.v && !x.err);
  const byId = new Map();
  for (const g of [...(base || []), ...ext.flatMap((x) => x.v?.games || [])]) byId.set(g.id, g);
  const all = base ? sortGames([...byId.values()]) : null;

  // Sport filter: always there, so it's never a surprise; a sport you don't follow yet says so.
  const followed = new Set([...picks.comps, ...picks.teams, ...picks.games].map((x) => sportOf(x.path)));
  const f = cur;
  const keep = (g) => f === 'all' || g.sport === f;
  if (f !== 'all') ctx.sport = f;

  const t = nightToday();
  const sub = DEMO ? 'Sample picks · SGT' : e.v?.backup ? `Backup · updated ${sg(e.v.backup.at).hm}` : net.offline && net.staleSince ? `Offline · from ${ago(net.staleSince)}` : e.t ? `SGT · updated ${sg(e.t).hm}` : 'SGT';
  let html = `<header class="top"><h1>My games</h1><span class="sub">${esc(sub)}</span></header>` + calBanners(ctx);

  const games = all?.filter(keep);
  const liveIn = new Set((all || []).filter(isLive).map((g) => g.sport));
  const ahead = (games || []).filter((g) => g.state === 'pre' || g.postponed);
  // The date strip: the whole season, scrolling sideways. The highlighted day follows the list as you scroll.
  const days = keyRange(addDays(t, -7 * (earlier + 1)), addDays(t, 7 * (MAX_WEEKS + 1)));
  const has = new Set([...ahead.map((g) => nightKey(g.date)), ...(e.v?.season || []).filter(() => f === 'all')]);
  const on = curDay || t;
  html += `<div class="filterbar"><div class="days" role="group" aria-label="Jump to a day">${days.map((k) => { const x = sg(k + 'T04:00:00Z'); return `<button class="${k === t ? 'today ' : ''}${k === on ? 'cur ' : ''}${has.has(k) ? 'has' : ''}${x.d === 1 ? ' m1' : ''}" data-act="jump" data-k="${k}" aria-label="${k === t ? 'Today, ' : ''}${x.wdl} ${x.d} ${x.mo}${has.has(k) ? ', games' : ''}"${k === on ? ' aria-current="date"' : ''}>${x.wd}<b>${x.d}</b></button>`; }).join('')}</div>`
    + `<div class="chips" role="group" aria-label="Sport">${SPORTS.map(([k, l]) => { const hid = f !== 'all' && k !== f && (k === 'all' ? [...liveIn].some((s) => s !== f) : liveIn.has(k)); return `<button class="chip txt" data-act="sport" data-s="${k}" aria-pressed="${f === k}"${hid ? ` aria-label="${l}, game live now"` : ''}>${hid ? '<i class="dot" aria-hidden="true"></i>' : ''}${l}</button>`; }).join('')}<span class="stripm" aria-hidden="true">${monthOf(on)}</span></div></div>`;
  setTimeout(() => { placeStrip(); track(); }, 0);

  if (!games) return html + (e.err ? errorCard() : skel(4, true));
  if (e.v?.backup) html += `<div class="banner amber">${icon('wifi')}<span>ESPN isn’t answering, so these games come from the backup${e.v.backup.espnOkAt ? ` (ESPN last answered at ${sg(e.v.backup.espnOkAt).hm})` : ''}. Live scores pause until ESPN is back. It switches back on its own.</span></div>`;
  else if (e.err && stale) html += `<div class="banner amber">${icon('wifi')}<span>Can’t reach the score feed. Showing games from ${ago(stale)}.</span></div>`;
  else if (e.v?.failed) html += `<div class="banner amber">${icon('alert')}<span>${e.v.failed} of your picks didn’t load. Showing the rest. It will try again.</span></div>`;

  useTables(ctx, all.filter((g) => g.state === 'pre' && nightKey(g.date) <= addDays(t, 6)).map((g) => g.path)); // reasons that need a league table
  ctx.live = all.some(isLive) || all.some(soon);
  ctx.wasLive = ctx.live;

  const label = SPORTS.find(([k]) => k === f)[1];
  if (f !== 'all' && !followed.has(f)) {
    return html + `<div class="empty"><h2>No ${label} yet</h2><p>You don’t follow any ${label} teams or leagues.</p><a class="btn go" href="#/follow">Find ${label} to follow</a></div>`;
  }
  // Live now first while a game is on, so a quick score check never needs a scroll. Then results, newest
  // at the top. Then what's coming, soonest at the top, one section per viewing night.
  const results = games.filter((g) => g.state === 'post' && !g.postponed).reverse();
  const live = games.filter(isLive);
  if (live.length) html += `<div class="sect"><h2 class="cap">Live now</h2></div>${live.map(hero).join('')}`;
  const since = earlier ? `Since ${keyLabel(addDays(todayKey(), -3 - 7 * earlier))}` : `Since ${sg(addDays(t, -3) + 'T04:00:00Z').wd}`;
  if (results.length || earlier) html += `<div class="sect"><h2 class="cap">Results</h2><span>${since}</span></div>${resultRows(results, t)}`;
  // NFL counts in weeks (R4): "Week 8", or "Weeks 7–8" across a week boundary.
  const soonWk = ahead.filter((g) => nightKey(g.date) <= addDays(t, 6));
  const wk = f === 'football' ? [...new Set(soonWk.map((g) => g.week).filter(Boolean))].sort((a, b) => a - b) : [];
  const wkTxt = wk.length ? `<span>${wk.length > 1 ? `Weeks ${wk[0]}–${wk[wk.length - 1]}` : `Week ${wk[0]}`}</span>` : '';
  if (ahead.length) html += `<div class="sect" id="coming"><h2 class="cap">Coming up</h2>${wkTxt}</div>`;
  // This week in full rows, one section per night; after that, month headings with compact rows.
  let day = '', month = '';
  for (const g of ahead) {
    const k = nightKey(g.date), far = k > addDays(t, 6);
    if (far && k.slice(0, 7) !== month) { if (day) { html += '</section>'; day = ''; } month = k.slice(0, 7); html += `<div class="sect month"><h2 class="cap">${monthOf(k)}${k.slice(0, 4) !== t.slice(0, 4) ? ` ${k.slice(0, 4)}` : ''}</h2></div>`; }
    if (k !== day) { html += `${day ? '</section>' : ''}<section id="d-${k}"><h3 class="dayh${far ? ' sm' : ''}">${keyLabel(k)}</h3>`; day = k; }
    html += far ? compactRow(g) : gameRow(g);
  }
  if (day) html += '</section>';
  // A quiet stretch: keep loading weeks until something shows (or the season runs out).
  if (!loading && !ahead.length && !live.length && more < 8) setTimeout(() => { if (homeCtx === ctx && more < 8) { more++; ctx.redraw(); } }, 0);
  if (!ahead.length && !live.length && !loading && more >= 8) html += `<div class="empty"><h2>Quiet weeks</h2><p>None of your ${f === 'all' ? 'picks' : `${label} picks`} play in the next two months.</p><a class="btn go" href="#/week">See games that suit you</a></div>`;
  if (loading) html += `<p class="status">${icon('clock')}<span>Loading the next week…</span></p>${skel(2)}`;
  else if (more >= MAX_WEEKS) html += `<p class="foot">That’s as far ahead as Matchday looks.</p>`;
  if (pendingJump && !loading) setTimeout(() => { const k = pendingJump; pendingJump = null; home.actions.jump({ k }); }, 0);
  return html + `<p class="foot" id="homefoot">Times are Singapore time. Scores refresh every 10 seconds while a game is live and this screen is open.</p>`;
}

// One line per game for later weeks and older results: kits, codes, time or score. Tap for the full game.
function compactRow(g) {
  const k = kitsFor(g), s = sg(g.date);
  const p = (x, r) => `<div class="p${r ? ' r' : ''}${kitEdge(x)}" style="background:${x.bg};color:${x.ink}">${r ? `<b>${esc(x.team.abbr || x.team.short)}</b>${crest(x.team, 18, true)}` : `${crest(x.team, 18, true)}<b>${esc(x.team.abbr || x.team.short)}</b>`}</div>`;
  const mid = g.state === 'post' ? `<b>${scoreText(k, true)}</b>` : g.postponed ? '<b>PP</b>' : `<b>${g.timeValid ? s.hm : 'TBC'}</b>`;
  return `<a class="crow${g.state === 'post' ? ' done' : ''}" href="${href.match(g)}" aria-label="${esc(spoken(g, k))}">${p(k.left)}<div class="mid">${mid}</div>${p(k.right, true)}</a>`;
}

// Today's and yesterday's results in full. Older ones show only your teams' games; the rest of a followed
// league folds into one button, then "Earlier results" goes back a week at a time (compact rows).
const yourTeam = (g) => picks.teams.some((x) => teamKey(x.path, x.id) === teamKey(g.path, g.home.id) || teamKey(x.path, x.id) === teamKey(g.path, g.away.id)) || picks.games.some((x) => x.id === g.id);
function resultRows(results, t) {
  const edge = addDays(t, -3);
  const recent = results.filter((g) => nightKey(g.date) >= edge), past = results.filter((g) => nightKey(g.date) < edge);
  const old = (g) => nightKey(g.date) < addDays(t, -1) && !yourTeam(g);
  const hidden = recent.filter(old);
  let html;
  if (openOlder || !hidden.length) html = recent.map((g) => (g === hidden[0] ? gameRow(g).replace('<a class="row', '<a id="r-older" class="row') : gameRow(g))).join('');
  else html = recent.filter((g) => !old(g)).map((g) => gameRow(g)).join('') + `<button class="btn ghost more" data-act="older">${hidden.length} more result${hidden.length > 1 ? 's' : ''} since ${sg(edge + 'T04:00:00Z').wd}</button>`;
  // Earlier weeks: compact, under month and day headings, newest first.
  let day = '', month = '';
  for (const g of past) {
    const k = nightKey(g.date);
    if (k.slice(0, 7) !== month) { month = k.slice(0, 7); html += `<div class="sect month"><h2 class="cap">${monthOf(k)}</h2></div>`; day = ''; }
    if (k !== day) { html += `<h3 class="dayh sm" id="r-${k}">${keyLabel(k)}</h3>`; day = k; }
    html += compactRow(g);
  }
  if (openOlder || !hidden.length) html += `<button class="btn ghost more" data-act="earlier">${icon('up')}Earlier results</button>`;
  return html;
}

const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const barH = () => (document.querySelector('.filterbar')?.offsetHeight || 0) + 4;
const onHome = () => !location.hash || location.hash === '#/' || location.hash === '#';

// The strip opens with today at its left edge (keeping the scroll you left it at after that).
function placeStrip() {
  const strip = document.querySelector('.filterbar .days'), b = strip?.querySelector('.today');
  if (!strip || !b || placed.has(strip)) return;
  strip.scrollLeft = b.offsetLeft - strip.offsetLeft - 14;
  placed.add(strip);
}
// Follow the scroll: the day at the top of the list is the highlighted one, and the strip slides to keep it in
// view. Near the bottom, the next week loads.
function track() {
  if (!onHome()) return;
  const bar = document.querySelector('.filterbar');
  if (!bar) return;
  const line = bar.getBoundingClientRect().bottom + 12;
  let k = nightToday();
  for (const sec of document.querySelectorAll('#view section[id^="d-"]')) { if (sec.getBoundingClientRect().top <= line) k = sec.id.slice(2); else break; }
  if (k !== curDay) {
    curDay = k;
    const strip = bar.querySelector('.days');
    strip.querySelector('.cur')?.removeAttribute('aria-current');
    strip.querySelector('.cur')?.classList.remove('cur');
    const btn = strip.querySelector(`[data-k="${k}"]`);
    if (btn) {
      btn.classList.add('cur'); btn.setAttribute('aria-current', 'date');
      const l = btn.offsetLeft - strip.offsetLeft, r = l + btn.offsetWidth;
      if (l < strip.scrollLeft + 8 || r > strip.scrollLeft + strip.clientWidth - 8) strip.scrollTo({ left: l - strip.clientWidth / 2 + btn.offsetWidth / 2, behavior: smooth() });
    }
    const m = bar.querySelector('.stripm'); if (m) m.textContent = monthOf(k);
  }
  if (innerHeight + scrollY > document.documentElement.scrollHeight - 900 && more < MAX_WEEKS && homeCtx && !document.querySelector('#view .skel')) { more++; homeCtx.redraw(); }
}
let tr = 0;
addEventListener('scroll', () => { clearTimeout(tr); tr = setTimeout(track, 40); }, { passive: true });

home.actions = {
  // Tap a day: jump to it, loading weeks up to it first if it's further ahead. A day without games goes to the next one that has some.
  jump(d) {
    const k = d.k, t = nightToday();
    if (k < addDays(t, -3)) { // an earlier day: load results back to it, then show its heading
      const need = Math.ceil((Number(new Date(addDays(t, -3))) - Number(new Date(k))) / (7 * 864e5));
      if (earlier < need) { earlier = need; openOlder = true; pendingJump = k; homeCtx?.redraw(); return; }
      const h = document.getElementById(`r-${k}`) || [...document.querySelectorAll('#view [id^="r-2"]')].reverse().find((x) => x.id.slice(2) <= k);
      if (h) scrollTo({ top: h.getBoundingClientRect().top + scrollY - barH(), behavior: smooth() });
      return;
    }
    if (k > addDays(t, 6)) {
      const need = Math.ceil((Number(new Date(k)) - Number(new Date(addDays(todayKey(), 7)))) / (7 * 864e5));
      if (more < need) { more = Math.min(MAX_WEEKS, need); pendingJump = k; homeCtx?.redraw(); return; }
    }
    if (k <= t) { scrollTo({ top: 0, behavior: smooth() }); return; }
    const el = document.getElementById(`d-${k}`) || [...document.querySelectorAll('#view section[id^="d-"]')].find((x) => x.id.slice(2) >= k);
    scrollTo({ top: el ? el.getBoundingClientRect().top + scrollY - barH() : 0, behavior: smooth() });
  },
  // Tapping a sport shows that sport and goes straight to its next game (Coming up, soonest first).
  // The button goes away when the day opens, so move focus to the first row it revealed (VoiceOver and keyboard).
  older(d, el, e, ctx) { openOlder = true; ctx.redraw(); requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('r-older')?.focus())); },
  earlier(d, el, e, ctx) { earlier++; ctx.redraw(); },
  sport(d, el, e, ctx) {
    cur = d.s; ctx.redraw();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById('coming');
      scrollTo({ top: el ? Math.max(0, el.getBoundingClientRect().top + scrollY - barH()) : 0, behavior: smooth() });
    }));
  },
};
