// Shared building blocks: game rows, the live hero, follow buttons, toasts, "moved" notes.
import { esc, sg, shortDay, icon } from './util.js';
import { kitsFor, crest, compImg, isDark, edge } from './identity.js';
import { liveLabel } from './espn.js';
import { mainMarket } from './tv.js';
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
export function movedFrom(g) {
  const s = seen[g.id];
  if (!s) { seen[g.id] = { d: g.date, v: g.timeValid }; queueSave(); return null; }
  if (s.d !== g.date && s.v && g.timeValid) { seen[g.id] = { d: g.date, v: true, prev: s.d, at: Date.now() }; queueSave(); }
  else if (s.d !== g.date || s.v !== g.timeValid) { seen[g.id] = { ...s, d: g.date, v: g.timeValid }; queueSave(); }
  const x = seen[g.id];
  return x.prev && Date.now() - x.at < 7 * 864e5 ? x.prev : null;
}
function queueSave() { clearTimeout(seenTimer); seenTimer = setTimeout(() => save('seen', seen), 1000); }
export const movedText = (prev) => { const p = sg(prev); return `Moved from ${p.wd} ${p.hm}`; };

// ---------- Panels
function panel(side, k, size = 26, extra = '') {
  const t = k.team, r = side === 'r';
  const c = crest(t, size, true), name = `<b>${esc(t.abbr || t.short)}</b>`;
  return `<div class="p${r ? ' r' : ''}${k.light ? ' lightkit' : ''}" style="background:${k.bg};color:${k.ink}">${r ? name + c : c + name}${extra}</div>`;
}
export function scoreText(k) { return `${esc(k.left.team.score ?? '')}–${esc(k.right.team.score ?? '')}`; }

export function gameRow(g, { why = true, tv = true } = {}) {
  const k = kitsFor(g), s = sg(g.date);
  let mid;
  if (g.postponed) mid = `<b>${g.timeValid ? s.hm : 'TBC'}</b><span>Postponed</span>`;
  else if (g.state === 'in') mid = `<b>${scoreText(k)}</b><span class="live"><i class="dot"></i>${esc(liveLabel(g))}</span>`;
  else if (g.state === 'post') mid = `<b>${scoreText(k)}</b><span>${esc(g.sport === 'soccer' ? g.detail || 'FT' : 'Final')} · ${s.wd}</span>`;
  else mid = `<b>${g.timeValid ? s.hm : 'TBC'}</b><span>${shortDay(g.date)} · ${k.sep}</span>`;
  const bits = [];
  const comp = g.comp;
  bits.push(`${compImg(comp.logo, 14, comp.name)}<span>${esc(comp.name)}</span>`);
  if (tv && g.state !== 'post') {
    const m = mainMarket(g);
    bits.push(`<span class="tvt">${esc(m.label)} · ${m.kind === 'none' ? 'Not listed' : m.channels[0] === 'Not shown live' ? '3pm blackout' : esc(m.channels[0] + (m.channels.length > 1 ? ` · ${m.channels.length - 1} more` : ''))}</span>`);
  }
  const moved = g.state === 'pre' ? movedFrom(g) : null;
  if (g.postponed) bits.push('<span class="pp">POSTPONED</span>');
  else if (moved) bits.push(`<span class="moved">${movedText(moved)}</span>`);
  else if (why && g.state === 'pre') { const r = reasons(g); if (r[0]) bits.push(`<em>${esc(r[0])}</em>`); }
  const label = `${g.sport === 'soccer' ? `${g.home.short} v ${g.away.short}` : `${g.away.short} at ${g.home.short}`}, ${s.wdl} ${s.d} ${s.mo} ${g.timeValid ? s.hm : 'time to be confirmed'}, ${comp.name}`;
  return `<a class="row${g.state === 'post' ? ' done' : ''}" href="${href.match(g)}" aria-label="${esc(label)}">${panel('l', k.left)}<div class="mid">${mid}</div>${panel('r', k.right)}<div class="meta">${bits.join('<span aria-hidden="true">·</span>')}</div></a>`;
}

const POSS = '<svg class="poss" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.6 16.4C2.4 11 7.6 3.9 16.4 3.6c1.2 5.4-4 12.5-12.8 12.8z"/><path d="M7.6 12.4l4.8-4.8M8.6 9.6l1.8 1.8M10.2 8l1.8 1.8"/></svg>';

export function hero(g) {
  const k = kitsFor(g);
  const m = mainMarket(g);
  const tv = m.kind !== 'none' ? m.channels[0] : g.usTV[0];
  const side = (x, r) => {
    const sc = String(x.team.score ?? '0');
    const ball = g.sit?.poss === x.team.id ? POSS : '';
    return `<div class="shirt${r ? ' r' : ''}${x.light ? ' lightkit' : ''}" style="background:${x.bg};color:${x.ink}">${crest(x.team, 40, true)}<b class="score${sc.length > 2 ? ' sm' : ''}">${esc(sc)}</b><span class="name">${esc(x.team.short)}${ball}${g.sport !== 'soccer' ? `<small>${x.team.home ? 'Home' : 'Away'}</small>` : ''}</span></div>`;
  };
  return `<a class="hero sp-${g.sport}" href="${href.match(g)}" aria-label="${esc(`Live: ${k.left.team.short} ${k.left.team.score}, ${k.right.team.short} ${k.right.team.score}, ${liveLabel(g)}`)}">${side(k.left)}${side(k.right, true)}<div class="state"><i class="dot"></i><span>${esc(liveLabel(g))}${tv ? ` · ${esc(tv)}` : ''}</span></div></a>${heroStrip(g, k)}`;
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
  if (on) return `<button class="btn ${size} on" data-act="unfollow" data-kind="${kind}" data-key="${esc(key)}" aria-pressed="true">${icon('check')}Following</button>`;
  return `<button class="btn ${size} go${lite ? ' lite' : ''}" data-act="follow" data-kind="${kind}" data-item="${esc(JSON.stringify(item))}" aria-pressed="false">${icon('plus')}${label}</button>`;
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
