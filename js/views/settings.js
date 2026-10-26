// Settings: TV markets and their order, free hours, suggestion rules, calendar, look (PRD 7.10).
import { esc, icon, ago, sg as sgt, dateText } from '../util.js';
import { settings, set, MARKETS, clearPicks, followingAny, picks, DEMO } from '../store.js';
import { windowName } from '../rules.js';
import { rightsChecked } from '../tv.js';
import { toast, calBtn, backBtn } from '../ui.js';
import { cal, calCfg, CAL_API, calReady, calAny, setUp, status, newLink, webcal, syncState, calError } from '../cal.js';
import { compImg, crest } from '../identity.js';
import { isOver } from '../espn.js';

// The calendar card: set up once, subscribe once, then it looks after itself. Honest about every state.
function calendarCard(ctx) {
  if (!CAL_API) return `<div class="card"><h2>Calendar</h2><div class="li">${icon('cal')}<span class="grow"><span class="t">Almost ready</span><small class="wrap">The calendar helper runs on a free Cloudflare account. It goes live once that account is set up.</small></span></div></div>`;
  if (!calReady()) return `<div class="card"><h2>Calendar</h2><div class="li">${icon('cal')}<span class="grow"><span class="t">Your games in your iPhone Calendar</span><small class="wrap">Times are re-checked every few minutes and fixed in your calendar when they move.</small></span></div><div class="li" style="border:0"><button class="btn go" data-act="setup">${icon('calplus')}Set up calendar</button></div></div>`;
  const e = ctx.use('calstatus', status, 60e3), st = e.v;
  const fetched = st?.lastFetch?.at;
  let lines = '';
  if (e.err) lines = `<p class="status amber">${icon('wifi')}<span>${esc(calError(e.err))}</span></p>`;
  else if (st) {
    lines = fetched ? `<p class="status ok">${icon('check')}<span>iPhone last fetched the calendar ${ago(fetched)}</span></p>` : `<p class="status amber">${icon('alert')}<span>Not on your iPhone yet: tap Subscribe.</span></p>`;
    lines += st.lastCheck ? `<p class="status">${icon('clock')}<span>Kick-off times checked ${sgt(st.lastCheck).hm} · ${st.games} game${st.games === 1 ? '' : 's'} in your calendar</span></p>` : `<p class="status">${icon('clock')}<span>First time check in the next few minutes.</span></p>`;
  }
  if (syncState.error) lines += `<p class="status amber">${icon('alert')}<span>Couldn’t send your calendar picks. ${esc(syncState.error)} It tries again on every change.</span></p>`;
  const items = [
    ...cal.teams.map((t) => `<div class="li">${crest(t, 28)}<span class="grow"><span class="t">${esc(t.name)}</span><small>Every game, all competitions</small></span>${calBtn('team', `${t.path.split('/')[0]}:${t.id}`, t, { compact: true })}</div>`),
    ...cal.comps.map((c) => `<div class="li">${compImg(c.logo, 28, c.name)}<span class="grow"><span class="t">${esc(c.name)}</span><small>Every game</small></span>${calBtn('comp', c.path, c, { compact: true })}</div>`),
    // Single games leave this list once they're over; they stay in the feed, so the iPhone keeps them as history.
    ...cal.games.filter((g) => !isOver(g)).map((g) => `<div class="li">${icon('cal')}<span class="grow"><span class="t">${esc(g.name)}</span><small>One game</small></span>${calBtn('game', g.id, g, { compact: true })}</div>`),
  ].join('');
  return `<div class="card"><h2>Calendar</h2>
<div class="li" style="border:0"><a class="btn go" href="${esc(webcal(calCfg.feedUrl))}">${icon('calplus')}${fetched ? 'Subscribe again' : 'Subscribe on this iPhone'}</a></div>${lines}
${items ? `<div class="h" style="padding-top:12px">In your calendar<span>Separate from Follow</span></div>${items}` : `<p class="note">${calAny() ? 'Your single games are over. Past games stay in your iPhone Calendar.' : 'Nothing in your calendar yet.'} Use the Calendar button on a team, league or game.</p>`}
<p class="note">For the fastest updates: iPhone Settings → Apps → Calendar → Accounts → Fetch New Data → Every 15 Minutes. Opening the Calendar app also fetches.</p>
<div class="li"><button class="btn sm ghost" data-act="copylink">Copy link</button><button class="btn sm ghost" data-act="newlink">Make a new link</button></div></div>`;
}

