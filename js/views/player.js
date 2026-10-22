// Player page (Darren, 22 Oct 2026: "everything is clickable", the Football Manager way). Reached from game
// leaders, box scores, line-ups, key moments and squads; it links on to the player's team and his games.
// The screen wears his team's colours, like a team page.
import { esc, sg } from '../util.js';
import { athlete } from '../espn.js';
import { inkOn, readable, crest, NEUTRAL, hex } from '../identity.js';
import { href, skel, errorCard, backBtn, face } from '../ui.js';

// The three numbers that say most about a game or a season, per sport, in the order they're read.
const KEY = { basketball: ['PTS', 'REB', 'AST', 'MIN'], football: ['YDS', 'TD', 'INT', 'REC', 'CAR', 'TOT', 'SACK'], soccer: ['G', 'A', 'STRT', 'APP', 'SV', 'CS'] };
const GK = ['STRT', 'SV', 'CS', 'GA', 'APP'];
const keys = (sport, labels, gk) => (gk ? GK : KEY[sport]).filter((k) => labels.includes(k)).slice(0, 3);

export default function player([sport, league, id], ctx) {
  const path = `${sport}/${league}`;
  const e = ctx.use(`player:${sport}:${id}`, () => athlete(path, id), 6 * 3600e3);
  const a = e.v?.a, o = e.v?.o || {};
  const t = a?.team || {};
  const bg = readable(t.color ? hex(t.color) : NEUTRAL), ink = inkOn(bg, t.alternateColor ? hex(t.alternateColor) : '');
  const style = `--skin-bg:${bg};--skin-ink:${ink};--skin-card:color-mix(in srgb, ${bg} 88%, #000);--skin-line:color-mix(in srgb, ${ink} 16%, transparent)`;
  let html = `<div class="teampage" style="${style}"><div class="nav" style="color:${ink}">${backBtn(ctx.back?.href || '#/', ctx.back?.label || 'Back')}</div>`;
  if (!a) return html + (e.err ? errorCard('Couldn’t load this player.') : skel(4, true)) + '</div>';
  ctx.title = a.displayName;

  const tpath = sport === 'soccer' ? 'soccer/all' : path;
  const logo = t.logos?.[0]?.href || '';
  const bits = [a.position?.displayName, a.age && `${a.age}`, a.displayHeight, a.citizenship || a.flag?.alt].filter(Boolean);
  html += `<div class="ident who">${face({ ...a, headshot: a.headshot }, { bg: 'color-mix(in srgb, ' + ink + ' 14%, transparent)', ink }, 96)}<div><h1>${esc(a.displayName)}</h1><p>${a.jersey ? `<b class="num">#${esc(a.jersey)}</b> · ` : ''}${esc(bits.join(' · '))}</p>
${t.id ? `<a class="chip plteam" href="${href.team(tpath, t.id)}">${crest({ logo, name: t.displayName, abbr: t.abbreviation }, 22, true)}${esc(t.displayName)}</a>` : ''}</div></div>`;

  // Season: the key numbers big, then every split (season, career, or each competition in football).
  const st = o.statistics;
  if (st?.labels?.length && st.splits?.length) {
    const gk = /goalkeeper/i.test(a.position?.displayName || '');
    const ks = keys(sport, st.labels, gk), first = st.splits[0];
    const val = (sp, k) => sp.stats?.[st.labels.indexOf(k)] ?? '–';
    // Football lists each competition on its own line: the big numbers add up the whole season.
    const season = sport === 'soccer' ? st.splits.filter((sp) => /^\d{4}-\d{2} /.test(sp.displayName || '')) : [];
    const total = (k) => season.reduce((n, sp) => n + (parseFloat(val(sp, k)) || 0), 0);
    const title = season.length > 1 ? `${season[0].displayName.slice(0, 7)} season, all competitions` : first.displayName || 'This season';
    html += `<div class="card"><h2>${esc(title)}</h2><div class="tiles">${ks.map((k) => `<div><b>${esc(season.length > 1 ? String(total(k)) : val(first, k))}</b><span>${esc(k)}</span></div>`).join('')}</div>`;
    html += `<div class="boxwrap"><table class="box"><tr><th></th>${st.labels.map((l) => `<th>${esc(l)}</th>`).join('')}</tr>${st.splits.map((sp) => `<tr><td><span class="pn">${esc((sp.displayName || '').replace(/^\d{4}-\d{2} /, ''))}</span></td>${(sp.stats || []).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></div></div>`;
  }

  // Recent games: each opens its match page; his numbers from that game on the right.
  const log = o.gameLog, evs = Object.values(log?.events || {}).sort((x, y) => new Date(y.gameDate) - new Date(x.gameDate)).slice(0, 6);
  if (evs.length) {
    const gs = log.statistics?.[0], ks = gs ? keys(sport, gs.labels || [], /goalkeeper/i.test(a.position?.displayName || '')) : [];
    const line = (ev) => { const r = gs?.events?.find((x) => x.eventId === ev.id)?.stats; return r ? ks.map((k) => `${r[gs.labels.indexOf(k)]} ${k}`).join(' · ') : ''; };
    const mpath = sport === 'soccer' ? 'soccer/all' : path;
    html += `<div class="card"><h2>Recent games</h2>${evs.map((ev) => {
      const opp = ev.opponent || {}, s = sg(ev.gameDate), r = ev.gameResult;
      return `<a class="li" href="${href.match({ path: mpath, id: ev.id })}">${crest({ logo: opp.logo, name: opp.displayName, abbr: opp.abbreviation }, 30, true)}<span class="grow"><span class="t">${ev.atVs === '@' ? 'at' : 'v'} ${esc(opp.abbreviation || opp.displayName || '')}</span><small>${esc([`${s.wd} ${s.d} ${s.mo}`, ev.leagueShortName].filter(Boolean).join(' · '))}</small></span><div class="when"><b>${esc(ev.score || '')}</b><span>${esc(line(ev))}</span></div>${r ? `<span class="fm ${r === 'T' ? 'D' : r}">${r === 'T' ? 'D' : esc(r)}</span>` : ''}</a>`;
    }).join('')}</div>`;
  }
  html += `<p class="foot" style="color:inherit;opacity:.8;padding-bottom:12px">Data from ESPN.</p>`;
  return html + '</div>';
}
