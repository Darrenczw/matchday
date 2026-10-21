// Shared building blocks: game rows, the live hero, follow buttons, toasts, "moved" notes.
import { esc, sg, shortDay, icon } from './util.js';
import { kitsFor, crest, compImg, isDark, edge, kitEdge } from './identity.js';
import { liveLabel } from './espn.js';
import { mainMarket, tvShort } from './tv.js';
import { reasons } from './suggest.js';
import { load, save, following, teamKey } from './store.js';
import { inCal } from './cal.js';

export const href = {
  match: (g) => `#/m/${g.path}/${g.id}`,
  team: (path, id) => `#/t/${path}/${id}`,
  comp: (path) => `#/c/${path}`,
};

// ---------- Kick-off moved? Remember each game's time; if it changes, show "Moved from" for 7 days.
const seen = load('seen', {});
let seenTimer = 0;
// Times are compared as instants: ESPN writes "…T19:00Z", the backup "…T19:00:00.000Z" for the same kick-off.
const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();
export function movedFrom(g) {
  const s = seen[g.id];
  if (!s) { seen[g.id] = { d: g.date, v: g.timeValid }; queueSave(); return null; }
  if (!same(s.d, g.date) && s.v && g.timeValid) { seen[g.id] = { d: g.date, v: true, prev: s.d, at: Date.now() }; queueSave(); }
  else if (s.d !== g.date || s.v !== g.timeValid) { seen[g.id] = { ...s, d: g.date, v: g.timeValid }; queueSave(); }
  const x = seen[g.id];
  return x.prev && !same(x.prev, x.d) && Date.now() - x.at < 7 * 864e5 ? x.prev : null;
}
function queueSave() { clearTimeout(seenTimer); seenTimer = setTimeout(() => save('seen', seen), 1000); }
export const movedText = (prev) => { const p = sg(prev); return `Moved from ${p.wd} ${p.hm}`; };

// ---------- Panels
// A team you follow by name gets a small star next to its code (the Follow tab's star), so it stands out
// among a followed league's games. A star, not a stripe: the panel stays the team's kit.
const STAR = '<svg class="fav" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/></svg>';
const yours = (g, t) => following('team', teamKey(g.path, t.id));
function panel(side, k, size = 26, fav = false) {
  const t = k.team, r = side === 'r';
  const c = crest(t, size, true), name = `<b>${esc(t.abbr || t.short)}</b>`, f = fav ? STAR : '';
  return `<div class="p${r ? ' r' : ''}${kitEdge(k)}" style="background:${k.bg};color:${k.ink}">${r ? f + name + c : c + name + f}</div>`;
}
// At full time the winner's score is underlined, so a result reads at a glance (no mark for a draw).
export function scoreText(k, done = false) {
  const a = k.left.team.score ?? '', b = k.right.team.score ?? '';
  const w = done && a !== '' && b !== '' && +a !== +b ? (+a > +b ? 'l' : 'r') : '';
  const sc = (v, side) => (w === side ? `<u class="win">${esc(v)}</u>` : esc(v));
  return `${sc(a, 'l')}–${sc(b, 'r')}`;
}

