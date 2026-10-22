// Team page: the whole screen wears the team's colours (PRD 7.2, screen 4).
import { esc, sg, icon } from '../util.js';

const openSquad = new Set(); // squads opened in full this visit
const UNIT = { offense: 'Offense', defense: 'Defense', specialTeam: 'Special teams', injuredReserveOrOut: 'Injured or out', practiceSquad: 'Practice squad' };
import { teamInfo, schedule, roster } from '../espn.js';
import { inkOn, readable, logoSrc, crest, NEUTRAL } from '../identity.js';
import { teamFollowBtn, calBtn, teamPick, href, skel, errorCard, backBtn, face, FACES } from '../ui.js';
import { sportOf, teamKey, settings } from '../store.js';
import { mainMarket, tvShort, KIND } from '../tv.js';

function result(g, id) {
  const me = g.home.id === id ? g.home : g.away, them = g.home.id === id ? g.away : g.home;
  const a = +me.score, b = +them.score;
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a > b ? 'W' : a < b ? 'L' : 'D';
}
function line(g, id, done) {
  const home = g.home.id === id, opp = home ? g.away : g.home, s = sg(g.date);
  // Results read from this team's side: its score first, then W, D or L.
  const me = home ? g.home : g.away, r = done && result(g, id);
  const right = done
    ? `<div class="when"><b>${esc(me.score)}–${esc(opp.score)}</b><span>${s.wd} ${s.d} ${s.mo}</span></div>${r ? `<span class="fm ${r}" role="img" aria-label="${{ W: 'Won', D: 'Draw', L: 'Lost' }[r]}">${r}</span>` : ''}`
    : `<div class="when"><b>${s.wd} ${s.d} ${s.mo}</b><span>${g.timeValid ? s.hm : 'TBC'}${g.postponed ? ' · Postponed' : ''}</span></div>`;
  return `<a class="li" href="${href.match(g)}">${crest(opp, 30, true)}<span class="grow"><span class="t">${home ? 'v' : 'at'} ${esc(opp.short)}</span><small>${esc(g.comp.name)}</small></span>${right}</a>`;
}