// ---------- My free hours: windows Darren sets himself (days plus from and to), no typing: day chips and time wheels.
const DAY = [[1, 'M', 'Monday'], [2, 'T', 'Tuesday'], [3, 'W', 'Wednesday'], [4, 'T', 'Thursday'], [5, 'F', 'Friday'], [6, 'S', 'Saturday'], [0, 'S', 'Sunday']];
const D3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const order = (days) => [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
function daysText(days) {
  const d = order(days), k = d.join();
  if (k === '1,2,3,4,5,6,0') return 'Every day';
  if (k === '1,2,3,4,5') return 'Mon to Fri';
  // A run of three or more days reads as "Thu to Sun".
  const run = d.length > 2 && d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 7);
  return run ? `${D3[d[0]]} to ${D3[d[d.length - 1]]}` : d.map((x) => D3[x]).join(', ') || 'No days';
}
const crosses = (w) => w.to <= w.from;
let editing = null;
function freeHours() {
  const ws = settings.windows;
  const rows = ws.map((w) => {
    const open = editing === w.id;
    const sub = `${daysText(w.days)} · ${w.from} to ${w.to}${crosses(w) ? ' (next day)' : ''}`;
    let h = `<div class="li fhw"><button class="grow" data-act="editwin" data-id="${esc(w.id)}" aria-expanded="${open}"><span class="t">${esc(windowName(w))}</span><small>${esc(sub)}</small></button>${sw(`win:${w.id}`, w.on, windowName(w))}</div>`;
    if (open) {
      h += `<div class="wined"><div class="daychips" role="group" aria-label="Days">${DAY.map(([n, l, full]) => `<button data-act="winday" data-id="${esc(w.id)}" data-d="${n}" aria-pressed="${w.days.includes(n)}" aria-label="${full}">${l}</button>`).join('')}</div>
<div class="times"><label>From<input type="time" step="900" value="${esc(w.from)}" data-input="wintime" data-id="${esc(w.id)}" data-k="from"></label><label>To<input type="time" step="900" value="${esc(w.to)}" data-input="wintime" data-id="${esc(w.id)}" data-k="to"></label></div>
<div class="winacts"><button class="btn sm warn" data-act="delwin" data-id="${esc(w.id)}">Remove</button><button class="btn sm on" data-act="editwin" data-id="">${icon('check')}Done</button></div></div>`;
    }
    return h;
  }).join('');
  return `<div class="card"><h2>My free hours</h2>${rows}<div class="li"><button class="btn sm ghost" data-act="addwin">${icon('plus')}Add a window</button></div><p class="note">All times are Singapore time. A window that ends before it starts runs past midnight. Games in these hours get a “Good for you” tag, named after the window.</p></div>`;
}

const sw = (path, on, label) => `<button class="switch" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-act="toggle" data-path="${path}"></button>`;

export default function settingsView(params, ctx) {
  const ms = settings.markets;
  let html = `<nav class="nav">${backBtn(ctx.back?.href || '#/', ctx.back?.label || 'My games')}</nav><header class="top"><h1>Settings</h1>${DEMO ? '<span class="sub">Sample picks</span>' : ''}</header>`;

  html += calendarCard(ctx);

  html += `<div class="card"><div class="h">TV markets<span>Top one is your main market</span></div><div id="markets">`;
  html += ms.map((m, i) => `<div class="mrow" data-m="${m}"><span class="grip" data-drag="${i}" aria-hidden="true">${icon('grip')}</span><span class="grow">${esc(MARKETS[m])}${i === 0 ? ' <span class="tag exact" style="margin-left:6px">Main</span>' : ''}</span>
<button class="mv" data-act="mv" data-i="${i}" data-d="-1" aria-label="Move ${esc(MARKETS[m])} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="mv" data-act="mv" data-i="${i}" data-d="1" aria-label="Move ${esc(MARKETS[m])} down" ${i === ms.length - 1 ? 'disabled' : ''}>${icon('down')}</button></div>`).join('');
  html += `</div><p class="note">Drag, or use the arrows. Rights table checked ${esc(rightsChecked() ? dateText(rightsChecked()) : '…')}, with a source for every entry.</p></div>`;

  html += freeHours();

  const rules = [['rules.big', 'Big games', 'Top-of-table clashes and the famous derbies'], ['rules.near', 'Matters to your teams', 'Games between teams near yours in the table'], ['rules.overseas', 'Played overseas', 'NFL and NBA games outside the US and Canada'], ['rules.streaming', 'On a streamer', 'Netflix, Prime Video, YouTube, Disney+'], ['rules.playoffs', 'Playoffs and finals', 'All three sports']];
  html += `<div class="card"><h2>Also suggest</h2>${rules.map(([p, l, s]) => `<div class="li"><span class="grow"><span class="t">${l}</span><small>${s}</small></span>${sw(p, p.split('.').reduce((o, k) => o[k], settings), l)}</div>`).join('')}
<div class="h" style="padding-top:16px">Suggest from<span>Sports on This week</span></div>
${[['suggest.soccer', 'Football'], ['suggest.nfl', 'NFL'], ['suggest.nba', 'NBA']].map(([p, l]) => `<div class="li" style="min-height:48px"><span class="grow"><span class="t">${l}</span></span>${sw(p, p.split('.').reduce((o, k) => o[k], settings), `Suggest ${l}`)}</div>`).join('')}</div>`;

  html += `<div class="sect"><h2 class="cap">Look</h2></div><div class="seg" role="group" aria-label="Look">${[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(([k, l]) => `<button data-act="theme" data-v="${k}" aria-pressed="${settings.theme === k}">${l}</button>`).join('')}</div>`;

  html += `<div class="card"><h2>About</h2><p class="note" style="padding-top:0">Scores, fixtures, tables, logos and US TV come from ESPN’s public feed. Away kit colours come from each club’s Wikipedia page. Free, with no account and no tracking. Your picks are saved on this phone. Once the calendar is set up, a copy also goes to your calendar helper, which builds the calendar and stands in when ESPN is down.</p>
${followingAny() ? `<div class="li"><span class="grow"><span class="t">Clear all picks</span><small class="wrap">Empties My games. Your calendar stays as it is.</small></span><button class="btn sm warn" data-act="clear">Clear all</button></div>` : ''}</div>`;
  return html;
}

