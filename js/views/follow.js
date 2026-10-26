// Follow: browse and search. Competitions, clubs, national teams, NFL and NBA (PRD 7.1).
import { esc, icon } from '../util.js';
import { picks, sportOf } from '../store.js';
import { compList, leagueTeams, search, compInfo, isOver } from '../espn.js';
import { crest, compImg, compLogo, REGION_ORDER } from '../identity.js';
import { followBtn, teamFollowBtn, href, skel, errorCard } from '../ui.js';
import { liveBar } from '../livebar.js';

const state = { sport: 'soccer', q: '', open: new Set(), allNations: false };
const POPULAR = ['eng.1', 'uefa.champions', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.europa', 'sgp.1'];
const US = { nfl: 'football/nfl', nba: 'basketball/nba' };

const compPick = (c) => ({ path: c.path, name: c.name, logo: c.logo });
function compRow(c, sub) {
  return `<div class="li"><a class="grow" href="${href.comp(c.path)}" style="display:flex;align-items:center;gap:12px;min-width:0">
${compImg(c.logo, 32, c.name)}
<span class="grow"><span class="t">${esc(c.name)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span></a>${followBtn('comp', c.path, compPick(c), { lite: true })}</div>`;
}
function teamRow(path, t, sub) {
  const sw = t.color ? `<span class="sw" aria-hidden="true"><i style="background:${t.color}"></i><i style="background:${t.alt || t.color}"></i></span>` : '';
  return `<div class="li"><a class="grow" href="${href.team(path, t.id)}" style="display:flex;align-items:center;gap:12px;min-width:0">${crest(t, 32)}
<span class="grow"><span class="t">${esc(t.name)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${sw}</a>${teamFollowBtn(path, t, { lite: true })}</div>`;
}

// What you follow in the sport shown below, so the chips and the list agree.
function chips() {
  const sp = { soccer: 'soccer', nfl: 'football', nba: 'basketball' }[state.sport];
  const mine = (x) => sportOf(x.path) === sp;
  const items = [
    ...picks.teams.filter(mine).map((t) => `<a class="chip" href="${href.team(t.path, t.id)}">${crest(t, 26)}${esc(t.name)}</a>`),
    ...picks.comps.filter(mine).map((c) => `<a class="chip" href="${href.comp(c.path)}">${crest({ logo: c.logo, name: c.name }, 26)}${esc(c.name)}</a>`),
    ...picks.games.filter((g) => mine(g) && !isOver(g)).map((g) => `<a class="chip txt" href="#/m/${g.path}/${g.id}">${esc(g.name)}</a>`),
  ];
  return items.length ? `<div class="sect"><h2 class="cap">You follow</h2><span>${items.length}</span></div><div class="chips">${items.join('')}</div>` : '';
}

function searchResults(ctx, comps) {
  const q = state.q.trim().toLowerCase();
  const local = (comps || []).filter((c) => c.name.toLowerCase().includes(q) || c.region.toLowerCase().includes(q)).slice(0, 8);
  local.push(...[compInfo('football/nfl'), compInfo('basketball/nba')].filter((c) => c.name.toLowerCase().includes(q)));
  const e = ctx.use(`search:${q}`, () => search(q), 10 * 60e3);
  let html = '';
  if (local.length) html += `<div class="card"><h2>Competitions</h2>${local.map((c) => compRow(c, c.region)).join('')}</div>`;
  if (e.v) {
    const teams = e.v.filter((t, i, a) => a.findIndex((x) => x.id === t.id && sportOf(x.path) === sportOf(t.path)) === i);
    if (teams.length) html += `<div class="card"><h2>Teams</h2>${teams.map((t) => teamRow(t.path, t, t.sub)).join('')}</div>`;
    else if (!local.length) html += `<div class="banner info">${icon('search')}<span>Nothing found for “${esc(state.q)}”. Try a club, country or league name.</span></div>`;
  } else if (e.err) html += errorCard('Search isn’t reachable right now.');
  else html += skel(2);
  return html;
}

function football(ctx, comps) {
  if (!comps) return skel(5);
  const by = new Map(comps.map((c) => [c.slug, c]));
  let html = `<div class="card"><h2>Popular</h2>${POPULAR.map((s) => by.get(s)).filter(Boolean).map((c) => compRow(c, c.region)).join('')}</div>`;
  const n = ctx.use('nations', () => leagueTeams('soccer/fifa.world'), 12 * 3600e3);
  if (n.v?.length) {
    const list = state.allNations ? n.v : n.v.filter((t) => ['England', 'Japan', 'South Korea', 'Brazil', 'Argentina', 'France'].includes(t.name));
    html += `<div class="card"><div class="h">National teams<button class="btn sm ghost" data-act="nations">${state.allNations ? 'Show fewer' : `All ${n.v.length} at the World Cup`}</button></div>${list.map((t) => teamRow('soccer/fifa.world', t, 'Every competition, friendlies too')).join('')}
<p class="note">Looking for another country, like Singapore? Search for it above.</p></div>`;
  }
  const groups = new Map();
  for (const c of comps) { if (!groups.has(c.region)) groups.set(c.region, []); groups.get(c.region).push(c); }
  const names = [...groups.keys()].sort((a, b) => ((REGION_ORDER.indexOf(a) + 1 || 99) - (REGION_ORDER.indexOf(b) + 1 || 99)) || a.localeCompare(b));
  html += `<div class="sect"><h2 class="cap">Every competition</h2><span>${comps.length}, by country</span></div><div class="card">`;
  for (const r of names) {
    const open = state.open.has(r), list = groups.get(r);
    html += `<button class="li" style="width:100%;text-align:left" data-act="region" data-r="${esc(r)}" aria-expanded="${open}"><span class="grow"><span class="t">${esc(r)}</span><small>${list.length} competition${list.length > 1 ? 's' : ''}</small></span>${icon(open ? 'up' : 'down', 'chev')}</button>`;
    if (open) html += list.map((c) => compRow(c)).join('');
  }
  return html + '</div>';
}

function usSport(ctx, key) {
  const path = US[key], info = compInfo(path);
  const e = ctx.use(`teams:${path}`, () => leagueTeams(path), 12 * 3600e3);
  let html = `<div class="card"><h2>Whole league</h2>${compRow({ ...info, logo: compLogo(path) }, `Every ${info.name} game`)}</div>`;
  if (e.v) html += `<div class="card"><h2>Teams</h2>${e.v.map((t) => teamRow(path, t, t.abbr)).join('')}<p class="note">To follow one game, open it from a team page or This week and tap Follow.</p></div>`;
  else html += e.err ? errorCard() : skel(6);
  return html;
}

// A link can name the tab (#/follow/nfl). It applies when you arrive (each visit gets new params), so it
// never overrides a tab you tap afterwards.
let arrived = null;
export default function followView(params, ctx) {
  if (params !== arrived) { arrived = params; if (params[0]) state.sport = params[0]; }
  ctx.sport = { soccer: 'soccer', nfl: 'football', nba: 'basketball' }[state.sport];
  const comps = ctx.use('comps', compList, 24 * 3600e3);
  let html = liveBar(ctx) + `<header class="top"><h1>Follow</h1><span class="sub">${state.sport === 'soccer' && comps.v ? `${comps.v.length} competitions` : state.sport === 'nfl' ? '32 teams' : state.sport === 'nba' ? '30 teams' : ''}</span></header>
<label class="search">${icon('search')}<span class="sr">Search</span><input type="search" placeholder="Search clubs, leagues, countries" value="${esc(state.q)}" data-input="q" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search">${state.q ? `<button type="button" data-act="clear" aria-label="Clear search">${icon('x')}</button>` : ''}</label>`;
  if (state.q.trim().length >= 2) return html + searchResults(ctx, comps.v);
  html += `<div class="seg" role="group" aria-label="Sport">${[['soccer', 'Football'], ['nfl', 'NFL'], ['nba', 'NBA']].map(([k, l]) => `<button data-act="sport" data-s="${k}" aria-pressed="${state.sport === k}">${l}</button>`).join('')}</div>`;
  html += chips();
  if (state.sport === 'soccer') html += comps.err && !comps.v ? errorCard() : football(ctx, comps.v);
  else html += usSport(ctx, state.sport);
  return html;
}

let qTimer = 0;
followView.actions = {
  // The link follows the tab, so Back and a reload come back to it. replaceState: no new history step, no reload.
  sport(d, el, e, ctx) { state.sport = d.s; history.replaceState(null, '', `#/follow/${d.s}`); dispatchEvent(new Event('md:replaced')); ctx.redraw(); },
  region(d, el, e, ctx) { state.open.has(d.r) ? state.open.delete(d.r) : state.open.add(d.r); ctx.redraw(); },
  nations(d, el, e, ctx) { state.allNations = !state.allNations; ctx.redraw(); },
  clear(d, el, e, ctx) { state.q = ''; document.querySelector('[data-input="q"]').value = ''; ctx.redraw(); },
  q(v, el, ctx) { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = v; ctx.redraw(); }, 250); },
};
