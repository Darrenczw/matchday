// Match page. What comes first changes with the game state: before, live, full time (PRD 7.6).
import { esc, sg, countdown, icon } from '../util.js';
import { following } from '../store.js';
import { summary, norm, liveLabel, net } from '../espn.js';
import { kitsFor, clashNote, crest } from '../identity.js';
import { allMarkets, mainMarket, chans, KIND, rightsChecked } from '../tv.js';
import { followBtn, backBtn, skel, errorCard, movedFrom, movedText, href } from '../ui.js';
import { reasons } from '../suggest.js';

// ---------- Pieces
function header(g, k, d) {
  const s = sg(g.date);
  if (g.state === 'pre') {
    const moved = movedFrom(g);
    const side = (x, r) => `<div class="shirt${r ? ' r' : ''}${x.light ? ' lightkit' : ''}" style="background:${x.bg};color:${x.ink}">${crest(x.team, 46, true)}<span class="tn">${esc(x.team.short)}</span></div>`;
    return `<section class="mh pre">${side(k.left)}${side(k.right, true)}<div class="ko"><b>${g.timeValid ? s.hm : 'TBC'}</b><span>${s.wd} ${s.d} ${s.mo} · SGT</span>${g.postponed ? '<span class="moved">Postponed</span>' : moved ? `<span class="moved">${movedText(moved)}</span>` : `<span class="cd">${g.timeValid ? countdown(g.date) : 'Time to be confirmed'}</span>`}</div></section>`;
  }
  const sc = scorers(g, d);
  const side = (x, r) => `<div class="shirt${r ? ' r' : ''}${x.light ? ' lightkit' : ''}" style="background:${x.bg};color:${x.ink}">${crest(x.team, 46, true)}<b class="sc">${esc(x.team.score ?? '0')}</b><span><span class="tn">${esc(x.team.short)}</span>${sc[x.team.id] ? `<span class="scorers" style="display:block">${esc(sc[x.team.id])}</span>` : ''}</span></div>`;
  const pill = g.state === 'in' ? `<div class="state"><i class="dot"></i><span>${esc(liveLabel(g))} · Live</span></div>` : `<div class="state"><span>${esc(g.sport === 'soccer' ? 'Full time' : 'Final')}${g.detail && !/^(FT|Final)$/i.test(g.detail) ? ` · ${esc(g.detail)}` : ''}</span></div>`;
  return `<section class="mh">${side(k.left)}${side(k.right, true)}${pill}</section>`;
}
function scorers(g, d) {
  const out = {};
  if (g.sport !== 'soccer') return out;
  for (const e of d.keyEvents || []) {
    if (!isGoal(e)) continue;
    const who = e.participants?.[0]?.athlete?.shortName || e.participants?.[0]?.athlete?.displayName?.split(' ').slice(-1)[0];
    const id = e.team?.id; if (!who || !id) continue;
    const own = /own goal/i.test(e.type?.text || '');
    out[id] = (out[id] ? out[id] + ', ' : '') + `${who} ${e.clock?.displayValue || ''}${own ? ' (og)' : ''}`.trim();
  }
  return out;
}
const isGoal = (e) => /goal|penalty - scored/i.test(e.type?.text || '') && !/disallowed|missed|saved/i.test(e.type?.text || '');
const isCard = (e) => /card/i.test(e.type?.text || '');

function tvMain(g) {
  const m = mainMarket(g);
  return `<div class="card"><h2>Where to watch</h2><div class="tvmain"><span class="mk">${esc(m.m.toUpperCase())}</span><b>${m.kind === 'none' ? 'Not listed' : esc(m.channels.join(' / '))}</b><span class="tag ${m.kind}">${KIND[m.kind]}</span></div>${m.note ? `<p class="note" style="padding-top:0">${esc(m.note)}${m.source ? ` · <a href="${esc(m.source)}" target="_blank" rel="noopener">source</a>` : ''}</p>` : ''}</div>`;
}
function tvAll(g) {
  const [main, ...rest] = allMarkets(g);
  const listed = rest.filter((x) => x.kind !== 'none'), none = rest.filter((x) => x.kind === 'none');
  let html = `<div class="card"><h2>Where to watch</h2><div class="tvmain"><span class="mk">${esc(main.m.toUpperCase())}</span><b>${main.kind === 'none' ? 'Not listed' : esc(main.channels.join(' / '))}</b><span class="tag ${main.kind}">${KIND[main.kind]}</span></div>`;
  html += listed.map((x) => `<div class="tvrow"><span class="m">${esc(x.label)}</span><span class="c">${esc(chans(x, ', '))}${x.source ? ` <a class="src" href="${esc(x.source)}" target="_blank" rel="noopener" aria-label="Source for ${esc(x.label)}">source</a>` : ''}</span><span class="tag ${x.kind}">${KIND[x.kind]}</span></div>`).join('');
  if (none.length) html += `<div class="tvrow"><span class="c" style="color:var(--mute)">Not listed: ${esc(none.map((x) => x.label).join(', '))}</span></div>`;
  html += `<p class="note">Exact = listed for this game. Likely = holds the rights this season${rightsChecked() ? ` (checked ${esc(rightsChecked())})` : ''}. Game-by-game listings for markets outside the US come with the TV helper.</p></div>`;
  return html;
}