// ---------- What VoiceOver says for a game: the same facts the row shows, in the order you'd say them.
// Full names, so "Spurs" (Tottenham) and "Spurs" (San Antonio) don't sound alike.
const full = (t) => t.name || t.short;
const pairName = (g) => (g.sport === 'soccer' ? `${full(g.home)} v ${full(g.away)}` : `${full(g.away)} at ${full(g.home)}`);
export function tvSpoken(m) {
  if (m.kind === 'none') return `${m.label} TV: not listed`;
  if (m.channels[0] === 'Not shown live') return `${m.label} TV: not shown live, 3pm blackout`;
  return `${m.label} TV: ${m.channels[0]}${m.channels.length > 1 ? ` and ${m.channels.length - 1} more` : ''}`;
}
export function spoken(g, k, { tv = '', moved = null, why = '' } = {}) {
  const s = sg(g.date), L = k.left.team, R = k.right.team, when = `${s.wdl} ${s.d} ${s.mo}`;
  const score = `${full(L)} ${L.score ?? 0}, ${full(R)} ${R.score ?? 0}`;
  const out = [];
  if (g.postponed) out.push(`${pairName(g)}. Postponed`);
  else if (g.state === 'in') out.push(`Live, ${liveLabel(g)}. ${score}`);
  else if (g.state === 'post') {
    const a = +L.score, b = +R.score;
    out.push(`${g.sport === 'soccer' ? 'Full time' : 'Final'}. ${score}. ${a === b ? 'Draw' : `${full(a > b ? L : R)} won`}. ${when}`);
  } else out.push(`${pairName(g)}, ${when}, ${g.timeValid ? s.hm : 'time to be confirmed'}`);
  out.push(g.comp.name);
  if (tv) out.push(tv);
  if (moved) out.push(movedText(moved));
  if (why) out.push(`Good for you: ${why}`);
  const mine = [g.home, g.away].filter((t) => yours(g, t)).map(full);
  if (mine.length) out.push(`You follow ${mine.join(' and ')}`);
  return out.join('. ') + '.';
}

export function gameRow(g, { why = true, tv = true } = {}) {
  const k = kitsFor(g), s = sg(g.date);
  let mid;
  if (g.postponed) mid = `<b>${g.timeValid ? s.hm : 'TBC'}</b><span>Postponed</span>`;
  else if (g.state === 'in') mid = `<b>${scoreText(k)}</b><span class="live"><i class="dot"></i>${esc(liveLabel(g))}</span>`;
  else if (g.state === 'post') mid = `<b>${scoreText(k, true)}</b><span>${esc(g.sport === 'soccer' ? g.detail || 'FT' : 'Final')} · ${s.wd}</span>`;
  else mid = `<b>${g.timeValid ? s.hm : 'TBC'}</b><span>${shortDay(g.date)} · <i class="sep">${k.sep}</i></span>`;
  const bits = [];
  const comp = g.comp;
  bits.push(`${compImg(comp.logo, 14, comp.name)}<span>${esc(comp.name)}</span>`);
  const moved = g.state === 'pre' ? movedFrom(g) : null;
  const why1 = !g.postponed && !moved && why && g.state === 'pre' ? reasons(g)[0] : '';
  let tvSaid = '';
  if (tv && g.state !== 'post') {
    const m = mainMarket(g);
    // The meta line is one line: when it's full, drop "· 1 more" before the channel name gets cut.
    const room = comp.name.length + m.label.length + tvShort(m).length + (why1 || '').length <= 44;
    bits.push(`<span class="tvt">${esc(m.label)} · ${esc(tvShort(m, room))}</span>`);
    tvSaid = tvSpoken(m);
  }
  if (g.viaBackup) bits.push('<span class="tag likely">Backup</span>');
  if (g.postponed) bits.push('<span class="pp">POSTPONED</span>');
  else if (moved) bits.push(`<span class="moved">${movedText(moved)}</span>`);
  else if (why1) bits.push(`<em>${esc(why1)}</em>`);
  const label = spoken(g, k, { tv: tvSaid, moved, why: why1 });
  return `<a class="row${g.state === 'post' ? ' done' : ''}" href="${href.match(g)}" aria-label="${esc(label)}">${panel('l', k.left, 26, yours(g, k.left.team))}<div class="mid">${mid}</div>${panel('r', k.right, 26, yours(g, k.right.team))}<div class="meta">${bits.join('<span aria-hidden="true">·</span>')}</div></a>`;
}

const POSS = '<svg class="poss" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.6 16.4C2.4 11 7.6 3.9 16.4 3.6c1.2 5.4-4 12.5-12.8 12.8z"/><path d="M7.6 12.4l4.8-4.8M8.6 9.6l1.8 1.8M10.2 8l1.8 1.8"/></svg>';