settingsView.actions = {
  async setup(d, el, e, ctx) {
    el.disabled = true;
    try { await setUp(); toast('Calendar set up. Now tap Subscribe.'); ctx.forget('calstatus'); }
    catch (err) { toast(`Set-up didn’t work. ${calError(err)}`); el.disabled = false; }
  },
  async copylink() {
    try { await navigator.clipboard.writeText(calCfg.feedUrl); toast('Calendar link copied'); } catch { toast('Couldn’t copy. Long-press Subscribe instead.'); }
  },
  async newlink(d, el, e, ctx) {
    if (!confirm('Make a new calendar link? The old one stops working, and you’ll need to subscribe again on your iPhone.')) return;
    try { await newLink(); ctx.forget('calstatus'); toast('New link made. Tap Subscribe to add it.'); } catch (err) { toast(`Couldn’t make a new link. ${calError(err)}`); }
  },
  toggle(d) {
    if (d.path.startsWith('win:')) return setWin(d.path.slice(4), (w) => ({ ...w, on: !w.on }));
    set(d.path, !d.path.split('.').reduce((o, k) => o[k], settings));
  },
  editwin(d, el, e, ctx) { editing = editing === d.id || !d.id ? null : d.id; ctx.redraw(); },
  addwin(d, el, e, ctx) {
    const w = { id: `w${Date.now().toString(36)}`, days: [6, 0], from: '10:00', to: '19:00', on: true };
    set('windows', [...settings.windows, w]); editing = w.id; ctx.redraw();
  },
  delwin(d, el, e, ctx) {
    const before = settings.windows, gone = before.find((w) => w.id === d.id);
    set('windows', before.filter((w) => w.id !== d.id)); editing = null;
    toast(`${windowName(gone)} removed`, () => set('windows', before));
  },
  winday(d) { const n = +d.d; setWin(d.id, (w) => ({ ...w, days: w.days.includes(n) ? w.days.filter((x) => x !== n) : [...w.days, n] })); },
  wintime(v, el) { if (/^\d\d:\d\d$/.test(v)) setWin(el.dataset.id, (w) => ({ ...w, [el.dataset.k]: v })); },
  mv(d) {
    const a = [...settings.markets], i = +d.i, j = i + +d.d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set('markets', a);
  },
  clear() {
    const n = picks.comps.length + picks.teams.length + picks.games.length;
    if (!confirm(`Clear all ${n} pick${n === 1 ? '' : 's'}? My games will be empty. Your calendar stays as it is. This can’t be undone.`)) return;
    clearPicks(); toast('All picks cleared');
  },
};

function setWin(id, fn) { set('windows', settings.windows.map((w) => (w.id === id ? fn(w) : w))); }

// Drag to reorder markets (pointer events, works with touch).
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const g = e.target.closest('[data-drag]');
  if (!g) return;
  const row = g.closest('.mrow'), box = document.getElementById('markets');
  drag = { row, box, y0: e.clientY, h: row.offsetHeight, from: +g.dataset.drag, to: +g.dataset.drag };
  row.classList.add('drag'); g.setPointerCapture(e.pointerId); e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dy = e.clientY - drag.y0, n = drag.box.children.length;
  drag.to = Math.max(0, Math.min(n - 1, drag.from + Math.round(dy / drag.h)));
  drag.row.style.transform = `translateY(${dy}px)`;
});
const end = () => {
  if (!drag) return;
  const { row, from, to } = drag; drag = null;
  row.classList.remove('drag'); row.style.transform = '';
  if (from !== to) { const a = [...settings.markets]; const [m] = a.splice(from, 1); a.splice(to, 0, m); set('markets', a); }
};
document.addEventListener('pointerup', end);
document.addEventListener('pointercancel', end);
