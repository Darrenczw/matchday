// Shared building blocks: game rows, the live hero, follow buttons, toasts, "moved" notes.
import { esc, sg, shortDay, icon } from './util.js';
import { kitsFor, crest, compImg, isDark } from './identity.js';
import { liveLabel } from './espn.js';
import { mainMarket } from './tv.js';
import { reasons } from './suggest.js';
import { load, save, following, teamKey } from './store.js';

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
    bits.push(`<span class="tvt">${esc(m.label)} · ${m.kind === 'none' ? 'Not listed' : esc(m.channels[0] + (m.channels.length > 1 ? ` +${m.channels.length - 1}` : ''))}</span>`);
  }
  const moved = g.state === 'pre' ? movedFrom(g) : null;
  if (g.postponed) bits.push('<span class="pp">POSTPONED</span>');
  else if (moved) bits.push(`<span class="moved">${movedText(moved)}</span>`);
  else if (why && g.state === 'pre') { const r = reasons(g); if (r[0]) bits.push(`<em>${esc(r[0])}</em>`); }
  const label = `${g.sport === 'soccer' ? `${g.home.short} v ${g.away.short}` : `${g.away.short} at ${g.home.short}`}, ${s.wdl} ${s.d} ${s.mo} ${g.timeValid ? s.hm : 'time to be confirmed'}, ${comp.name}`;
  return `<a class="row${g.state === 'post' ? ' done' : ''}" href="${href.match(g)}" aria-label="${esc(label)}">${panel('l', k.left)}<div class="mid">${mid}</div>${panel('r', k.right)}<div class="meta">${bits.join('<span aria-hidden="true">·</span>')}</div></a>`;
}

export function hero(g) {
  const k = kitsFor(g);
  const m = mainMarket(g);
  const tv = m.kind !== 'none' ? m.channels[0] : g.usTV[0];
  const side = (x, r) => {
    const sc = String(x.team.score ?? '0');
    return `<div class="shirt${r ? ' r' : ''}${x.light ? ' lightkit' : ''}" style="background:${x.bg};color:${x.ink}">${crest(x.team, 40, true)}<b class="score${sc.length > 2 ? ' sm' : ''}">${esc(sc)}</b><span class="name">${esc(x.team.short)}</span></div>`;
  };
  return `<a class="hero" href="${href.match(g)}" aria-label="${esc(`Live: ${k.left.team.short} ${k.left.team.score}, ${k.right.team.short} ${k.right.team.score}, ${liveLabel(g)}`)}">${side(k.left)}${side(k.right, true)}<div class="state"><i class="dot"></i><span>${esc(liveLabel(g))}${tv ? ` · ${esc(tv)}` : ''}</span></div></a>`;
}

// ---------- Follow buttons. The item travels as JSON so the pick keeps its name and logo.
export function followBtn(kind, key, item, { size = 'sm', label = 'Follow' } = {}) {
  const on = following(kind, key);
  if (on) return `<button class="btn ${size} on" data-act="unfollow" data-kind="${kind}" data-key="${esc(key)}" aria-pressed="true">${icon('check')}Following</button>`;
  return `<button class="btn ${size} go" data-act="follow" data-kind="${kind}" data-item="${esc(JSON.stringify(item))}" aria-pressed="false">${icon('plus')}${label}</button>`;
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