function moments(g, d, k, newestFirst) {
  let list = [], subs = 0;
  if (g.sport === 'soccer') {
    for (const e of d.keyEvents || []) {
      if (/substitution/i.test(e.type?.text || '')) { subs++; continue; }
      if (!isGoal(e) && !isCard(e) && !/var/i.test(e.type?.text || '')) continue;
      const p = e.participants || [];
      const who = p[0]?.athlete?.displayName || e.text || '';
      const sub = isGoal(e) ? (p[1] ? `Assist ${p[1].athlete?.displayName}` : /own goal/i.test(e.type.text) ? 'Own goal' : /penalty/i.test(e.type.text) ? 'Penalty' : '') : isCard(e) ? e.type.text : e.type?.text;
      list.push({ min: e.clock?.displayValue || '', team: e.team?.id, who, sub, kind: isGoal(e) ? 'goal' : /red/i.test(e.type.text) ? 'red' : isCard(e) ? 'yellow' : 'var' });
    }
  } else if (g.sport === 'football') {
    for (const p of d.scoringPlays || []) list.push({ min: `Q${p.period?.number} ${p.clock?.displayValue || ''}`, team: p.team?.id, who: p.type?.text || 'Score', sub: p.text, kind: 'goal', abbr: p.type?.abbreviation });
  }
  if (!list.length && !subs) return '';
  if (newestFirst) list.reverse();
  const leftId = k.left.team.id;
  const badge = (m) => {
    const side = m.team === leftId ? k.left : k.right;
    if (m.kind === 'goal') return `<span class="goal" style="background:${side.bg};color:${side.ink}${side.light ? ';box-shadow:inset 0 0 0 1px rgba(18,19,24,.2)' : ''}">${esc(m.abbr || (g.sport === 'soccer' ? 'GOAL' : 'SCORE'))}</span>`;
    if (m.kind === 'red') return '<span class="card-r" aria-label="Red card"></span>';
    if (m.kind === 'yellow') return '<span class="card-y" aria-label="Yellow card"></span>';
    return '<span class="tag likely">VAR</span>';
  };
  const rows = list.map((m) => {
    const left = m.team === leftId;
    const txt = `<span><b>${esc(m.who)}</b>${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</span>`;
    return left
      ? `<div class="ev"><span class="min">${esc(m.min)}</span><span class="who">${badge(m)}${txt}</span><span></span></div>`
      : `<div class="ev"><span></span><span class="who r">${txt}${badge(m)}</span><span class="min r">${esc(m.min)}</span></div>`;
  }).join('');
  return `<div class="card"><div class="h">Key moments<span>${newestFirst ? 'Newest first' : 'In order'}</span></div>${rows}${subs ? `<div class="ev" style="grid-template-columns:1fr"><span style="color:var(--mute);font-weight:600">${subs} substitution${subs > 1 ? 's' : ''}</span></div>` : ''}</div>`;
}

function quarters(g, d, k) {
  if (g.sport === 'soccer') return '';
  const comp = d.header?.competitions?.[0];
  const row = (x) => comp?.competitors?.find((c) => c.id === x.team.id || c.team?.id === x.team.id);
  const L = row(k.left), R = row(k.right);
  const n = Math.max(L?.linescores?.length || 0, R?.linescores?.length || 0);
  if (!n) return '';
  const cells = (c) => Array.from({ length: n }, (_, i) => `<td>${esc(c?.linescores?.[i]?.displayValue ?? '')}</td>`).join('');
  const head = Array.from({ length: n }, (_, i) => `<th>${i < 4 ? `Q${i + 1}` : 'OT'}</th>`).join('');
  return `<div class="card"><h2>${g.sport === 'basketball' ? 'Quarters' : 'Score by quarter'}</h2><table class="lines"><tr><th>Team</th>${head}<th>T</th></tr>
<tr><td>${esc(k.left.team.abbr)}</td>${cells(L)}<td>${esc(k.left.team.score ?? '')}</td></tr><tr><td>${esc(k.right.team.abbr)}</td>${cells(R)}<td>${esc(k.right.team.score ?? '')}</td></tr></table></div>`;
}

