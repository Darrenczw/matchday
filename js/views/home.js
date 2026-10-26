// Home: "My games" (Darren, 26 Oct 2026, option A of "My games, take two"). One rule: finished games are in
// Results, games to come are in Fixtures, a live game sits on top of both. Results go newest first, Fixtures
// soonest first, under plain day headings (viewing nights, SGT). The app opens on Results every time.
import { esc, sg, nightKey, nightToday, todayKey, addDays, keyRange, keyLabel, icon, ago } from '../util.js';
import { picks, followingAny, DEMO, load, save, sportOf, teamKey } from '../store.js';
import { gamesFor, isLive, soon, net, sortGames, known } from '../espn.js';
import { compLogo, compImg, kitsFor, crest, kitEdge } from '../identity.js';
import { gameRow, hero, skel, errorCard, scoreText, spoken, href, cachedRow } from '../ui.js';
import { calReady, status as calStatus } from '../cal.js';
import { useTables, reasons, freeHour } from '../suggest.js';
import { prefetchVisible } from '../prefetch.js';

let ver = 0;
// The sport filter lives for this visit only: a fresh start always opens on All, so no sport is ever hidden by surprise.
let cur = 'all';
// Results or Fixtures. Every launch opens on Results (the morning score check), and so does coming back after
// more than 10 minutes away; in between, the tab you picked stays.
let tab = 'res';
const sig = () => JSON.stringify(picks);
let lastSig = '', snapAt = 0;

const QUICK = [
  { kind: 'comp', item: { path: 'soccer/eng.1', name: 'Premier League', logo: compLogo('soccer/eng.1', '23') }, sub: 'Every Premier League game' },
  { kind: 'comp', item: { path: 'football/nfl', name: 'NFL', logo: compLogo('football/nfl') }, sub: 'The whole league, all 32 teams' },
  { kind: 'comp', item: { path: 'basketball/nba', name: 'NBA', logo: compLogo('basketball/nba') }, sub: 'The whole league, all 30 teams' },
];

