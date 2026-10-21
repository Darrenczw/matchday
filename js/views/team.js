// Team page: the whole screen wears the team's colours (PRD 7.2, screen 4).
import { esc, sg, icon } from '../util.js';
import { sportOf } from '../store.js';
import { teamInfo, schedule } from '../espn.js';
import { inkOn, logoSrc, crest, NEUTRAL } from '../identity.js';
import { teamFollowBtn, href, skel, errorCard, backBtn } from '../ui.js';
import { mainMarket, chans, KIND } from '../tv.js';

function result(g, id) {
  const me = g.home.id === id ? g.home : g.away, them = g.home.id === id ? g.away : g.home;
  const a = +me.score, b = +them.score;
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a > b ? 'W' : a < b ? 'L' : 'D';
}
function line(g, id, done) {
  const home = g.home.id === id, opp = home ? g.away : g.home, s = sg(g.date);
  const right = done
    ? `<div class="when"><b>${esc(g.home.score)}–${esc(g.away.score)}</b><span>${s.wd} ${s.d} ${s.mo}</span></div>`
    : `<div class="when"><b>${s.wd} ${s.d} ${s.mo}</b><span>${g.timeValid ? s.hm : 'TBC'}${g.postponed ? ' · Postponed' : ''}</span></div>`;
  return `<a class="li" href="${href.match(g)}">${crest(opp, 30, true)}<span class="grow"><span class="t">${home ? 'v' : 'at'} ${esc(opp.short)}</span><small>${esc(g.comp.name)}</small></span>${right}</a>`;
}

export default function team([sport, slug, id], ctx) {
  const path = `${sport}/${slug}`;
  const info = ctx.use(`team:${sport}:${id}`, () => teamInfo(path, id), 3600e3);
  const sched = ctx.use(`sched:${sport}:${id}`, () => schedule(path, id), 10 * 60e3);
  const t = info.v;
  const bg = t?.color || NEUTRAL, ink = inkOn(bg, t?.alt);
  const style = `--skin-bg:${bg};--skin-ink:${ink};--skin-card:color-mix(in srgb, ${bg} 88%, #000);--skin-line:color-mix(in srgb, ${ink} 16%, transparent)`;
  let html = `<div class="teampage" style="${style}"><div class="nav" style="color:${ink}">${backBtn('#/follow', 'Follow')}</div>`;
  if (!t) return html + (info.err ? errorCard('Couldn’t load this team.') : skel(4, true)) + '</div>';

  const games = (sched.v || []).filter((g) => g.home.id === id || g.away.id === id);
  const now = Date.now();
  const next = games.filter((g) => g.state !== 'post' && new Date(g.date) > now - 4 * 3600e3).sort((a, b) => new Date(a.date) - new Date(b.date));
  const done = games.filter((g) => g.state === 'post').sort((a, b) => new Date(b.date) - new Date(a.date));
  const form = done.slice(0, 5).map((g) => result(g, id)).filter(Boolean).reverse();

  const subBits = [t.nickname && !t.name.includes(t.nickname) ? `The ${t.nickname}` : '', t.abbr, t.standing || t.record].filter(Boolean);
  html += `<div class="ident"><div class="badge">${t.logo ? `<img src="${esc(logoSrc(t.logo, 156))}" alt="" data-ini="${esc(t.abbr)}">` : `<span class="ini" style="width:52px;height:52px">${esc(t.abbr)}</span>`}</div><div><h1>${esc(t.name)}</h1><p>${esc(subBits.join(' · '))}</p></div></div>
<div class="skin" style="background:none;margin:0;padding:6px 0 14px"><div class="acts">${teamFollowBtn(path, t)}${form.length ? `<span style="font:600 13px var(--text)">Form</span><span class="forms" aria-label="Last ${form.length} results, oldest first: ${form.join(' ')}">${form.map((r) => `<span class="fm ${r}">${r}</span>`).join('')}</span>` : ''}</div></div>`;

  if (!sched.v) return html + (sched.err ? errorCard() : skel(3)) + '</div>';
  if (next[0]) {
    const m = mainMarket(next[0]);
    html += `<div class="card"><h2>Next game: where to watch</h2><a class="li" href="${href.match(next[0])}">${icon('tv')}<span class="grow"><span class="t">${esc(m.label)} · ${m.kind === 'none' ? 'Not listed yet' : esc(chans(m))}</span><small>${KIND[m.kind]} · tap for all 8 markets</small></span>${icon('chev', 'chev')}</a></div>`;
  }
  html += `<div class="card"><h2>Next games</h2>${next.length ? next.slice(0, 5).map((g) => line(g, id, false)).join('') : '<p class="note">No games scheduled in the feed yet.</p>'}</div>`;
  if (done.length) html += `<div class="card"><h2>Results</h2>${done.slice(0, 5).map((g) => line(g, id, true)).join('')}</div>`;
  if (sportOf(path) === 'soccer') {
    const comps = [...new Map(games.filter((g) => g.league !== 'club.friendly').map((g) => [g.path, g.comp])).values()];
    if (comps.length) html += `<div class="card"><h2>Plays in</h2><div class="chips" style="flex-wrap:wrap;padding:4px 14px 14px">${comps.map((c) => `<a class="chip" href="${href.comp(c.path)}">${crest({ logo: c.logo, name: c.name }, 24, true)}${esc(c.name)}</a>`).join('')}</div></div>`;
  }
  html += `<p class="foot" style="color:inherit;opacity:.8;padding-bottom:12px">Following ${esc(t.short)} brings every one of their games, in every competition, into My games.</p>`;
  return html + '</div>';
}
