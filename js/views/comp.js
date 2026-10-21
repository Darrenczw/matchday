// Competition page, skinned in the competition's colour: table, fixtures, results, teams (PRD 7.7, screen 3).
import { esc, todayKey, addDays, nightKey, keyLabel } from '../util.js';
import { sportOf, teamKey, following } from '../store.js';
import { compInfo, compList, standings, range, leagueTeams } from '../espn.js';
import { brand, inkOn, readable, logoSrc, crest, lum } from '../identity.js';
import { followBtn, teamFollowBtn, calBtn, gameRow, href, skel, errorCard, backBtn } from '../ui.js';

const tabs = {};
const ord = (n) => (n ? `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th'}` : '');
const followedTeam = (path, t) => following('team', teamKey(path, t.id));

function table(ctx, path) {
  const e = ctx.use(`table:${path}`, () => standings(path), 30 * 60e3);
  if (!e.v) return e.err ? errorCard('Couldn’t load the table.') : skel(6);
  const us = sportOf(path) !== 'soccer';
  const groups = e.v.groups.filter((g) => g.rows.length);
  if (!groups.length) return `<div class="banner info">No table for this competition yet. Cups show groups once they start.</div>`;
  const head = us ? '<span>#</span><span></span><span>Team</span><span>W</span><span>L</span><span>Pct</span>' : '<span>#</span><span></span><span>Team</span><span>P</span><span>GD</span><span>Pts</span>';
  let html = '<div class="tbl">';
  for (const g of groups) {
    if (groups.length > 1) html += `<h2 class="cap grp">${esc(g.name)}</h2>`;
    html += `<div class="hd" aria-hidden="true">${head}</div>`;
    for (const r of g.rows) {
      const t = r.team, mine = followedTeam(path, t) && t.color;
      const bg = mine ? readable(t.color) : '';
      const style = mine ? ` style="background:${bg};color:${inkOn(bg, t.alt)}${lum(bg) > 0.7 ? ';box-shadow:inset 0 0 0 1px rgba(18,19,24,.15)' : ''}"` : '';
      const sw = `<span class="sw" aria-hidden="true"><i style="background:${t.color || '#888'}"></i><i style="background:${t.alt || t.color || '#888'}"></i></span>`;
      const cells = us ? `<span>${esc(r.w)}</span><span>${esc(r.l)}</span><span class="pts">${esc(r.pct)}</span>` : `<span>${esc(r.gp)}</span><span>${esc(r.gd)}</span><span class="pts">${esc(r.pts)}</span>`;
      html += `<a class="tr" href="${href.team(path, t.id)}"${style} aria-label="${esc(us ? `${ord(r.rank)}, ${t.name}. Won ${r.w}, lost ${r.l}, win percentage ${r.pct}.` : `${ord(r.rank)}, ${t.name}. Played ${r.gp}, goal difference ${r.gd}, ${r.pts} points.`) + (followedTeam(path, t) ? ' You follow them.' : '')}"><span class="pos">${r.rank || ''}</span>${sw}<span class="nm">${crest(t, 24, !!mine)}<span>${esc(t.short)}</span></span>${cells}</a>`;
    }
  }
  return html + '</div>';
}

function games(ctx, path, ahead) {
  const t = todayKey();
  const [k0, k1] = ahead ? [t, addDays(t, 14)] : [addDays(t, -14), t];
  const e = ctx.use(`cg:${path}:${ahead}`, () => range(path, k0, k1), ahead ? 60e3 : 10 * 60e3);
  if (!e.v) return e.err ? errorCard() : skel(5);
  let list = e.v.filter((g) => (ahead ? g.state !== 'post' : g.state === 'post'));
  if (!ahead) list = list.reverse();
  if (!list.length) return `<div class="banner info">${ahead ? 'No games in the next 2 weeks.' : 'No results in the last 2 weeks.'}</div>`;
  let html = '', last = '';
  for (const g of list) {
    const k = nightKey(g.date);
    if (k !== last) { html += `<div class="sect"><h2 class="cap">${keyLabel(k)}</h2></div>`; last = k; }
    html += gameRow(g, { why: false });
  }
  return html;
}

function teams(ctx, path) {
  const e = ctx.use(`teams:${path}`, () => leagueTeams(path), 12 * 3600e3);
  if (!e.v) return e.err ? errorCard() : skel(6);
  return `<div class="card">${e.v.map((t) => `<div class="li"><a class="grow" href="${href.team(path, t.id)}" style="display:flex;align-items:center;gap:12px;min-width:0">${crest(t, 30)}<span class="grow"><span class="t">${esc(t.name)}</span><small>${esc(t.abbr)}</small></span></a>${teamFollowBtn(path, t, { lite: true })}</div>`).join('')}</div>`;
}

export default function comp([sport, slug], ctx) {
  const path = `${sport}/${slug}`;
  ctx.sport = sport;
  if (sport === 'soccer') ctx.use('comps', compList, 24 * 3600e3); // names and logos for competitions not seen yet
  const c = compInfo(path);
  const bg = brand(path), ink = inkOn(bg, '#ffffff');
  const tab = tabs[path] || 'table';
  const st = ctx.use(`table:${path}`, () => standings(path), 30 * 60e3).v;
  const sub = [sport === 'soccer' ? c.region : 'Whole league', st?.season && `${st.season} season`, st?.played && `${st.played} games played`].filter(Boolean).join(' · ');
  let html = `<div class="skin" style="--skin-bg:${bg};--skin-ink:${ink}"><div class="nav">${backBtn(ctx.back?.href || '#/follow', ctx.back?.label || 'Follow')}<span></span><span class="navr">${calBtn('comp', path, { path, name: c.name, logo: c.logo }, { compact: true })}${followBtn('comp', path, { path, name: c.name, logo: c.logo })}</span></div>
<div class="ident"><div class="badge">${c.logo ? `<img src="${esc(logoSrc(c.logo, 156))}" alt="" data-ini="${esc(c.name.slice(0, 3).toUpperCase())}" data-flat="1">` : ''}</div><div><h1>${esc(c.name)}</h1><p>${esc(sub)}</p></div></div></div>`;
  html += `<div class="seg" role="group" aria-label="Show">${[['table', 'Table'], ['next', 'Fixtures'], ['done', 'Results'], ['teams', 'Teams']].map(([k, l]) => `<button data-act="tab" data-t="${k}" data-p="${path}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>`;
  if (tab === 'table') html += table(ctx, path);
  else if (tab === 'next') html += games(ctx, path, true);
  else if (tab === 'done') html += games(ctx, path, false);
  else html += teams(ctx, path);
  return html;
}
comp.actions = { tab(d, el, e, ctx) { tabs[d.p] = d.t; ctx.redraw(); } };