// The Games header: title and freshness on the left; This week and the Settings gear on the right, now that
// both left the tab bar (Darren picked the button on Games over a card in Follow, 22 Oct 2026).
const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.2h3.4l.5 2.4c.6.2 1.2.5 1.7.9l2.3-.8 1.7 2.9-1.8 1.6a6.6 6.6 0 010 2l1.8 1.6-1.7 2.9-2.3-.8c-.5.4-1.1.7-1.7.9l-.5 2.4h-3.4l-.5-2.4c-.6-.2-1.2-.5-1.7-.9l-2.3.8-1.7-2.9 1.8-1.6a6.6 6.6 0 010-2L4.1 8.6l1.7-2.9 2.3.8c.5-.4 1.1-.7 1.7-.9z"/><circle cx="12" cy="12" r="3"/></svg>';
function topBar(sub) {
  const wk = `<a class="btn sm ghost" href="#/week">${icon('cal')}This week</a>`;
  return `<header class="top gm"><div><h1>My games</h1><span class="sub">${esc(sub)}</span></div><span class="navr">${wk}<a class="btn sm icon ghost" href="#/settings" aria-label="Settings">${GEAR}</a></span></header>`;
}
function empty() {
  return `${topBar('SGT')}
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


// ---------- Data. The first load covers 3 nights back to a week ahead. Fixtures load the next week as you near
// the bottom; Results load the week before the same way (or with "Earlier results").
const MAX_WEEKS = 42; // about the rest of a football season
const MAX_BACK = 26; // about half a year of results
let more = 0, earlier = 0, curDay = null, pendingJump = null, homeCtx = null;
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
  // Saved once per fresh load (not on every 5 s redraw), so the next launch can show it at once.
  if (e.v) { if (snapAt !== e.t) { snapAt = e.t; save('snap', { t: Date.now(), sig: s, games: base }); } }
  else {
    const snap = load('snap', null);
    if (snap?.sig === s) {
      base = snap.games; stale = snap.t;
      // The saved copy also gives match pages their header at once, before the feed answers.
      for (const g of base) if (!known.has(g.id)) known.set(g.id, g);
    }
  }
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
  let html = topBar(sub) + calBanners(ctx);

  const games = all?.filter(keep);
  const liveIn = new Set((all || []).filter(isLive).map((g) => g.sport));
  const ahead = (games || []).filter((g) => g.state === 'pre' || g.postponed);
  const results = (games || []).filter((g) => g.state === 'post' && !g.postponed);
  // The sticky bar: sport chips with the date button, then the Results / Fixtures switch.
  const days = keyRange(addDays(t, -91), addDays(t, 7 * (MAX_WEEKS + 1)));
  const has = new Set([...ahead, ...results].map((g) => nightKey(g.date)).concat((e.v?.season || []).filter(() => f === 'all')));
  const on = curDay || t;
  html += `<div class="filterbar">`
    + `<div class="chips" role="group" aria-label="Sport">${SPORTS.map(([k, l]) => { const hid = f !== 'all' && k !== f && (k === 'all' ? [...liveIn].some((s) => s !== f) : liveIn.has(k)); return `<button class="chip txt" data-act="sport" data-s="${k}" aria-pressed="${f === k}"${hid ? ` aria-label="${l}, game live now"` : ''}>${hid ? '<i class="dot" aria-hidden="true"></i>' : ''}${l}</button>`; }).join('')}<button class="stripm" data-act="pick" aria-haspopup="dialog" aria-label="Go to a date. Showing ${monthOf(on)}"><b>${monthOf(on)}</b>${icon('cal')}</button></div>`
    + `<div class="seg" role="group" aria-label="Results or fixtures">${[['res', 'Results'], ['fix', 'Fixtures']].map(([k, l]) => `<button data-act="tab" data-t="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div></div>`;
  if (pick) html += picker(days, t, on, has);
  setTimeout(() => track(false), 0);

  if (!games) return html + (e.err ? errorCard() : skel(4, true));
  if (e.v?.backup) html += `<div class="banner amber">${icon('wifi')}<span>ESPN isn’t answering, so these games come from the backup${e.v.backup.espnOkAt ? ` (ESPN last answered at ${sg(e.v.backup.espnOkAt).hm})` : ''}. Live scores pause until ESPN is back. It switches back on its own.</span></div>`;
  else if (e.err && stale) html += `<div class="banner amber">${icon('wifi')}<span>Can’t reach the score feed. Showing games from ${ago(stale)}.</span></div>`;
  else if (e.v?.failed) html += `<div class="banner amber">${icon('alert')}<span>${e.v.failed} of your picks didn’t load. Showing the rest. It will try again.</span></div>`;

  useTables(ctx, all.filter((g) => g.state === 'pre' && nightKey(g.date) <= addDays(t, 6)).map((g) => g.path)); // reasons that need a league table
  ctx.live = all.some(isLive) || all.some(soon);
  ctx.wasLive = ctx.live;
  if (e.v) prefetchVisible(); // the games on screen, so tapping one opens it at once (after My games itself has loaded)

  const label = SPORTS.find(([k]) => k === f)[1];
  if (f !== 'all' && !followed.has(f)) {
    return html + `<div class="empty"><h2>No ${label} yet</h2><p>You don’t follow any ${label} teams or leagues.</p><a class="btn go" href="#/follow">Find ${label} to follow</a></div>`;
  }
  // A live game sits on top of both lists, so a quick score check never needs a tap.
  const live = games.filter(isLive);
  if (live.length) html += `<div class="sect"><h2 class="cap">Live now</h2></div>${live.map(hero).join('')}`;
  html += tab === 'res' ? resultsList(results, live.length, loading) : fixturesList(ahead, live.length, loading, f, label);
  if (pendingJump && !loading) setTimeout(() => { const k = pendingJump; pendingJump = null; home.actions.jump({ k }); }, 0);
  return html + `<p class="foot" id="homefoot">Times are Singapore time. Scores refresh every 10 seconds while a game is live and this screen is open.</p>`;
}

// Games grouped by viewing night (00:00–05:00 joins the evening before), in the order given.
function nights(gs) {
  const m = new Map();
  for (const g of gs) { const k = nightKey(g.date); if (!m.has(k)) m.set(k, []); m.get(k).push(g); }
  return [...m];
}
// One day: "Yesterday · Sun 25 Oct", then its games by competition. Your teams (and, in Fixtures, the next game
// and stand-out games) get full rows at the top of their competition; every other game is a one-line row under
// the competition's name. Competitions with one of those full rows come first. Nothing folds.
function dayBlock(k, gs, p, next) {
  const x = sg(k + 'T04:00:00Z'), rel = keyLabel(k), date = `${x.wd} ${x.d} ${x.mo}`;
  const wk = gs.every((g) => g.sport === 'football') && gs[0].week ? `Week ${gs[0].week}` : ''; // NFL counts in weeks (R4)
  const note = [rel !== date ? date : '', wk].filter(Boolean).join(' · ');
  const isBig = (g) => mine(g) || g === next || special(g);
  const paths = [...new Set([...gs.filter(isBig), ...gs].map((g) => g.path))];
  let h = `<section id="${p}-${k}"><div class="sect day"><h2 class="cap">${esc(rel)}</h2>${note ? `<span>${esc(note)}</span>` : ''}</div>`;
  for (const path of paths) {
    const cs = gs.filter((g) => g.path === path), big = cs.filter(isBig), rest = cs.filter((g) => !isBig(g));
    // The full rows name their competition themselves, so the label only shows above one-line rows.
    if (rest.length) h += `<p class="complab">${compImg(cs[0].comp.logo, 16, '')}<span>${esc(cs[0].comp.name)}</span></p>`;
    h += big.map((g) => gameRow(g, { tv: false, tag: g === next ? 'Next' : '', compName: !rest.length })).join('') + rest.map(compactRow).join('');
  }
  return h + '</section>';
}

// Results: newest night first; inside a night, kick-off order.
function resultsList(results, live, loading) {
  const ns = nights(results).reverse();
  let html = ns.map(([k, gs]) => dayBlock(k, gs, 'r')).join('');
  // A quiet few days: reach back a week or two so the list never opens empty.
  if (!loading && results.length < 4 && earlier < 2) setTimeout(() => { if (homeCtx && earlier < 2) { earlier++; homeCtx.redraw(); } }, 0);
  if (!ns.length && !loading && !live) html += `<div class="empty"><h2>No results yet</h2><p>None of your picks has finished a game in the last two weeks.</p></div>`;
  if (loading) html += `<p class="status">${icon('clock')}<span>Loading earlier results…</span></p>${skel(2)}`;
  else if (earlier < MAX_BACK) html += `<button class="btn ghost more" data-act="earlier">${icon('down')}Earlier results</button>`;
  return html;
}

// Fixtures: soonest first. The next game is marked "Next".
function fixturesList(ahead, live, loading, f, label) {
  const next = ahead.find((g) => !g.postponed) || null;
  let html = nights(ahead).map(([k, gs]) => dayBlock(k, gs, 'f', next)).join('');
  // A quiet stretch: keep loading weeks until something shows (or the season runs out).
  if (!loading && !ahead.length && !live && more < 8) setTimeout(() => { if (homeCtx && more < 8) { more++; homeCtx.redraw(); } }, 0);
  if (!ahead.length && !live && !loading && more >= 8) html += `<div class="empty"><h2>Quiet weeks</h2><p>None of your ${f === 'all' ? 'picks' : `${label} picks`} play in the next two months.</p><a class="btn go" href="#/week">See games that suit you</a></div>`;
  if (loading) html += `<p class="status">${icon('clock')}<span>Loading the next week…</span></p>${skel(2)}`;
  else if (more >= MAX_WEEKS) html += `<p class="foot">That’s as far ahead as Matchday looks.</p>`;
  return html;
}

// ---------- Date and month picker (Darren, 22 Oct 2026): the month name in the bar opens a sheet at the bottom,
// in thumb reach. Month chips across the top, then that month's days (Monday first) with a dot where you have
// games. A past day opens Results there, today or later opens Fixtures.
let pick = null; // 'YYYY-MM' the sheet opens at, while it is open
// Every month in one scrolling calendar, so you can flick through the season; the month chips jump to one.
function picker(days, t, on, has) {
  // Three months back (earlier results load on a jump) to the end of the season.
  const first = addDays(t, -91), last = days[days.length - 1];
  const months = [...new Set(keyRange(first, last).map((k) => k.slice(0, 7)))];
  const chip = (x) => `<button class="mchip" data-act="pickm" data-m="${x}" aria-pressed="${x === pick}">${MONTHS[+x.slice(5) - 1].slice(0, 3)}${x.slice(0, 4) !== t.slice(0, 4) ? ` ${x.slice(2, 4)}` : ''}</button>`;
  const day = (k) => {
    if (!k) return '<span></span>';
    const x = sg(k + 'T04:00:00Z'), out = k < first || k > last;
    return `<button class="pd${k === t ? ' today' : ''}${k === on ? ' cur' : ''}${has.has(k) ? ' has' : ''}" data-act="pickd" data-k="${k}"${out ? ' disabled' : ''} aria-label="${k === t ? 'Today, ' : ''}${x.wdl} ${x.d} ${x.mo}${has.has(k) ? ', games' : ''}">${x.d}</button>`;
  };
  const month = (m) => {
    const [y, mo] = m.split('-').map(Number);
    const lead = (new Date(`${m}-01T00:00:00Z`).getUTCDay() + 6) % 7, len = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const cells = [...Array(lead).fill(''), ...Array.from({ length: len }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`)];
    return `<section class="pm" id="pm-${m}" aria-label="${MONTHS[mo - 1]} ${y}"><p class="pmonth">${MONTHS[mo - 1]} ${y}</p><div class="pgrid">${cells.map(day).join('')}</div></section>`;
  };
  return `<div class="sheetbg" data-act="pickx"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Pick a date">
<div class="sheethd"><h2 class="cap">Go to a date</h2><button class="btn sm ghost" data-act="pickd" data-k="${t}">Today</button><button class="btn sm icon ghost" data-act="pickx" aria-label="Close">${icon('x')}</button></div>
<div class="chips mchips" role="group" aria-label="Month">${months.map(chip).join('')}</div>
<div class="pgrid pwk" aria-hidden="true">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="pw">${d}</span>`).join('')}</div>
<div class="pscroll">${months.map(month).join('')}<p class="note">Dots mark days with your games that are already known. A past day opens Results, today or later opens Fixtures.</p></div></div>`;
}
// Scroll the calendar to a month (instantly on open, smoothly from a chip).
function toMonth(m, smoothly) {
  const box = document.querySelector('.sheet .pscroll'), sec = document.getElementById(`pm-${m}`);
  if (box && sec) box.scrollTo({ top: sec.offsetTop - box.offsetTop, behavior: smoothly ? smooth() : 'auto' });
  document.querySelector(`.sheet [data-m="${m}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
// As the calendar scrolls, the chip of the month at the top lights up.
addEventListener('scroll', (e) => {
  const box = e.target;
  if (!(box instanceof Element) || !box.classList.contains('pscroll')) return;
  let m = null;
  for (const sec of box.querySelectorAll('.pm')) { if (sec.offsetTop - box.offsetTop <= box.scrollTop + 40) m = sec.id.slice(3); else break; }
  if (!m || m === pick) return;
  pick = m; // so the next redraw keeps this chip lit
  for (const c of document.querySelectorAll('.sheet .mchip')) c.setAttribute('aria-pressed', String(c.dataset.m === m));
}, { capture: true, passive: true });
// Run after the next drawn frame (the screen draws in requestAnimationFrame).
const afterPaint = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
const closePick = () => { pick = null; homeCtx?.redraw(); afterPaint(() => document.querySelector('.stripm')?.focus()); };
addEventListener('keydown', (e) => { if (pick && e.key === 'Escape') closePick(); });

// One line per game: kits, codes, time or score. Tap for the full game.
const compactRow = (g) => cachedRow('crow', g, {}, () => buildCompact(g));
function buildCompact(g) {
  const k = kitsFor(g), s = sg(g.date);
  const p = (x, r) => `<div class="p${r ? ' r' : ''}${kitEdge(x)}" style="background:${x.bg};color:${x.ink}">${r ? `<b>${esc(x.team.abbr || x.team.short)}</b>${crest(x.team, 18, true)}` : `${crest(x.team, 18, true)}<b>${esc(x.team.abbr || x.team.short)}</b>`}</div>`;
  // A 00:30 kick-off sits with the evening before it, so it says its own day ("00:30 MON").
  const late = g.timeValid && nightKey(g.date) !== s.key ? `<small>${s.wd}</small>` : '';
  const mid = g.state === 'post' ? `<b>${scoreText(k, true)}</b>${late}` : g.postponed ? '<b>PP</b>' : `<b>${g.timeValid ? s.hm : 'TBC'}</b>${late}`;
  return `<a class="crow${g.state === 'post' ? ' done' : ''}" href="${href.match(g)}" aria-label="${esc(spoken(g, k))}">${p(k.left)}<div class="mid">${mid}</div>${p(k.right, true)}</a>`;
}

// A game that earns a full row: your team, a single game you picked, or (in Fixtures) a stand-out reason (big
// game, abroad, on a streamer, playoffs). The free-hours fit alone doesn't count: most games have one.
const yourTeam = (g) => picks.teams.some((x) => teamKey(x.path, x.id) === teamKey(g.path, g.home.id) || teamKey(x.path, x.id) === teamKey(g.path, g.away.id)) || picks.games.some((x) => x.id === g.id);
const mine = (g) => yourTeam(g);
const special = (g) => g.state === 'pre' && !g.postponed && reasons(g).some((r) => r !== freeHour(g));

// Coming back after more than 10 minutes away opens Results again, like a fresh launch.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 10 * 60e3 && tab !== 'res') { tab = 'res'; homeCtx?.redraw(); }
});

const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const barH = () => (document.querySelector('.filterbar')?.offsetHeight || 0) + 4;
const onHome = () => !location.hash || location.hash === '#/' || location.hash === '#';

// Follow the scroll: the month of the day at the top of the list shows in the bar. Near the bottom, the next
// week loads (Fixtures), or the week before (Results, only on a real scroll so a short list doesn't load the
// whole season back by itself).
function track(scrolled) {
  if (!onHome()) return;
  const bar = document.querySelector('.filterbar');
  if (!bar) return;
  const line = bar.getBoundingClientRect().bottom + 12;
  const secs = document.querySelectorAll('#view section[id^="r-"], #view section[id^="f-"]');
  let k = secs[0]?.id.slice(2) || nightToday();
  for (const sec of secs) { if (sec.getBoundingClientRect().top <= line) k = sec.id.slice(2); else break; }
  if (k !== curDay) { curDay = k; const m = bar.querySelector('.stripm b'); if (m) m.textContent = monthOf(k); }
  prefetchVisible();
  const near = innerHeight + scrollY > document.documentElement.scrollHeight - 900;
  if (!near || !homeCtx || document.querySelector('#view .skel')) return;
  if (tab === 'fix' && more < MAX_WEEKS) { more++; homeCtx.redraw(); }
  else if (tab === 'res' && scrolled && earlier < MAX_BACK && document.documentElement.scrollHeight > innerHeight + 200) { earlier++; homeCtx.redraw(); }
}
let tr = 0;
addEventListener('scroll', () => { clearTimeout(tr); tr = setTimeout(() => track(true), 40); }, { passive: true });

home.actions = {
  pick(d, el, e, ctx) { pick = (curDay || nightToday()).slice(0, 7); ctx.redraw(); afterPaint(() => { toMonth(pick, false); document.querySelector('.sheet [aria-pressed="true"]')?.focus({ preventScroll: true }); }); },
  pickm(d) { toMonth(d.m, true); },
  pickx() { closePick(); },
  pickd(d) { pick = null; homeCtx?.redraw(); afterPaint(() => home.actions.jump({ k: d.k })); },
  // Go to a day: a past day in Results, today or later in Fixtures (today stays in Results if you're there).
  // Weeks load up to it first; a day without games goes to the nearest one that has some.
  jump(d) {
    const k = d.k, t = nightToday();
    const want = k < t || (k === t && tab === 'res') ? 'res' : 'fix';
    if (tab !== want) { tab = want; homeCtx?.redraw(); afterPaint(() => home.actions.jump(d)); return; }
    if (want === 'res') {
      const need = k < addDays(t, -3) ? Math.ceil((Number(new Date(addDays(t, -3))) - Number(new Date(k))) / (7 * 864e5)) : 0;
      if (earlier < need) { earlier = Math.min(MAX_BACK, need); pendingJump = k; homeCtx?.redraw(); return; }
      if (k === t) { scrollTo({ top: 0, behavior: smooth() }); return; }
      const el = document.getElementById(`r-${k}`) || [...document.querySelectorAll('#view section[id^="r-"]')].find((x) => x.id.slice(2) <= k);
      scrollTo({ top: el ? el.getBoundingClientRect().top + scrollY - barH() : 0, behavior: smooth() });
      return;
    }
    if (k > addDays(t, 6)) {
      const need = Math.ceil((Number(new Date(k)) - Number(new Date(addDays(todayKey(), 7)))) / (7 * 864e5));
      if (more < need) { more = Math.min(MAX_WEEKS, need); pendingJump = k; homeCtx?.redraw(); return; }
    }
    const el = document.getElementById(`f-${k}`) || [...document.querySelectorAll('#view section[id^="f-"]')].find((x) => x.id.slice(2) >= k);
    scrollTo({ top: el ? el.getBoundingClientRect().top + scrollY - barH() : 0, behavior: smooth() });
  },
  tab(d, el, e, ctx) { if (tab === d.t) return; tab = d.t; ctx.redraw(); scrollTo({ top: 0 }); },
  earlier(d, el, e, ctx) { earlier++; ctx.redraw(); },
  // Tapping a sport shows that sport from the top of the list you're on.
  sport(d, el, e, ctx) { cur = d.s; ctx.redraw(); scrollTo({ top: 0, behavior: smooth() }); },
};
