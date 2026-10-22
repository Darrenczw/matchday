// Home: "My games" (option A, Darren, 22 Oct 2026). It opens at now and time only goes down: Live (or Next up),
// then results since you last looked, then what's coming, under your own free-hour slots. All in SGT.
import { esc, sg, nightKey, nightToday, todayKey, addDays, keyRange, keyLabel, icon, ago, countdown } from '../util.js';
import { picks, followingAny, DEMO, load, save, sportOf, teamKey, settings } from '../store.js';
import { gamesFor, isLive, soon, net, sortGames, known } from '../espn.js';
import { compLogo, compImg, kitsFor, crest, kitEdge } from '../identity.js';
import { gameRow, hero, skel, errorCard, scoreText, spoken, href, cachedRow, movedFrom, movedText } from '../ui.js';
import { calReady, status as calStatus, gameInCal } from '../cal.js';
import { useTables, reasons, freeHour } from '../suggest.js';
import { windowsOf, inWindow } from '../rules.js';
import { prefetchVisible } from '../prefetch.js';

let ver = 0;
// The sport filter lives for this visit only: a fresh start always opens on All, so no sport is ever hidden by surprise.
let cur = 'all';
// Older league results, opened with "4 more results since Sun" (for this visit).
let openOlder = false;
const sig = () => JSON.stringify(picks);
let lastSig = '', snapAt = 0;

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
  let html = `<header class="top"><h1>My games</h1><span class="sub">${esc(sub)}</span></header>` + calBanners(ctx);

  const games = all?.filter(keep);
  const liveIn = new Set((all || []).filter(isLive).map((g) => g.sport));
  const ahead = (games || []).filter((g) => g.state === 'pre' || g.postponed);
  // The date strip: the whole season, scrolling sideways. The highlighted day follows the list as you scroll.
  const days = keyRange(addDays(t, -7 * (earlier + 1)), addDays(t, 7 * (MAX_WEEKS + 1)));
  const has = new Set([...ahead.map((g) => nightKey(g.date)), ...(e.v?.season || []).filter(() => f === 'all')]);
  const on = curDay || t;
  // The date strip scrolls away with the title; only the sport chips and the date button stay on top (option A).
  html += strip(days, t, on, has) + `<div class="filterbar">`
    + `<div class="chips" role="group" aria-label="Sport">${SPORTS.map(([k, l]) => { const hid = f !== 'all' && k !== f && (k === 'all' ? [...liveIn].some((s) => s !== f) : liveIn.has(k)); return `<button class="chip txt" data-act="sport" data-s="${k}" aria-pressed="${f === k}"${hid ? ` aria-label="${l}, game live now"` : ''}>${hid ? '<i class="dot" aria-hidden="true"></i>' : ''}${l}</button>`; }).join('')}<button class="stripm" data-act="pick" aria-haspopup="dialog" aria-label="Pick a date. Showing ${monthOf(on)}"><b>${monthOf(on)}</b>${icon('cal')}</button></div></div>`;
  if (pick) html += picker(days, t, on, has);
  setTimeout(() => { placeStrip(); track(); }, 0);

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
  // 1. Live now while a game is on, so a quick score check never needs a scroll. Otherwise one big Next up card.
  const results = games.filter((g) => g.state === 'post' && !g.postponed).reverse();
  const live = games.filter(isLive);
  let next = null;
  if (live.length) html += `<div class="sect"><h2 class="cap">Live now</h2></div>${live.map(hero).join('')}`;
  else {
    const soon7 = ahead.filter((g) => !g.postponed && nightKey(g.date) <= addDays(t, 6));
    next = soon7.find(mine) || soon7.find(special) || soon7[0] || null;
    if (next) html += `<div class="sect"><h2 class="cap">Next up</h2><span>${esc(next.comp.name)}</span></div>${nextUp(next)}`;
  }
  // 2. Results since you last looked: your teams first, a followed league's other results fold into one line.
  html += sinceRows(results);
  // 3. What's coming, one section per viewing night, under your free-hour slots. Your teams, single games and
  // stand-out games get full rows; the rest of a followed league folds per slot. After this week, month headings
  // with one-line rows.
  // NFL counts in weeks (R4): "Week 8", or "Weeks 7–8" across a week boundary.
  const soonWk = ahead.filter((g) => nightKey(g.date) <= addDays(t, 6));
  const wk = f === 'football' ? [...new Set(soonWk.map((g) => g.week).filter(Boolean))].sort((a, b) => a - b) : [];
  if (wk.length) html += `<div class="sect"><h2 class="cap">Coming up</h2><span>${wk.length > 1 ? `Weeks ${wk[0]}–${wk[wk.length - 1]}` : `Week ${wk[0]}`}</span></div>`;
  const fold = picks.teams.length + picks.games.length > 0; // only leagues followed: nothing to fold behind
  let day = '', month = '', first = true;
  const list = ahead.filter((g) => g !== next);
  for (let i = 0; i < list.length;) {
    const g = list[i], k = nightKey(g.date), far = k > addDays(t, 6);
    if (far) {
      if (k.slice(0, 7) !== month) { if (day) { html += '</section>'; day = ''; } month = k.slice(0, 7); html += `<div class="sect month"${first ? ' id="coming"' : ''}><h2 class="cap">${monthOf(k)}${k.slice(0, 4) !== t.slice(0, 4) ? ` ${k.slice(0, 4)}` : ''}</h2></div>`; first = false; }
      if (k !== day) { html += `${day ? '</section>' : ''}<section id="d-${k}"><h3 class="dayh sm">${keyLabel(k)}</h3>`; day = k; }
      // Later weeks: one-line rows; a followed league's other games fold per night, as in this week.
      const night = [];
      while (i < list.length && nightKey(list[i].date) === k) night.push(list[i++]);
      const top = fold ? night.filter((x) => mine(x) || special(x)) : night, rest = night.filter((x) => !top.includes(x));
      html += top.map(compactRow).join('');
      for (const path of [...new Set(rest.map((x) => x.path))]) {
        const gs = rest.filter((x) => x.path === path), fk = `${k}|far|${path}`;
        if (gs.length === 1 || openFolds.has(fk)) html += gs.map(compactRow).join('');
        else html += foldLine(gs, fk, top.length > 0);
      }
      continue;
    }
    if (k !== day) { html += `${day ? '</section>' : ''}<section id="d-${k}">`; day = k; }
    // One slot: the games of this night in the same free-hour window (or the same part of the day outside them).
    const sl = slotOf(g), sk = `${k}|${sl.id}`, group = [];
    while (i < list.length && nightKey(list[i].date) === k && slotOf(list[i]).id === sl.id) group.push(list[i++]);
    html += `<div class="sect slot${sl.free ? '' : ' off'}"${first ? ' id="coming"' : ''}><h3 class="cap">${esc(slotName(k, sl))}</h3><span>${esc(sl.note)}</span></div>`;
    first = false;
    const top = fold ? group.filter((x) => mine(x) || special(x)) : group, rest = group.filter((x) => !top.includes(x));
    html += top.map((x) => gameRow(x, { tv: false, fh: false })).join('');
    // The rest, per competition: one game stays a one-line row, two or more fold into a line you can open.
    for (const path of [...new Set(rest.map((x) => x.path))]) {
      const gs = rest.filter((x) => x.path === path), fk = `${sk}|${path}`;
      if (gs.length === 1) html += compactRow(gs[0]);
      else if (openFolds.has(fk)) html += gs.map((x) => gameRow(x, { tv: false, fh: false })).join('') + `<button class="btn ghost more" data-act="fold" data-k="${esc(fk)}">${icon('up')}Show fewer</button>`;
      else html += foldLine(gs, fk, top.length > 0);
    }
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

// ---------- Date and month picker (Darren, 22 Oct 2026): the month name in the bar opens a sheet at the bottom,
// in thumb reach. Month chips across the top, then that month's days (Monday first) with a dot where you have
// games. Tap a day to jump there; the list loads up to it if it's further ahead.
let pick = null; // 'YYYY-MM' the sheet opens at, while it is open
// Every month in one scrolling calendar, so you can flick through the season; the month chips jump to one.
function picker(days, t, on, has) {
  // Three months back (earlier results load on a jump) to the end of the strip.
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
<div class="pscroll">${months.map(month).join('')}<p class="note">Dots mark days with your games that are already known. Tap any day to go there.</p></div></div>`;
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

// The season strip is ~300 buttons; build it again only when today, the highlighted day or the dots change.
let stripKey = '', stripHtml = '';
function strip(days, t, on, has) {
  const key = `${days[0]}|${days.length}|${t}|${on}|${[...has].sort().join()}`;
  if (key === stripKey) return stripHtml;
  stripKey = key;
  return (stripHtml = `<div class="days" role="group" aria-label="Jump to a day">${days.map((k) => { const x = sg(k + 'T04:00:00Z'); return `<button class="${k === t ? 'today ' : ''}${k === on ? 'cur ' : ''}${has.has(k) ? 'has' : ''}${x.d === 1 ? ' m1' : ''}" data-act="jump" data-k="${k}" aria-label="${k === t ? 'Today, ' : ''}${x.wdl} ${x.d} ${x.mo}${has.has(k) ? ', games' : ''}"${k === on ? ' aria-current="date"' : ''}>${x.wd}<b>${x.d}</b></button>`; }).join('')}</div>`);
}

// One line per game for later weeks and older results: kits, codes, time or score. Tap for the full game.
const compactRow = (g) => cachedRow('crow', g, {}, () => buildCompact(g));
function buildCompact(g) {
  const k = kitsFor(g), s = sg(g.date);
  const p = (x, r) => `<div class="p${r ? ' r' : ''}${kitEdge(x)}" style="background:${x.bg};color:${x.ink}">${r ? `<b>${esc(x.team.abbr || x.team.short)}</b>${crest(x.team, 18, true)}` : `${crest(x.team, 18, true)}<b>${esc(x.team.abbr || x.team.short)}</b>`}</div>`;
  // A 00:30 kick-off sits with the evening before it, so it says its own day ("00:30 MON").
  const late = g.timeValid && nightKey(g.date) !== s.key ? `<small>${s.wd}</small>` : '';
  const mid = g.state === 'post' ? `<b>${scoreText(k, true)}</b>` : g.postponed ? '<b>PP</b>' : `<b>${g.timeValid ? s.hm : 'TBC'}</b>${late}`;
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

// ---------- Option A pieces (Darren, 22 Oct 2026)
// A game that earns a full row: your team, a single game you picked, or a stand-out reason (big game, abroad,
// on a streamer, playoffs). The free-hours fit alone doesn't count: most games have one.
const mine = (g) => yourTeam(g);
const special = (g) => g.state === 'pre' && !g.postponed && reasons(g).some((r) => r !== freeHour(g));

// The slot a game sits in: the free-hour window it starts in, or, outside them, the part of the day.
const PART = (m) => (m < 5 * 60 ? 'late night' : m < 12 * 60 ? 'morning' : m < 18 * 60 ? 'afternoon' : m < 23 * 60 ? 'evening' : 'late night');
const mm = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + (m || 0); };
function slotOf(g) {
  if (!g.timeValid) return { id: 'tbc', free: false, part: '', note: 'Time to be confirmed' };
  const s = sg(g.date), w = windowsOf(settings).find((x) => x.on && inWindow(x, s.dow, s.mins));
  if (w) return { id: `w-${w.id}`, free: true, part: PART(mm(w.from)), note: `Free ${w.from}–${w.to}` };
  const part = PART(s.mins);
  return { id: `p-${part}`, free: false, part, note: 'Outside your free hours' };
}
// "This morning", "Tonight", "Tomorrow evening", "Fri late night", "Sat 31 Oct · time to be confirmed".
function slotName(k, sl) {
  const t = nightToday(), x = sg(k + 'T04:00:00Z');
  if (!sl.part) return `${keyLabel(k)} · time TBC`;
  if (k === t) return sl.part === 'evening' ? 'Tonight' : sl.part === 'late night' ? 'Late tonight' : `This ${sl.part}`;
  return `${k === addDays(t, 1) ? 'Tomorrow' : x.wd} ${sl.part}`;
}

// Next up: one big card for the game that matters most when nothing is live. Kick-off, countdown, slot, the
// stand-out reason and whether it's in the calendar. No channel line: that's on the match page (Darren).
const nextUp = (g) => cachedRow('next', g, { cal: gameInCal(g), m: Math.floor(Date.now() / 60e3) }, () => buildNext(g));
function buildNext(g) {
  const k = kitsFor(g), s = sg(g.date), moved = movedFrom(g);
  const why = reasons(g).filter((r) => r !== freeHour(g))[0];
  const side = (x, r) => `<div class="shirt${r ? ' r' : ''}${kitEdge(x)}" style="background:${x.bg};color:${x.ink}">${crest(x.team, 34, true)}<span class="tn">${esc(x.team.short)}${g.sport !== 'soccer' ? `<small>${x.team.home ? 'Home' : 'Away'}</small>` : ''}</span></div>`;
  const when = slotName(nightKey(g.date), slotOf(g));
  const bits = [moved ? `<span class="moved">${esc(movedText(moved))}</span>` : `<b>${esc(when)}</b><span class="cd">${g.timeValid ? esc(countdown(g.date)) : 'Time to be confirmed'}</span>`];
  if (why) bits.push(`<em>${esc(why)}</em>`);
  if (gameInCal(g)) bits.push(`<span class="incal">${icon('check')}In your calendar</span>`);
  return `<a class="nx" href="${href.match(g)}" aria-label="${esc(`Next up. ${spoken(g, k, { moved, why: reasons(g).join(', ') })}${gameInCal(g) ? ' In your calendar.' : ''}`)}">${side(k.left)}${side(k.right, true)}<div class="ko" aria-hidden="true"><b>${g.timeValid ? s.hm : 'TBC'}</b><span>${s.wd} ${s.d} ${s.mo}</span></div><div class="nxm" aria-hidden="true">${bits.join('<span aria-hidden="true">·</span>')}</div></a>`;
}

// "Since you looked": the time is saved when the app leaves the screen, and read again when you come back
// after more than 10 minutes away, so a quick switch to another app doesn't clear the list.
let prevSeen = load('seenAt', 0) || Date.now() - 864e5, hiddenAt = 0, allRes = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); save('seenAt', hiddenAt); return; }
  if (hiddenAt && Date.now() - hiddenAt > 10 * 60e3) { prevSeen = hiddenAt; allRes = false; openOlder = false; homeCtx?.redraw(); }
});
const openFolds = new Set(); // folded league lines opened this visit
const sinceText = () => { const s = sg(prevSeen); return s.key === todayKey() ? s.hm : `${s.wd} ${s.hm}`; };
function sinceRows(results) {
  // A game counts as new if it could have finished after your last look (started up to 4 h before it).
  const t = nightToday(), fresh = results.filter((g) => new Date(g.date).getTime() > prevSeen - 4 * 3600e3);
  if (allRes) return `<div class="sect"><h2 class="cap">Results</h2><span>Since ${earlier ? keyLabel(addDays(todayKey(), -3 - 7 * earlier)) : sg(addDays(t, -3) + 'T04:00:00Z').wd}</span></div>${resultRows(results, t)}`;
  const fold = picks.teams.length + picks.games.length > 0;
  const top = fold ? fresh.filter(mine) : fresh, rest = fresh.filter((g) => !top.includes(g));
  let html = '';
  if (fresh.length) html += `<div class="sect"><h2 class="cap">${fresh.length ? 'Since you looked' : 'Results'}</h2><span>${fresh.length ? `last open ${sinceText()}` : ''}</span></div>`;
  html += top.map(compactRow).join('');
  for (const path of [...new Set(rest.map((x) => x.path))]) {
    const gs = rest.filter((x) => x.path === path), fk = `res|${path}`;
    if (gs.length === 1 || openFolds.has(fk)) html += gs.map(compactRow).join('');
    else html += foldLine(gs, fk, top.length > 0, 'result');
  }
  const label = fresh.length ? 'All results' : `No new results since ${sinceText()}`;
  return html + `<button class="fold quiet" data-act="allres"><span class="grow">${esc(label)}</span>${fresh.length ? '' : '<span class="go">All results</span>'}${icon('chev', 'chev')}</button>`;
}
// One line for a followed league's other games: team codes in their colours, then "Premier League · 3 more".
function foldLine(gs, fk, more, noun = 'game') {
  const codes = gs.slice(0, 6).flatMap((g) => { const k = kitsFor(g); return [k.left, k.right]; }).slice(0, 8)
    .map((x) => `<i class="${kitEdge(x).trim()}" style="background:${x.bg};color:${x.ink}">${esc(x.team.abbr || x.team.short)}</i>`).join('');
  const n = gs.length, name = gs[0].comp.name;
  const text = more ? `${name} · ${n} more` : `${name} · ${n} ${noun}s`;
  return `<button class="fold" data-act="fold" data-k="${esc(fk)}" aria-expanded="false" aria-label="${esc(`${text}. Show them`)}">${compImg(gs[0].comp.logo, 18, '')}<span class="grow"><span class="codes" aria-hidden="true">${codes}</span><span class="ft">${esc(text)}</span></span>${icon('down', 'chev')}</button>`;
}

const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
const barH = () => (document.querySelector('.filterbar')?.offsetHeight || 0) + 4;
const onHome = () => !location.hash || location.hash === '#/' || location.hash === '#';

// The strip opens with today at its left edge (keeping the scroll you left it at after that).
function placeStrip() {
  const strip = document.querySelector('#view .days'), b = strip?.querySelector('.today');
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
    const strip = document.querySelector('#view .days');
    strip?.querySelector('.cur')?.removeAttribute('aria-current');
    strip?.querySelector('.cur')?.classList.remove('cur');
    const btn = strip?.querySelector(`[data-k="${k}"]`);
    if (btn) {
      btn.classList.add('cur'); btn.setAttribute('aria-current', 'date');
      const l = btn.offsetLeft - strip.offsetLeft, r = l + btn.offsetWidth;
      if (l < strip.scrollLeft + 8 || r > strip.scrollLeft + strip.clientWidth - 8) strip.scrollTo({ left: l - strip.clientWidth / 2 + btn.offsetWidth / 2, behavior: smooth() });
    }
    const m = bar.querySelector('.stripm b'); if (m) m.textContent = monthOf(k);
  }
  prefetchVisible();
  if (innerHeight + scrollY > document.documentElement.scrollHeight - 900 && more < MAX_WEEKS && homeCtx && !document.querySelector('#view .skel')) { more++; homeCtx.redraw(); }
}
let tr = 0;
addEventListener('scroll', () => { clearTimeout(tr); tr = setTimeout(track, 40); }, { passive: true });

home.actions = {
  pick(d, el, e, ctx) { pick = (curDay || nightToday()).slice(0, 7); ctx.redraw(); afterPaint(() => { toMonth(pick, false); document.querySelector('.sheet [aria-pressed="true"]')?.focus({ preventScroll: true }); }); },
  pickm(d) { toMonth(d.m, true); },
  pickx() { closePick(); },
  pickd(d) { pick = null; homeCtx?.redraw(); afterPaint(() => home.actions.jump({ k: d.k })); },
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
  fold(d, el, e, ctx) { if (openFolds.has(d.k)) openFolds.delete(d.k); else openFolds.add(d.k); ctx.redraw(); },
  allres(d, el, e, ctx) { allRes = true; ctx.redraw(); },
  sport(d, el, e, ctx) {
    cur = d.s; ctx.redraw();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById('coming');
      scrollTo({ top: el ? Math.max(0, el.getBoundingClientRect().top + scrollY - barH()) : 0, behavior: smooth() });
    }));
  },
};