export function hero(g) {
  const k = kitsFor(g);
  const m = mainMarket(g);
  const tv = m.kind !== 'none' ? m.channels[0] : g.usTV[0];
  const side = (x, r) => {
    const sc = String(x.team.score ?? '0');
    const ball = g.sit?.poss === x.team.id ? POSS : '';
    return `<div class="shirt${r ? ' r' : ''}${kitEdge(x)}" style="background:${x.bg};color:${x.ink}">${crest(x.team, 40, true)}<b class="score${sc.length > 2 ? ' sm' : ''}">${esc(sc)}</b><span class="name">${esc(x.team.short)}${ball}${g.sport !== 'soccer' ? `<small>${x.team.home ? 'Home' : 'Away'}</small>` : ''}</span></div>`;
  };
  return `<a class="hero sp-${g.sport}" href="${href.match(g)}" aria-label="${esc(spoken(g, k, { tv: tvSpoken(m) }))}">${side(k.left)}${side(k.right, true)}<div class="state"><i class="dot"></i><span>${esc(liveLabel(g))}${tv ? ` · ${esc(tv)}` : ''}</span></div></a>${heroStrip(g, k)}`;
}

// ---------- Scoreboard details under the live hero (R4): each sport in its own language.
function heroStrip(g, k) {
  if (g.sport === 'soccer') {
    const now = /HALFTIME/.test(g.statusName) ? 45 : parseInt(g.clock, 10) || 0;
    return `<div class="hstrip">${goalLine(g.goals || [], now, k, liveLabel(g))}</div>`;
  }
  const L = k.left.team, R = k.right.team;
  const n = Math.max(4, L.lines?.length || 0, R.lines?.length || 0);
  if (!L.lines?.length && !R.lines?.length) return '';
  const q = (i) => (i < 4 ? `Q${i + 1}` : n > 5 ? `OT${i - 3}` : 'OT');
  const row = (x) => `<span class="tm"><i style="background:${x.bg};${edge(x.bg)}"></i>${esc(x.team.abbr)}</span>${Array.from({ length: n }, (_, i) => `<span class="${i === g.period - 1 ? 'now' : x.team.lines?.[i] == null ? 'h' : ''}">${esc(x.team.lines?.[i] ?? '–')}</span>`).join('')}<span class="tot">${esc(x.team.score ?? '0')}</span>`;
  const said = [k.left, k.right].map((x) => `${x.team.abbr} ${(x.team.lines || []).join(', ')}, total ${x.team.score ?? 0}`).join('. ');
  let html = `<div class="qs" style="--n:${n}" role="img" aria-label="${esc(`Score by quarter. ${said}`)}"><span></span>${Array.from({ length: n }, (_, i) => `<span class="h">${q(i)}</span>`).join('')}<span class="h">Total</span>${row(k.left)}${row(k.right)}</div>`;
  if (g.sport === 'football' && g.sit?.dd) {
    const has = [L, R].find((t) => t.id === g.sit.poss);
    html += `<div class="hsub"><b>${esc(g.sit.dd)}</b><span>${has ? `${esc(has.abbr)} ball` : ''}${g.sit.at ? ` · ${esc(g.sit.at)}` : ''}</span></div>`;
  }
  if (g.sport === 'basketball' && (L.top || R.top)) {
    const t = (x) => (x.top ? `<b>${esc(x.top.who)} ${esc(x.top.v)}</b>` : '');
    html += `<div class="hsub lead"><span>Top scorers</span><span>${[t(L), t(R)].filter(Boolean).join(' · ')}</span></div>`;
  }
  return `<div class="hstrip">${html}</div>`;
}