export default function team([sport, slug, id], ctx) {
  const path = `${sport}/${slug}`;
  const info = ctx.use(`team:${sport}:${id}`, () => teamInfo(path, id), 3600e3);
  const sched = ctx.use(`sched:${sport}:${id}`, () => schedule(path, id), 10 * 60e3);
  const t = info.v;
  const bg = readable(t?.color || NEUTRAL), ink = inkOn(bg, t?.alt);
  const style = `--skin-bg:${bg};--skin-ink:${ink};--skin-card:color-mix(in srgb, ${bg} 88%, #000);--skin-line:color-mix(in srgb, ${ink} 16%, transparent)`;
  let html = `<div class="teampage" style="${style}"><div class="nav" style="color:${ink}">${backBtn(ctx.back?.href || '#/follow', ctx.back?.label || 'Follow')}</div>`;
  if (!t) return html + (info.err ? errorCard('Couldn’t load this team.') : skel(4, true)) + '</div>';

  const games = (sched.v || []).filter((g) => g.home.id === id || g.away.id === id);
  const now = Date.now();
  const next = games.filter((g) => g.state !== 'post' && new Date(g.date) > now - 4 * 3600e3).sort((a, b) => new Date(a.date) - new Date(b.date));
  const done = games.filter((g) => g.state === 'post').sort((a, b) => new Date(b.date) - new Date(a.date));
  const form = done.slice(0, 5).map((g) => result(g, id)).filter(Boolean).reverse();

  const subBits = [t.nickname && !t.name.includes(t.nickname) ? `The ${t.nickname}` : '', t.abbr, t.standing || t.record].filter(Boolean);
  html += `<div class="ident"><div class="badge">${t.logo ? `<img src="${esc(logoSrc(t.logo, 156))}" alt="" data-ini="${esc(t.abbr)}">` : `<span class="ini" style="width:52px;height:52px">${esc(t.abbr)}</span>`}</div><div><h1>${esc(t.name)}</h1><p>${esc(subBits.join(' · '))}</p></div></div>
<div class="skin" style="background:none;margin:0;padding:6px 0 14px"><div class="acts">${teamFollowBtn(path, t)}${calBtn('team', teamKey(path, t.id), teamPick(path, t))}${form.length ? `<span class="formrow"><span style="font:600 13px var(--text)">Last 5</span><span class="forms" role="img" aria-label="Last ${form.length} results, oldest first: ${form.map((r) => ({ W: 'won', D: 'drew', L: 'lost' }[r])).join(', ')}">${form.map((r) => `<span class="fm ${r}">${r}</span>`).join('')}</span></span>` : ''}</div></div>`;

  if (!sched.v) return html + (sched.err ? errorCard() : skel(3)) + '</div>';
  if (next[0]) {
    const m = mainMarket(next[0]);
    const n = next[0], opp = n.home.id === id ? `v ${n.away.short}` : `at ${n.home.short}`, ns = sg(n.date);
    html += `<div class="card"><h2>Next game: where to watch</h2><a class="li" href="${href.match(n)}">${icon('tv')}<span class="grow"><span class="t">${esc(m.label)} · ${esc(tvShort(m))}</span><small>${esc(`${opp}, ${ns.wd} ${ns.d} ${ns.mo} ${n.timeValid ? ns.hm : 'TBC'}`)} · ${KIND[m.kind]} · all ${settings.markets.length} markets</small></span>${icon('chev', 'chev')}</a></div>`;
  }
  html += `<div class="card"><h2>Next games</h2>${next.length ? next.slice(0, 5).map((g) => line(g, id, false)).join('') : '<p class="note">No games scheduled in the feed yet.</p>'}</div>`;
  if (done.length) html += `<div class="card"><h2>Results</h2>${done.slice(0, 5).map((g) => line(g, id, true)).join('')}</div>`;
  // Where they play, every sport: each competition opens its page (and its table).
  const comps = [...new Map(games.filter((g) => g.league !== 'club.friendly').map((g) => [g.path, g.comp])).values()];
  if (comps.length) html += `<div class="card"><h2>Plays in</h2><div class="chips" style="flex-wrap:wrap;padding:4px 14px 14px">${comps.map((c) => `<a class="chip" href="${href.comp(c.path)}">${crest({ logo: c.logo, name: c.name }, 24, true)}${esc(c.name)}</a>`).join('')}</div></div>`;
  // The squad, like Football Manager: every player opens his page. Football squads need the league, so use the
  // competition this team plays most games in.
  const count = new Map(); for (const g of games) if (g.path !== 'soccer/all' && g.league !== 'club.friendly') count.set(g.path, (count.get(g.path) || 0) + 1);
  const rpath = sportOf(path) === 'soccer' ? (path !== 'soccer/all' ? path : [...count].sort((a, b) => b[1] - a[1])[0]?.[0]) : path;
  if (rpath) html += squad(ctx, rpath, id, { bg, ink });
  html += `<p class="foot" style="color:inherit;opacity:.8;padding-bottom:12px">Following ${esc(t.short)} brings every one of their games, in every competition, into My games.</p>`;
  return html + '</div>';
}

function squad(ctx, rpath, id, kit) {
  const e = ctx.use(`roster:${rpath}:${id}`, () => roster(rpath, id), 6 * 3600e3);
  if (!e.v) return e.err ? '' : skel(2);
  const groups = e.v.filter((g) => g.players.length && g.group !== 'suspended');
  const n = groups.reduce((s, g) => s + g.players.length, 0);
  if (!n) return '';
  const open = openSquad.has(id) || n <= 12;
  let left = open ? Infinity : 10, html = '';
  for (const g of groups) {
    if (left <= 0) break;
    const ps = g.players.slice(0, left); left -= ps.length;
    if (g.group) html += `<h3 class="unit">${esc(UNIT[g.group] || g.group)}</h3>`;
    // Photos where the feed has them (NBA, NFL); football rows lead with the name until it has a photo source.
    const pics = FACES.has(sportOf(rpath));
    html += ps.map((p) => `<a class="li" href="${href.player(rpath, p.id)}">${pics ? face(p, { bg: 'color-mix(in srgb, currentColor 14%, transparent)', ink: 'inherit' }, 34) : ''}<span class="grow"><span class="t">${esc(p.name)}</span><small>${esc([p.posName, p.age && `${p.age}`, p.country].filter(Boolean).join(' · '))}</small></span>${p.jersey ? `<b class="sqn">${esc(p.jersey)}</b>` : ''}</a>`).join('');
  }
  if (!open) html += `<button class="btn ghost more" data-act="squad" data-id="${esc(id)}" style="margin-top:8px">Show all ${n} players</button>`;
  return `<div class="card"><h2>Squad<span style="float:right;font-weight:600;opacity:.8">${n} players</span></h2>${html}</div>`;
}
team.actions = { squad(d, el, e, ctx) { openSquad.add(d.id); ctx.redraw(); } };
