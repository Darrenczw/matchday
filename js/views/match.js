// Match page. What comes first changes with the game state: before, live, full time (PRD 7.6).
import { esc, sg, countdown, icon, ago, dateText } from '../util.js';
import { following, picks } from '../store.js';
import { summary, norm, liveLabel, net, isMine, schedule, backup, known, standings } from '../espn.js';
import { kitsFor, clashNote, crest, edge, kitEdge } from '../identity.js';
import { allMarkets, mainMarket, KIND, rightsChecked, chanList } from '../tv.js';
import { followBtn, calBtn, backBtn, skel, errorCard, movedFrom, movedText, href, goalLine, spoken } from '../ui.js';
import { cal, inCal, gameInCal, calReady, CAL_API, status as calStatus } from '../cal.js';
import { reasons } from '../suggest.js';

// ---------- Pieces
const openSubs = new Set();
// NBA and NFL list away first, so say which side is which.
const ha = (g, x) => (g.sport === 'soccer' ? '' : `<span class="ha">${x.team.home ? 'Home' : 'Away'}</span>`);
const tchip = (x) => `<span class="tchip" style="background:${x.bg};color:${x.ink};${edge(x.bg)}">${esc(x.team.abbr)}</span>`;
// The header is drawn for the eye; VoiceOver gets one plain summary first (score, who won, scorers),
// and the team names stay as links to each team's page.
const tname = (g, x) => `<a class="tn" href="${href.team(g.path, x.team.id)}">${esc(x.team.short)}</a>`;
function header(g, k, d) {
  const s = sg(g.date);
  if (g.state === 'pre') {
    const moved = movedFrom(g);
    const pair = g.sport === 'soccer' ? `${g.home.name} v ${g.away.name}` : `${g.away.name} at ${g.home.name}`;
    const said = `${pair}. ${s.wdl} ${s.d} ${s.mo}, ${g.timeValid ? `${s.hm} Singapore time` : 'time to be confirmed'}. ${g.postponed ? 'Postponed' : moved ? movedText(moved) : g.timeValid ? `Starts ${countdown(g.date)}` : ''}. ${g.comp.name}.`;
    const side = (x, r) => `<div class="shirt${r ? ' r' : ''}${kitEdge(x)}" style="background:${x.bg};color:${x.ink}">${crest(x.team, 46, true)}<span>${tname(g, x)}<span aria-hidden="true">${ha(g, x)}</span></span></div>`;
    return `<h1 class="sr">${esc(said.replace('. .', '.'))}</h1><section class="mh pre">${side(k.left)}${side(k.right, true)}<div class="ko" aria-hidden="true"><b>${g.timeValid ? s.hm : 'TBC'}</b><span>${s.wd} ${s.d} ${s.mo} · SGT</span>${g.postponed ? '<span class="moved">Postponed</span>' : moved ? `<span class="moved">${movedText(moved)}</span>` : `<span class="cd">${g.timeValid ? countdown(g.date) : 'Time to be confirmed'}</span>`}</div></section>`;
  }
  const sc = scorers(g, d);
  const a = +(k.left.team.score ?? 0), b = +(k.right.team.score ?? 0);
  const won = (x) => g.state === 'post' && a !== b && (x === k.left ? a > b : b > a);
  const goals = [k.left, k.right].filter((x) => sc[x.team.id]).map((x) => `${x.team.name}: ${sc[x.team.id]}`).join('. ');
  const said = spoken(g, k) + (goals ? ` Goals. ${goals}.` : '');
  const side = (x, r) => `<div class="shirt${r ? ' r' : ''}${kitEdge(x)}" style="background:${x.bg};color:${x.ink}">${crest(x.team, 46, true)}<b class="sc${won(x) ? ' win' : ''}" aria-hidden="true">${esc(x.team.score ?? '0')}</b><span>${tname(g, x)}<span aria-hidden="true">${ha(g, x)}${sc[x.team.id] ? `<span class="scorers" style="display:block">${esc(sc[x.team.id])}</span>` : ''}</span></span></div>`;
  const pill = g.state === 'in' ? `<div class="state" aria-hidden="true"><i class="dot"></i><span>${esc(liveLabel(g))} · Live</span></div>` : `<div class="state" aria-hidden="true"><span>${esc(g.sport === 'soccer' ? 'Full time' : 'Final')}${g.detail && !/^(FT|Final)$/i.test(g.detail) ? ` · ${esc(g.detail)}` : ''} · ${s.wd} ${s.d} ${s.mo}</span></div>`;
  return `<h1 class="sr">${esc(said)}</h1><section class="mh sp-${g.sport}">${side(k.left)}${side(k.right, true)}${pill}</section>`;
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
// ESPN writes "Yellow Card"; the app writes sentence case.
const sentence = (t = '') => t.charAt(0) + t.slice(1).toLowerCase();

// Exact / Likely / Not listed. A Likely tag opens its source. "Not shown live" is a fact, but not a
// "do this", so its Exact tag is grey rather than green.
function tvTag(x) {
  const cls = x.channels[0] === 'Not shown live' ? 'likely' : x.kind;
  if (!x.source) return `<span class="tag ${cls}">${KIND[x.kind]}</span>`;
  return `<a class="tag ${cls} src" href="${esc(x.source)}" target="_blank" rel="noopener" aria-label="${esc(`${KIND[x.kind]}: source for ${x.label}`)}">${KIND[x.kind]}</a>`;
}
// Main market, big, with why ("Saturday 3pm blackout in the UK"). Shared by both layouts.
function tvHead(m) {
  return `<div class="tvmain"><span class="mk">${esc(m.m.toUpperCase())}</span><b>${m.kind === 'none' ? 'Not listed' : esc(chanList(m.channels))}</b>${tvTag(m)}</div>${m.note ? `<p class="note" style="padding-top:0">${esc(m.note)}</p>` : ''}`;
}
function tvMain(g) {
  return `<div class="card"><h2>Where to watch</h2>${tvHead(mainMarket(g))}</div>`;
}
function tvAll(g) {
  const [main, ...rest] = allMarkets(g);
  const listed = rest.filter((x) => x.kind !== 'none'), none = rest.filter((x) => x.kind === 'none');
  let html = `<div class="card"><h2>Where to watch</h2>${tvHead(main)}`;
  // This is the full list, so every channel is named (rows elsewhere say "· 1 more").
  html += listed.map((x) => `<div class="tvrow"><span class="m">${esc(x.label)}</span><span class="c">${esc(chanList(x.channels))}</span>${tvTag(x)}</div>`).join('');
  if (none.length) html += `<div class="tvrow"><span class="c" style="color:var(--mute)">Not listed: ${esc(none.map((x) => x.label).join(', '))}</span></div>`;
  html += `<p class="note">Exact = listed for this game. Likely = holds the rights this season${rightsChecked() ? ` (rights checked ${esc(dateText(rightsChecked()))})` : ''}. Tap Likely to see where it comes from.</p></div>`;
  return html;
}

function moments(g, d, k, newestFirst) {
  const list = [], subs = [];
  if (g.sport === 'soccer') {
    for (const e of d.keyEvents || []) {
      if (/substitution/i.test(e.type?.text || '')) {
        const txt = (e.text || '').replace(/^Substitution,\s*[^.]+\.\s*/i, '');
        subs.push({ min: e.clock?.displayValue || '', team: e.team?.id, txt: txt || e.participants?.map((p) => p.athlete?.displayName).join(' for ') || '' });
        continue;
      }
      if (!isGoal(e) && !isCard(e) && !/var/i.test(e.type?.text || '')) continue;
      const p = e.participants || [];
      const who = p[0]?.athlete?.displayName || e.text || '';
      const sub = isGoal(e) ? (p[1] ? `Assist ${p[1].athlete?.displayName}` : /own goal/i.test(e.type.text) ? 'Own goal' : /penalty/i.test(e.type.text) ? 'Penalty' : '') : isCard(e) ? sentence(e.type.text) : e.type?.text;
      list.push({ min: e.clock?.displayValue || '', team: e.team?.id, who, sub, kind: isGoal(e) ? 'goal' : /red/i.test(e.type.text) ? 'red' : isCard(e) ? 'yellow' : 'var' });
    }
  }
  // Goal timeline (R4) at the top of the card, live and at full time.
  const goals = (d.keyEvents || []).filter(isGoal).map((e) => ({ m: parseInt(e.clock?.displayValue, 10) || 0, t: String(e.team?.id || ''), who: e.participants?.[0]?.athlete?.shortName || '', og: /own goal/i.test(e.type?.text || '') }));
  const now = g.state === 'post' ? Math.max(90, ...goals.map((x) => x.m)) : /HALFTIME/.test(g.statusName) ? 45 : parseInt(g.clock, 10) || 0;
  const line = `<div class="tlwrap">${goalLine(goals, now, k, '', false)}</div>`;
  if (!list.length && !subs.length) return `<div class="card"><div class="h">Key moments</div>${line}</div>`;
  if (newestFirst) list.reverse();
  const leftId = k.left.team.id;
  const badge = (m) => {
    const side = m.team === leftId ? k.left : k.right;
    if (m.kind === 'goal') return `<span class="goal" style="background:${side.bg};color:${side.ink};${edge(side.bg)}">${esc(m.abbr || (g.sport === 'soccer' ? 'GOAL' : 'SCORE'))}</span>`;
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
  // Substitutions fold into one row that opens (PRD 7.6).
  const open = openSubs.has(g.id);
  const subRows = open ? subs.map((x) => `<div class="ev"><span class="min">${esc(x.min)}</span><span class="who"><span class="tchip" style="background:${(x.team === leftId ? k.left : k.right).bg};color:${(x.team === leftId ? k.left : k.right).ink};${edge((x.team === leftId ? k.left : k.right).bg)}">${esc((x.team === leftId ? k.left : k.right).team.abbr)}</span><span><small style="color:var(--ink);font-size:13px">${esc(x.txt)}</small></span></span><span></span></div>`).join('') : '';
  const subBtn = subs.length ? `<button class="ev subs" data-act="subs" data-id="${g.id}" aria-expanded="${open}"><span>${subs.length} substitution${subs.length > 1 ? 's' : ''}</span>${icon(open ? 'up' : 'down', 'chev')}</button>` : '';
  return `<div class="card"><div class="h">Key moments<span>${newestFirst ? 'Newest first' : 'In order'}</span></div>${line}${rows}${subBtn}${subRows}</div>`;
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
<tr><td>${tchip(k.left)}</td>${cells(L)}<td>${esc(k.left.team.score ?? '')}</td></tr><tr><td>${tchip(k.right)}</td>${cells(R)}<td>${esc(k.right.team.score ?? '')}</td></tr></table></div>`;
}

// Team stats, in the order each sport's own coverage uses (NBA.com / NFL GameCenter / ESPN).
// [stat, label, kind, sub stat, sub suffix]. kind: '%' adds a percent sign; 'ratio' = "9-17" made/attempts;
// 'countYds' = "12-133" count and yards.
const TEAM_STATS = {
  soccer: [['possessionPct', 'Possession', '%'], ['totalShots', 'Shots'], ['shotsOnTarget', 'On target'], ['wonCorners', 'Corners'], ['foulsCommitted', 'Fouls'], ['saves', 'Saves']],
  basketball: [
    ['fieldGoalPct', 'Field goals', '%', 'fieldGoalsMade-fieldGoalsAttempted'], ['threePointFieldGoalPct', '3-pointers', '%', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'],
    ['freeThrowPct', 'Free throws', '%', 'freeThrowsMade-freeThrowsAttempted'], ['totalRebounds', 'Rebounds', '', 'offensiveRebounds', 'offensive'],
    ['assists', 'Assists'], ['totalTurnovers', 'Turnovers'], ['steals', 'Steals'], ['blocks', 'Blocks'],
    ['pointsInPaint', 'Points in the paint'], ['fastBreakPoints', 'Fast-break points'], ['turnoverPoints', 'Points off turnovers'], ['largestLead', 'Largest lead'],
  ],
  football: [
    ['totalYards', 'Total yards', '', 'yardsPerPlay', 'a play'], ['netPassingYards', 'Passing yards', '', 'completionAttempts', 'comp/att'],
    ['rushingYards', 'Rushing yards', '', 'rushingAttempts', 'carries'], ['firstDowns', 'First downs'],
    ['thirdDownEff', '3rd down', 'ratio'], ['fourthDownEff', '4th down', 'ratio'], ['redZoneAttempts', 'Red zone TDs', 'ratio'],
    ['turnovers', 'Turnovers'], ['totalPenaltiesYards', 'Penalties', 'countYds'], ['sacksYardsLost', 'Sacked', 'countYds'], ['possessionTime', 'Possession'],
  ],
};
function stats(g, d, k) {
  const teams = d.boxscore?.teams || [];
  const of = (x) => Object.fromEntries((teams.find((t) => t.team?.id === x.team.id)?.statistics || []).map((st) => [st.name, st.displayValue]));
  const a = of(k.left), b = of(k.right);
  const num = (v) => (String(v).includes(':') ? String(v).split(':').reduce((m, x) => m * 60 + +x, 0) : parseFloat(v) || 0);
  const rows = TEAM_STATS[g.sport].filter(([n]) => a[n] != null && b[n] != null).map(([n, label, kind = '', subN, subS = '']) => {
    // What to show, what the bar measures, and the small line under it.
    const view = (v, o) => {
      const [x, y] = String(v).split('-').map(Number);
      if (kind === 'ratio') return { big: `${x}/${y}`, bar: y ? x / y : 0, small: y ? `${Math.round((100 * x) / y)}%` : '' };
      if (kind === 'countYds') return { big: String(x), bar: x, small: `${y} yds` };
      return { big: `${v}${kind === '%' ? '%' : ''}`, bar: num(v), small: subN && o[subN] != null ? `${o[subN]}${subS ? ` ${subS}` : ''}` : '' };
    };
    const L = view(a[n], a), R = view(b[n], b), tot = kind === 'ratio' ? 1 : L.bar + R.bar || 1;
    const share = (v) => (kind === 'ratio' ? v / ((L.bar + R.bar) || 1) : v / tot);
    const bar = (side, v) => `<i style="flex:${Math.max(share(v), 0.02)};background:${side.bg};${edge(side.bg)}"></i>`;
    return `<div class="stat"><div class="l"><b>${esc(L.big)}${L.small ? `<small>${esc(L.small)}</small>` : ''}</b><span>${label}</span><b>${esc(R.big)}${R.small ? `<small>${esc(R.small)}</small>` : ''}</b></div>${L.bar || R.bar ? `<div class="bars" aria-hidden="true">${bar(k.left, L.bar)}${bar(k.right, R.bar)}</div>` : ''}</div>`;
  });
  return rows.length ? `<div class="card"><h2>${g.sport === 'soccer' ? 'Stats' : 'Team stats'}</h2>${rows.join('')}</div>` : '';
}

// Game leaders, side by side per category, as NBA.com and NFL.com show them.
function gameLeaders(g, d, k) {
  if (g.sport === 'soccer' || !d.leaders?.length) return '';
  const of = (x) => d.leaders.find((l) => l.team?.id === x.team.id)?.leaders || [];
  const L = of(k.left), R = of(k.right);
  const cats = L.map((c) => c.name).filter((n) => R.some((c) => c.name === n)).slice(0, 3);
  if (!cats.length) return '';
  // NBA gives "32"; NFL gives "19/33, 225 YDS, 3 TD": show the yards big and the rest small.
  const split = (v = '') => { const m = v.match(/(\d+) YDS/); return m ? { big: m[1], small: v.replace(/,?\s*\d+ YDS/, '').replace(/^,\s*/, '') } : { big: v, small: '' }; };
  const side = (list, n, r) => {
    const p = list.find((c) => c.name === n)?.leaders?.[0];
    if (!p) return '<div></div>';
    const v = split(p.displayValue);
    // Surname only ("Wembanyama"), so long names fit on one line; the full name is still spoken.
    const full = p.athlete?.displayName || p.athlete?.shortName || '';
    const sur = (p.athlete?.shortName || full).replace(/^[A-Z]\.\s+/, '');
    const who = `<span class="pn"><span class="sn" aria-label="${esc(full)}">${esc(sur)}</span>${v.small ? `<small>${esc(v.small)}</small>` : ''}</span>`;
    return `<div class="gl-p${r ? ' r' : ''}">${r ? who + `<b>${esc(v.big)}</b>` : `<b>${esc(v.big)}</b>` + who}</div>`;
  };
  const label = (n) => L.find((c) => c.name === n)?.displayName || n;
  return `<div class="card"><div class="h">Game leaders<span>${tchip(k.left)} ${tchip(k.right)}</span></div>${cats.map((n) => `<div class="gl">${side(L, n)}<span class="cat">${esc(label(n).replace(' Yards', ''))}</span>${side(R, n, true)}</div>`).join('')}</div>`;
}

// One team at a time, like the team toggle on a box score.
const boxTeam = new Map();
function teamSwitch(g, k) {
  const cur = boxTeam.get(g.id) || k.left.team.id;
  return `<div class="seg" role="group" aria-label="Team" style="margin:4px 14px 10px">${[k.left, k.right].map((x) => `<button data-act="boxteam" data-g="${g.id}" data-t="${x.team.id}" aria-pressed="${cur === x.team.id}">${tchip(x)} ${esc(x.team.short)}</button>`).join('')}</div>`;
}
function table(cols, rows, totals) {
  const th = `<tr><th>Player</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
  const tr = rows.map((r) => (r.section ? `<tr class="sec"><td colspan="${cols.length + 1}">${esc(r.section)}</td></tr>`
    : `<tr><td><span class="pn">${esc(r.name)}</span>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td>${r.cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)).join('');
  const tt = totals ? `<tr class="tot"><td>Team</td>${totals.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>` : '';
  return `<div class="boxwrap"><table class="box">${th}${tr}${tt}</table></div>`;
}
const pick = (labels, want, row) => want.map((w) => row[labels.indexOf(w)] ?? '');

// NBA box score: starters, then bench, then who didn't play.
function boxNBA(g, d, k) {
  const id = boxTeam.get(g.id) || k.left.team.id;
  const s = d.boxscore?.players?.find((p) => p.team?.id === id)?.statistics?.[0];
  if (!s?.athletes?.length) return '';
  const cols = ['MIN', 'PTS', 'REB', 'AST', 'FG', '3PT', 'FT', 'STL', 'BLK', 'TO', '+/-'];
  const played = s.athletes.filter((a) => !a.didNotPlay && a.stats?.length);
  const row = (a) => ({ name: a.athlete?.shortName || a.athlete?.displayName, sub: a.athlete?.position?.abbreviation, cells: pick(s.labels, cols, a.stats) });
  const rows = [{ section: 'Starters' }, ...played.filter((a) => a.starter).map(row), { section: 'Bench' }, ...played.filter((a) => !a.starter).map(row)];
  const dnp = s.athletes.filter((a) => a.didNotPlay).map((a) => a.athlete?.shortName).filter(Boolean);
  return `<div class="card"><div class="h">Box score<span>Swipe for more</span></div>${teamSwitch(g, k)}${table(cols, rows, pick(s.labels, cols, s.totals || []))}${dnp.length ? `<p class="note">Didn’t play: ${esc(dnp.join(', '))}</p>` : ''}</div>`;
}

// NFL player stats by unit, as NFL GameCenter groups them.
const NFL_UNITS = [
  ['passing', 'Passing', ['C/ATT', 'YDS', 'TD', 'INT', 'RTG']], ['rushing', 'Rushing', ['CAR', 'YDS', 'AVG', 'TD', 'LONG']],
  ['receiving', 'Receiving', ['REC', 'YDS', 'TD', 'TGTS', 'LONG']], ['defensive', 'Defence', ['TOT', 'SACKS', 'TFL', 'PD'], 6],
  ['interceptions', 'Interceptions', ['INT', 'YDS', 'TD']], ['kicking', 'Kicking', ['FG', 'XP', 'PTS', 'LONG']],
];
function playersNFL(g, d, k) {
  const id = boxTeam.get(g.id) || k.left.team.id;
  const groups = d.boxscore?.players?.find((p) => p.team?.id === id)?.statistics || [];
  if (!groups.length) return '';
  const parts = NFL_UNITS.map(([key, title, cols, max]) => {
    const s = groups.find((x) => x.name === key);
    if (!s?.athletes?.length) return '';
    const rows = s.athletes.slice(0, max || 99).map((a) => ({ name: a.athlete?.shortName || a.athlete?.displayName, cells: pick(s.labels, cols, a.stats) }));
    return `<h3 class="unit">${title}</h3>${table(cols, rows)}`;
  }).join('');
  return `<div class="card"><h2>Player stats</h2>${teamSwitch(g, k)}${parts}</div>`;
}

// NFL scoring summary: by quarter, with the running score (away first, like the header).
function scoringNFL(g, d, k, newestFirst) {
  const plays = [...(d.scoringPlays || [])];
  if (!plays.length) return '';
  if (newestFirst) plays.reverse();
  const awayLeft = k.left.team.id === g.away.id;
  let html = '', q = null;
  for (const p of plays) {
    const n = p.period?.number;
    if (n !== q) { q = n; html += `<div class="sec-h">${n > 4 ? 'Overtime' : ['1st', '2nd', '3rd', '4th'][n - 1] + ' quarter'}</div>`; }
    const side = p.team?.id === k.left.team.id ? k.left : k.right;
    const score = awayLeft ? `${p.awayScore}–${p.homeScore}` : `${p.homeScore}–${p.awayScore}`;
    html += `<div class="sp"><span class="goal" style="background:${side.bg};color:${side.ink};${edge(side.bg)}">${esc(p.type?.abbreviation || 'SC')}</span><span class="txt"><b>${esc(side.team.abbr)} · ${esc(p.type?.text || '')}</b><small>${esc(p.text || '')}</small></span><span class="sc"><b>${esc(score)}</b><small>${esc(p.clock?.displayValue || '')}</small></span></div>`;
  }
  return `<div class="card"><div class="h">Scoring summary<span>${newestFirst ? 'Newest first' : 'In order'}</span></div>${html}</div>`;
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
  return `<div class="card"><h2>The game</h2><p class="note" style="padding-top:0;color:var(--ink);font-size:14px"><a class="inl" href="${href.comp(g.path)}" style="text-decoration:none;font-weight:700">${esc(g.comp.name)}</a>${stage ? `, ${esc(stage)}` : ''}${where ? ` · ${esc(where)}` : ''}${why.length ? `<br><span class="tag why" style="margin-top:6px">${esc(why.join(' · '))}</span>` : ''}${clash ? `<span class="clashnote" style="margin-top:8px"><span class="sw" aria-hidden="true"><i style="background:${k.home.bg}"></i><i style="background:${g.away.color}"></i></span><span>${esc(clash)}</span></span>` : ''}</p></div>`;
}

// After full time: each team's next game ("Next: v Everton, Sat 24 Oct 22:00"), from its schedule.
function nextFor(g, x, ctx) {
  const id = x.team.id, list = ctx.use(`sched:${g.sport}:${id}`, () => schedule(g.path, id), 10 * 60e3).v || [];
  const n = list.filter((y) => (y.home.id === id || y.away.id === id) && y.id !== g.id && y.state === 'pre' && new Date(y.date) > Date.now())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  if (!n) return '';
  const home = n.home.id === id, opp = home ? n.away : n.home, s = sg(n.date);
  return `Next: ${home ? 'v' : 'at'} ${opp.short}, ${s.wd} ${s.d} ${s.mo} ${n.timeValid ? s.hm : 'TBC'}`;
}
const nth = (p) => `${p}${['th', 'st', 'nd', 'rd'][(p % 100 > 10 && p % 100 < 14) ? 0 : p % 10] || 'th'}`;
// Where a team stands, counted inside its own table: its conference for NFL and NBA ("7th in the NFC",
// "14th in the East"), its group in a group stage ("2nd in Group A"), else the league ("2nd in the Premier League").
// Never counted across tables, and hidden when the team isn't found.
function standingFor(g, d, ctx, id) {
  if (g.sport !== 'soccer') {
    const st = ctx.use(`table:${g.path}`, () => standings(g.path), 30 * 60e3).v;
    for (const grp of st?.groups || []) {
      const i = grp.rows.findIndex((r) => r.team.id === id);
      if (i >= 0) return `${nth(grp.rows[i].rank || i + 1)} in the ${grp.abbr || grp.name}`;
    }
    return '';
  }
  const groups = (d.standings?.groups || []).map((x) => ({ name: x.header || x.name || '', entries: x.standings?.entries || [] })).filter((x) => x.entries.length);
  for (const grp of groups) {
    const i = grp.entries.findIndex((e) => e.id === id || e.team?.id === id);
    if (i < 0) continue;
    const name = groups.length > 1 ? grp.name.replace(/^\d{4}(-\d{2})?\s*/, '').replace(/\s*Standings$/i, '') : '';
    return `${nth(i + 1)} in ${name || `the ${g.comp.name}`}`;
  }
  return '';
}
function formCard(g, d, k, ctx) {
  const five = d.lastFiveGames || [];
  let anyForm = false;
  const rows = [k.left, k.right].map((x) => {
    const f = five.find((y) => y.team?.id === x.team.id);
    // ESPN lists these oldest first, in every competition. Sort to be sure, and keep the newest 5 on the right.
    const res = [...(f?.events || [])].sort((p, q) => new Date(p.gameDate) - new Date(q.gameDate)).map((e) => e.gameResult).filter(Boolean).slice(-5);
    const recs = d.header?.competitions?.[0]?.competitors?.find((c) => c.id === x.team.id)?.record || [];
    const rec = recs.find((r) => r.type === 'total')?.summary || recs[0]?.summary;
    const pts = recs.find((r) => r.type === 'points')?.summary;
    // Football records come as wins-draws-losses ("6-0-1"), which reads like a US W-L-T record. Spell it out.
    const wdl = g.sport === 'soccer' && /^\d+-\d+-\d+$/.test(rec || '') ? rec.split('-') : null;
    const recTxt = wdl ? `W${wdl[0]} D${wdl[1]} L${wdl[2]}${pts ? ` · ${pts} pts` : ''}` : rec ? `Record ${rec}` : '';
    const nx = g.state === 'post' ? nextFor(g, x, ctx) : '';
    const sub = [standingFor(g, d, ctx, x.team.id), recTxt].filter(Boolean).join(' · ');
    if (res.length) anyForm = true;
    return `<div class="li">${crest(x.team, 30)}<span class="grow"><span class="t">${esc(x.team.short)}</span>${sub ? `<small class="wrap">${esc(sub)}</small>` : ''}${nx ? `<small class="wrap">${esc(nx)}</small>` : ''}</span>${res.length ? `<span class="forms" role="img" aria-label="Last ${res.length}, oldest first: ${res.map((r) => ({ W: 'won', D: 'drew', L: 'lost' }[r] || r)).join(', ')}">${res.map((r) => `<span class="fm ${r}">${r}</span>`).join('')}</span>` : ''}</div>`;
  });
  return `<div class="card"><div class="h">${g.state === 'post' ? 'What it means' : 'Form'}<span>${[g.state === 'post' ? 'Table now' : '', anyForm ? (g.sport === 'soccer' ? 'last 5, all competitions' : 'last 5') : ''].filter(Boolean).join(' · ').replace(/^./, (c) => c.toUpperCase())}</span></div>${rows.join('')}</div>`;
}

// "today 17:46", "yesterday 17:46" or "Mon 17:46", so a check time never reads like a kick-off time.
function checkedWhen(t) {
  const s = sg(t), today = sg(Date.now()).key, yday = sg(Date.now() - 864e5).key;
  return `${s.key === today ? 'today' : s.key === yday ? 'yesterday' : s.wd} ${s.hm}`;
}

function statusLines(g, ctx) {
  const st = calReady() ? ctx.use('calstatus', calStatus, 60e3).v : null;
  const helper = st?.checkedById?.[g.id], checked = helper || net.lastOk;
  let html = `<p class="status">${icon('clock')}<span>${helper ? 'Checked by the calendar helper' : 'Checked with ESPN'}${checked ? ` ${checkedWhen(checked)}` : ''}</span></p>`;
  // Second source (TheSportsDB), for games the helper tracks: [note, checked at, its time].
  if (helper) {
    const [note, at, t] = st.secondById?.[g.id] || [];
    const s = t && sg(t);
    if (note === 'differ') html += `<p class="status amber">${icon('alert')}<span>Time unconfirmed: TheSportsDB says ${s.wd} ${s.hm}. Showing ESPN’s time until they agree.</span></p>`;
    else if (note === 'postponed') html += `<p class="status amber">${icon('alert')}<span>Time unconfirmed: TheSportsDB lists this game as postponed. Showing ESPN’s time.</span></p>`;
    else if (note === 'agree') html += `<p class="status ok">${icon('check')}<span>Second source agrees (TheSportsDB, checked ${checkedWhen(at)})</span></p>`;
    else if (note === 'nomatch') html += `<p class="status">${icon('clock')}<span>TheSportsDB doesn’t list this game, so only ESPN is checked.</span></p>`;
    else if (note === 'notime') html += `<p class="status">${icon('clock')}<span>TheSportsDB has no kick-off time for this game yet.</span></p>`;
    else if (new Date(g.date) - Date.now() > 14 * 864e5) html += `<p class="status">${icon('clock')}<span>Second-source check starts 14 days before kick-off.</span></p>`;
    else html += `<p class="status">${icon('clock')}<span>Second-source check in the next few minutes.</span></p>`;
  }
  if (!gameInCal(g)) return html;
  if (!CAL_API) html += `<p class="status">${icon('cal')}<span>On your calendar list. It goes to your iPhone once the calendar helper is live.</span></p>`;
  else if (!calReady()) html += `<p class="status">${icon('cal')}<span>On your calendar list. Set up the calendar in Settings to send it to your iPhone.</span></p>`;
  else if (st?.pending?.some((p) => p.id === g.id)) html += `<p class="status amber">${icon('alert')}<span>Changed since your iPhone last fetched. Open the Calendar app to refresh.</span></p>`;
  else if (st?.lastFetch) html += `<p class="status ok">${icon('cal')}<span>In your calendar · iPhone fetched ${ago(st.lastFetch.at)}</span></p>`;
  else html += `<p class="status">${icon('cal')}<span>On your calendar list · subscribe in Settings to see it on your iPhone</span></p>`;
  return html;
}

// ---------- Page
export default function match([sport, slug, id], ctx) {
  const path = `${sport}/${slug}`;
  ctx.sport = sport;
  const e = ctx.use(`sum:${id}`, () => summary(path, id, ctx.wasLive), ctx.wasLive ? 8e3 : 60e3);
  const d = e.v;
  // Until the summary arrives, draw the header from the game the row was built from, so a tap never blanks.
  // ESPN down: the backup copy of this game (from My games) still gives the header.
  const g = d?.header ? norm({ ...d.header, competitions: [{ ...d.header.competitions[0], venue: d.gameInfo?.venue }] }, path) : known.get(id) || (e.err ? backup.byId.get(id) : null) || null;
  const compName = g?.comp.name || '';
  const pick = g ? { id: g.id, path, date: g.date, name: `${g.sport === 'soccer' ? `${g.home.abbr} v ${g.away.abbr}` : `${g.away.abbr} @ ${g.home.abbr}`}` } : null;
  // Covered by a team or competition follow: say so, rather than offering a Follow that changes nothing.
  const covered = g && !following('game', g.id) && isMine(g, picks);
  const right = !pick || g.state === 'post' ? '<span class="spacer"></span>' : covered ? '<span class="tag exact">In My games</span>' : followBtn('game', g.id, pick);
  // Calendar is its own layer: a team or league in the calendar covers this game; otherwise add just this game.
  let calNav = '';
  if (g && g.state !== 'post') {
    const via = cal.teams.find((t) => t.id === g.home.id || t.id === g.away.id)?.name || cal.comps.find((c) => c.path === g.path)?.name || '';
    calNav = calBtn('game', g.id, pick, { compact: true, covered: !inCal('game', g.id) && gameInCal(g) ? via : '' });
  }
  let html = `<div class="nav">${backBtn(ctx.back?.href || '#/', ctx.back?.label || 'My games')}<span class="cap">${esc(compName)}</span><span class="navr">${calNav}${right}</span></div>`;
  if (!g) return html + (e.err ? errorCard('Couldn’t load this game.') : skel(3, true));
  ctx.live = g.state === 'in' || (g.state === 'pre' && new Date(g.date) - Date.now() < 10 * 60e3);
  ctx.wasLive = ctx.live;
  const k = kitsFor(g);
  ctx.title = g.sport === 'soccer' ? `${g.home.short} v ${g.away.short}` : `${g.away.short} at ${g.home.short}`;
  html += header(g, k, d || {});
  if (!d && !e.err) return html + skel(3);
  if (!d) return html + `<div class="banner amber">${icon('wifi')}<span>${g.viaBackup ? 'ESPN isn’t answering. This is the backup copy of the game' : 'Couldn’t load this game’s details. This is what My games already had'}: stats, line-ups and key moments come back when ESPN answers. It tries again on its own.</span></div><p class="foot">Times are Singapore time.</p>`;
  // Football: key moments, stats, line-ups. NBA: quarters, leaders, box score, team stats.
  // NFL: quarters, scoring summary, leaders, team stats, player stats by unit.
  const us = (live) => (g.sport === 'basketball'
    ? quarters(g, d, k) + gameLeaders(g, d, k) + boxNBA(g, d, k) + stats(g, d, k)
    : quarters(g, d, k) + scoringNFL(g, d, k, live) + gameLeaders(g, d, k) + stats(g, d, k) + playersNFL(g, d, k));
  if (g.state === 'pre') {
    html += statusLines(g, ctx) + tvAll(g) + theGame(g, d, k) + formCard(g, d, k, ctx) + lineups(g, d, k);
  } else if (g.state === 'in') {
    html += tvMain(g) + (g.sport === 'soccer' ? moments(g, d, k, true) + stats(g, d, k) + lineups(g, d, k) : us(true));
  } else {
    html += (g.sport === 'soccer' ? moments(g, d, k, false) + stats(g, d, k) : us(false)) + formCard(g, d, k, ctx) + lineups(g, d, k) + theGame(g, d, k);
  }
  html += `<p class="foot">Times are Singapore time. Data from ESPN.</p>`;
  return html;
}
match.actions = {
  subs(d, el, e, ctx) { openSubs.has(d.id) ? openSubs.delete(d.id) : openSubs.add(d.id); ctx.redraw(); },
  boxteam(d, el, e, ctx) { boxTeam.set(d.g, d.t); ctx.redraw(); },
};