const STATS = {
  soccer: [['possessionPct', 'Possession', '%'], ['totalShots', 'Shots'], ['shotsOnTarget', 'On target'], ['wonCorners', 'Corners'], ['foulsCommitted', 'Fouls'], ['saves', 'Saves']],
  football: [['totalYards', 'Total yards'], ['firstDowns', 'First downs'], ['netPassingYards', 'Passing yards'], ['rushingYards', 'Rushing yards'], ['turnovers', 'Turnovers'], ['possessionTime', 'Possession']],
  basketball: [['fieldGoalPct', 'Field goals', '%'], ['threePointFieldGoalPct', '3-pointers', '%'], ['totalRebounds', 'Rebounds'], ['assists', 'Assists'], ['turnovers', 'Turnovers'], ['steals', 'Steals']],
};
function stats(g, d, k) {
  const teams = d.boxscore?.teams || [];
  const of = (x) => Object.fromEntries((teams.find((t) => t.team?.id === x.team.id)?.statistics || []).map((s) => [s.name, s.displayValue]));
  const a = of(k.left), b = of(k.right);
  const rows = STATS[g.sport].filter(([n]) => a[n] != null && b[n] != null).map(([n, label, unit = '']) => {
    const num = (v) => (String(v).includes(':') ? String(v).split(':').reduce((m, s) => m * 60 + +s, 0) : parseFloat(v) || 0);
    const x = num(a[n]), y = num(b[n]), tot = x + y || 1;
    const bar = (side, v) => `<i style="flex:${Math.max(v / tot, 0.02)};background:${side.bg}${side.light ? ';box-shadow:inset 0 0 0 1px rgba(18,19,24,.25)' : ''}"></i>`;
    return `<div class="stat"><div class="l"><b>${esc(a[n])}${unit}</b><span>${label}</span><b>${esc(b[n])}${unit}</b></div><div class="bars" aria-hidden="true">${bar(k.left, x)}${bar(k.right, y)}</div></div>`;
  });
  return rows.length ? `<div class="card"><h2>Stats</h2>${rows.join('')}</div>` : '';
}

// NBA and NFL: each team's top players (points, rebounds, assists / passing, rushing, receiving).
function leaders(g, d, k) {
  if (g.sport === 'soccer' || !d.leaders?.length) return '';
  const col = (x) => {
    const L = d.leaders.find((l) => l.team?.id === x.team.id);
    const rows = (L?.leaders || []).slice(0, 3).map((c) => { const p = c.leaders?.[0]; return p ? `<p><i style="width:auto;min-width:20px">${esc(p.displayValue?.split(',')[0] || '')}</i>${esc(p.athlete?.shortName || p.athlete?.displayName || '')} <span style="color:var(--mute)">${esc(c.displayName?.toLowerCase() || '')}</span></p>` : ''; }).join('');
    return `<div><h3>${crest(x.team, 22)}${esc(x.team.abbr)}</h3>${rows}</div>`;
  };
  return `<div class="card"><h2>Top players</h2><div class="xi">${col(k.left)}${col(k.right)}</div></div>`;
}

function lineups(g, d, k) {
  if (g.sport !== 'soccer') return '';
  const r = d.rosters || [];
  const of = (x) => r.find((y) => y.team?.id === x.team.id);
  const L = of(k.left), R = of(k.right);
  const xi = (ro) => (ro?.roster || []).filter((p) => p.starter);
  if (!xi(L).length && !xi(R).length) return `<div class="card"><h2>Line-ups</h2><p class="note">Line-ups not out yet. They usually come about an hour before kick-off.</p></div>`;
  const col = (x, ro) => `<div><h3>${crest(x.team, 22)}${esc(x.team.abbr)}${ro?.formation ? ` <span style="color:var(--mute);font-weight:700">${esc(ro.formation)}</span>` : ''}</h3>${xi(ro).map((p) => `<p><i>${esc(p.jersey)}</i>${esc(p.athlete?.displayName)}</p>`).join('')}</div>`;
  return `<div class="card"><h2>Line-ups</h2><div class="xi">${col(k.left, L)}${col(k.right, R)}</div></div>`;
}

