// This week: "Good for you" games with the reason, one tap to follow (PRD 7.8).
import { esc, sg, todayKey, addDays, keyLabel } from '../util.js';
import { settings, picks } from '../store.js';
import { range, isMine } from '../espn.js';
import { kitsFor, crest } from '../identity.js';
import { reasons } from '../suggest.js';
import { mainMarket } from '../tv.js';
import { followBtn, href, skel, errorCard } from '../ui.js';

const state = { f: 'all', open: new Set() };
const PER_DAY = 4; // a busy NBA morning can have 10 games; show the first 4, the rest on tap
const SPORT = { nfl: 'football/nfl', nba: 'basketball/nba' };

function paths() {
  const p = [];
  if (settings.suggest.nfl) p.push(SPORT.nfl);
  if (settings.suggest.nba) p.push(SPORT.nba);
  if (settings.suggest.soccer) p.push(...new Set(['soccer/eng.1', 'soccer/uefa.champions', ...picks.comps.map((c) => c.path).filter((x) => x.startsWith('soccer/'))]));
  return p;
}

function card(g) {
  const k = kitsFor(g), s = sg(g.date), why = reasons(g), m = mainMarket(g);
  const half = (x, r) => `<div class="p${r ? ' r' : ''}${x.light ? ' lightkit' : ''}" style="background:${x.bg};color:${x.ink}">${r ? `<b>${esc(x.team.abbr)}</b>${crest(x.team, 26, true)}` : `${crest(x.team, 26, true)}<b>${esc(x.team.abbr)}</b>`}</div>`;
  const mine = isMine(g, picks);
  const pick = { id: g.id, path: g.path, date: g.date, name: g.sport === 'soccer' ? `${g.home.abbr} v ${g.away.abbr}` : `${g.away.abbr} @ ${g.home.abbr}` };
  const action = mine && !picks.games.some((x) => x.id === g.id) ? '<span class="tag exact">In My games</span>' : followBtn('game', g.id, pick, { label: 'Follow', lite: true });
  return `<div class="card"><a class="row" style="margin:0;border-radius:0;box-shadow:none;grid-template-columns:1fr 1fr" href="${href.match(g)}">${half(k.left)}${half(k.right, true)}</a>
<div class="li" style="border:0;align-items:center"><span class="grow"><span class="t" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="num" style="font-size:20px">${s.wd} ${g.timeValid ? s.hm : 'TBC'}</span>${why.map((w) => `<span class="tag why">${esc(w)}</span>`).join('')}</span>
<small>${esc(g.comp.name)} · ${esc(m.label)} · ${m.kind === 'none' ? 'Not listed' : esc(m.channels[0] + (m.channels.length > 1 ? ` · ${m.channels.length - 1} more` : ''))}</small></span>${action}</div></div>`;
}

export default function week(params, ctx) {
  if (state.f !== 'all') ctx.sport = state.f;
  const t = todayKey();
  const list = paths();
  const e = ctx.use(`week:${list.join(',')}:${t}`, async () => {
    const res = await Promise.allSettled(list.map((p) => range(p, t, addDays(t, 7))));
    if (res.length && res.every((r) => r.status === 'rejected')) throw res[0].reason;
    return res.flatMap((r) => r.value || []);
  }, 10 * 60e3);
  let html = `<header class="top"><h1>This week</h1><span class="sub">Good for you</span></header>
<p class="lede">Games in your free hours, played overseas, on a streamer, or in the playoffs. Nothing is added until you tap Follow.</p>
<div class="chips" role="group" aria-label="Sport">${[['all', 'All'], ['soccer', 'Football'], ['football', 'NFL'], ['basketball', 'NBA']].map(([k, l]) => `<button class="chip txt" data-act="f" data-f="${k}" aria-pressed="${state.f === k}">${l}</button>`).join('')}</div>`;
  if (!list.length) return html + `<div class="banner info">Suggestions are off for every sport. Turn them on in <a href="#/settings" style="text-decoration:underline">Settings</a>.</div>`;
  if (!e.v) return html + (e.err ? errorCard() : skel(4));
  const now = Date.now();
  const games = [...new Map(e.v.map((g) => [g.id, g])).values()]
    .filter((g) => g.state === 'pre' && !g.postponed && new Date(g.date) > now && (state.f === 'all' || g.sport === state.f))
    .filter((g) => reasons(g).length)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!games.length) return html + `<div class="banner info">No games match your free hours and rules this week. You can change them in <a href="#/settings" style="text-decoration:underline">Settings</a>.</div>`;
  const days = new Map();
  for (const g of games) { const k = sg(g.date).key; days.set(k, [...(days.get(k) || []), g]); }
  for (const [k, list] of days) {
    const open = state.open.has(k) || list.length <= PER_DAY + 1;
    html += `<div class="sect"><h2 class="cap">${keyLabel(k)}</h2>${list.length > 1 ? `<span>${list.length} games</span>` : ''}</div>`;
    html += (open ? list : list.slice(0, PER_DAY)).map(card).join('');
    if (!open) html += `<button class="btn ghost more" data-act="more" data-k="${k}">Show ${list.length - PER_DAY} more</button>`;
  }
  return html + `<p class="foot">${games.length} games. Football suggestions come from the Premier League, Champions League and the competitions you follow.</p>`;
}
week.actions = {
  f(d, el, e, ctx) { state.f = d.f; ctx.redraw(); },
  more(d, el, e, ctx) { state.open.add(d.k); ctx.redraw(); },
};