// Goal timeline, 0' to 90': a dot per goal in the scoring team's kit. Used live and on match pages.
export function goalLine(goals, now, k, label = '', cap = true) {
  const end = Math.max(90, now, ...goals.map((x) => x.m));
  const at = (min) => `${Math.min(100, (min / end) * 100).toFixed(1)}%`;
  const kit = (id) => (id === k.right.team.id ? k.right : id === k.left.team.id ? k.left : null);
  goals = goals.filter((x) => kit(x.t));
  // Goals a few minutes apart would sit on top of each other, so every other one steps up a lane.
  let prev = -99, lane = 0;
  const dots = goals.map((x) => {
    const s = kit(x.t);
    lane = x.m - prev < 6 ? 1 - lane : 0; prev = x.m;
    const e = edge(s.bg).replace('box-shadow:', '--e:');
    return `<span class="g${lane ? ' up' : ''}" style="left:${at(x.m)};background:${s.bg};${e}"></span>`;
  }).join('');
  const said = goals.length ? goals.map((x) => `${kit(x.t).team.short} ${x.m}'${x.who ? ` ${x.who}` : ''}${x.og ? ' own goal' : ''}`).join(', ') : 'No goals yet';
  return `${cap ? `<div class="tlcap">Goal timeline${label ? `<span>${esc(label)}</span>` : ''}</div>` : ''}<div class="tline" role="img" aria-label="${esc(`Goals: ${said}`)}"><span class="ln"></span><span class="done" style="width:${at(now)}"></span><span class="ht" style="left:${at(45)}"></span>${dots}</div><div class="tlk" aria-hidden="true"><span>0'</span><span class="htl" style="left:${at(45)}">HT</span><span>${end > 90 ? `${end}'` : "90'"}</span></div>`;
}

// ---------- Follow buttons. The item travels as JSON so the pick keeps its name and logo.
// lite = outline, for Follow buttons repeated down a list, so green still stands out where it matters.
export function followBtn(kind, key, item, { size = 'sm', label = 'Follow', lite = false } = {}) {
  const on = following(kind, key);
  // Spoken with the name, so a list of buttons isn't "Follow, Follow, Follow".
  const who = item?.name ? ` ${item.name}` : '';
  if (on) return `<button class="btn ${size} on" data-act="unfollow" data-kind="${kind}" data-key="${esc(key)}" aria-pressed="true" aria-label="${esc(`Following${who}`)}">${icon('check')}Following</button>`;
  return `<button class="btn ${size} go${lite ? ' lite' : ''}" data-act="follow" data-kind="${kind}" data-item="${esc(JSON.stringify(item))}" aria-pressed="false" aria-label="${esc(`${label}${who}`)}">${icon('plus')}${label}</button>`;
}
// Calendar button: its own layer, next to Follow. compact = icon only (match and league headers).
export function calBtn(kind, key, item, { compact = false, covered = '' } = {}) {
  const on = inCal(kind, key);
  const cls = `btn sm ${on || covered ? 'on' : 'ghost'}${compact ? ' icon' : ''}`;
  if (covered && !on) return `<span class="${cls}" role="img" aria-label="In your calendar through ${esc(covered)}">${icon('cal')}${compact ? '' : 'In calendar'}</span>`;
  if (on) return `<button class="${cls}" data-act="uncal" data-kind="${kind}" data-key="${esc(key)}" aria-pressed="true" aria-label="In your calendar. Tap to remove">${icon('cal')}${compact ? '' : 'In calendar'}</button>`;
  return `<button class="${cls}" data-act="cal" data-kind="${kind}" data-item="${esc(JSON.stringify(item))}" aria-pressed="false" aria-label="Add to your iPhone calendar">${icon('calplus')}${compact ? '' : 'Calendar'}</button>`;
}
export const teamPick = (path, t) => ({ path, id: t.id, name: t.name, abbr: t.abbr, logo: t.logo });
export const teamFollowBtn = (path, t, opts) => followBtn('team', teamKey(path, t.id), teamPick(path, t), opts);

export const skel = (n = 3, tall = false) => (tall ? '<div class="skel tall"></div>' : '') + '<div class="skel"></div>'.repeat(n);
export function errorCard(msg = 'Couldn’t reach the score feed.') {
  return `<div class="banner amber">${icon('wifi')}<span>${esc(msg)} Check your connection. It will try again on its own.</span></div>`;
}
export const backBtn = (fallback, label) => `<a class="back" href="${fallback}" data-act="back">${icon('back')}${esc(label)}</a>`;

let toastTimer = 0;
export function toast(msg, undo) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  el.hidden = false;
  if (undo) el.querySelector('button').onclick = () => { undo(); el.hidden = true; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 5000 : 2500);
}
export { isDark };