function theGame(g, d, k) {
  const season = d.header?.season?.name || '';
  const stage = season.includes(',') ? season.split(',').slice(1).join(',').trim() : g.note;
  const venue = d.gameInfo?.venue;
  const where = [venue?.fullName, venue?.address?.city, g.sport !== 'soccer' && venue?.address?.country && !['USA', 'Canada'].includes(venue.address.country) ? venue.address.country : ''].filter(Boolean).join(', ');
  const why = g.state === 'pre' ? reasons(g) : [];
  const clash = clashNote(g, k);
  return `<div class="card"><h2>The game</h2><p class="note" style="padding-top:0;color:var(--ink);font-size:14px"><a href="${href.comp(g.path)}" style="text-decoration:none;font-weight:700">${esc(g.comp.name)}</a>${stage ? `, ${esc(stage)}` : ''}${where ? ` · ${esc(where)}` : ''}${why.length ? `<br><span class="tag why" style="margin-top:6px">${esc(why.join(' · '))}</span>` : ''}${clash ? `<span class="clashnote" style="margin-top:8px"><span class="sw" aria-hidden="true"><i style="background:${k.home.bg}"></i><i style="background:${g.away.color}"></i></span><span>${esc(clash)}</span></span>` : ''}</p></div>`;
}

function formCard(g, d, k) {
  const five = d.lastFiveGames || [];
  const table = (d.standings?.groups || []).flatMap((x) => x.standings?.entries || []);
  const pos = (id) => { const i = table.findIndex((e) => e.id === id || e.team?.id === id); return i >= 0 ? i + 1 : null; };
  const rows = [k.left, k.right].map((x) => {
    const f = five.find((y) => y.team?.id === x.team.id);
    const res = (f?.events || []).map((e) => e.gameResult).filter(Boolean).slice(0, 5).reverse();
    const rec = d.header?.competitions?.[0]?.competitors?.find((c) => c.id === x.team.id)?.record?.[0]?.summary;
    const p = pos(x.team.id);
    const sub = [p ? `${p}${['th', 'st', 'nd', 'rd'][(p % 100 > 10 && p % 100 < 14) ? 0 : p % 10] || 'th'} in the ${g.comp.name}` : '', rec ? `Record ${rec}` : ''].filter(Boolean).join(' · ');
    return `<div class="li">${crest(x.team, 30)}<span class="grow"><span class="t">${esc(x.team.short)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${res.length ? `<span class="forms" aria-label="Form, oldest first: ${res.join(' ')}">${res.map((r) => `<span class="fm ${r}">${r}</span>`).join('')}</span>` : ''}</div>`;
  });
  return `<div class="card"><div class="h">${g.state === 'post' ? 'What it means' : 'Form'}<span>${g.state === 'post' ? 'Table now' : 'Last 5, newest right'}</span></div>${rows.join('')}</div>`;
}

function statusLines(g) {
  const checked = net.lastOk ? sg(net.lastOk).hm : '';
  let html = `<p class="status">${icon('clock')}<span>Kick-off time from ESPN${checked ? `, checked ${checked}` : ''}. Second-source check comes with the calendar helper.</span></p>`;
  if (following('game', g.id)) html += `<p class="status">${icon('cal')}<span>Calendar sync isn’t set up yet. It comes with the calendar helper (build step A5).</span></p>`;
  return html;
}

// ---------- Page
export default function match([sport, slug, id], ctx) {
  const path = `${sport}/${slug}`;
  const e = ctx.use(`sum:${id}`, () => summary(path, id, ctx.wasLive), ctx.wasLive ? 8e3 : 60e3);
  const d = e.v;
  const g = d?.header ? norm({ ...d.header, competitions: [{ ...d.header.competitions[0], venue: d.gameInfo?.venue }] }, path) : null;
  const compName = g?.comp.name || '';
  const pick = g ? { id: g.id, path, date: g.date, name: `${g.sport === 'soccer' ? `${g.home.abbr} v ${g.away.abbr}` : `${g.away.abbr} @ ${g.home.abbr}`}` } : null;
  let html = `<div class="nav">${backBtn('#/', 'Back')}<span class="cap">${esc(compName)}</span>${pick && g.state !== 'post' ? followBtn('game', g.id, pick) : '<span class="spacer"></span>'}</div>`;
  if (!g) return html + (e.err ? errorCard('Couldn’t load this game.') : skel(3, true));
  ctx.live = g.state === 'in' || (g.state === 'pre' && new Date(g.date) - Date.now() < 10 * 60e3);
  ctx.wasLive = ctx.live;
  const k = kitsFor(g);
  html += header(g, k, d);
  if (g.state === 'pre') {
    html += statusLines(g) + tvAll(g) + theGame(g, d, k) + formCard(g, d, k) + lineups(g, d, k);
  } else if (g.state === 'in') {
    html += tvMain(g) + moments(g, d, k, true) + quarters(g, d, k) + stats(g, d, k) + leaders(g, d, k) + lineups(g, d, k);
  } else {
    html += moments(g, d, k, false) + quarters(g, d, k) + stats(g, d, k) + formCard(g, d, k) + leaders(g, d, k) + lineups(g, d, k) + theGame(g, d, k);
  }
  html += `<p class="foot">Times are Singapore time. Data from ESPN.</p>`;
  return html;
}
