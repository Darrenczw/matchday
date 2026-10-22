// The full-screen clip player for the Clips tab (FTLTG, Darren 22 Oct 2026: "game by game", like Stories).
// One game at a time: its moments play in order, each with a progress segment in the scoring team's kit colour.
// Tap the right quarter for the next moment, the left quarter for the previous one, the middle to pause; hold to
// pause until you let go. Swipe up for the next game, down to close. Score, minute, scorer and source sit in
// strips above and below the video, never over the picture's middle.
// Like the match-page player (clips.js), three video slots keep the next two clips ready, so a tap swaps at once.
import { esc, icon } from './util.js';
import { crest } from './identity.js';
import { markSeen } from './feed.js';

let el = null, state = null, sound = false;
// Reduce Motion or Low Data Mode: nothing plays or loads on its own. The clip you tapped plays; each next one
// waits for a tap (PRD-ftltg 8).
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!navigator.connection?.saveData;
const root = document.documentElement;

// queue: [{ g, k, moments: [{ clip, label, sub, who, team, h, a }], full }]; starts at game gi, moment mi.
export function openReel(queue, gi = 0, mi = 0) {
  close();
  queue = queue.map((x) => ({ ...x, list: [...x.moments.filter((m) => m.clip), ...(x.full ? [{ clip: x.full, label: 'Full', who: 'Full highlights', full: true }] : [])] })).filter((x) => x.list.length);
  if (!queue.length) return;
  state = { queue, gi: Math.min(gi, queue.length - 1), i: mi, scrollY };
  el = document.createElement('div');
  el.className = 'reel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="rv"><video playsinline muted preload="auto"></video><video playsinline muted preload="auto" class="off"></video><video playsinline muted preload="auto" class="off"></video></div>
<div class="rtop"><div class="rbar" aria-hidden="true"></div><div class="rgame"><span class="rteams"></span><button class="rx" aria-label="Close clips">${icon('x')}</button></div></div>
<div class="rcap"><div class="rmom"><span class="rchip"></span><b class="rmin"></b><span class="rwho"></span><span class="rsc"></span></div><p class="rsrc"></p></div>
<span class="rflash" aria-hidden="true"></span><button class="rplay" hidden aria-label="Play">${PLAY}</button>
<button class="rsnd" aria-pressed="false" aria-label="Sound">${SPK}</button>
<button class="sr rprev">Previous clip</button><button class="sr rnext">Next clip</button><button class="sr rnextg">Next game</button>`;
  document.body.appendChild(el);
  root.classList.add('reeling');
  wire();
  show(state.i, 'tap');
  el.querySelector('.rx').focus({ preventScroll: true });
}

export function close() {
  if (!el) return;
  for (const v of el.querySelectorAll('video')) { v.pause(); v.removeAttribute('src'); v.load(); }
  document.removeEventListener('keydown', onKey);
  el.remove(); el = null;
  root.classList.remove('reeling');
  if (state) scrollTo(0, state.scrollY);
  state = null;
  dispatchEvent(new Event('reel:closed'));
}

const game = () => state.queue[state.gi];
const slots = () => [...el.querySelectorAll('video')];
let v = null;

function ready(c, keep) {
  const S = slots();
  let x = S.find((s) => s.dataset.src === c.src);
  if (x) return x;
  x = S.find((s) => s !== v && !keep.some((k) => k && s.dataset.src === k.src)) || S.find((s) => s !== v);
  x.dataset.src = c.src; x.src = c.src; x.muted = true;
  if (x === v || calm()) return x; // calm: load the clip only when it is shown
  const stop = () => { x.removeEventListener('playing', stop); if (x !== v) x.pause(); };
  x.addEventListener('playing', stop);
  x.play().catch(() => {});
  return x;
}
function tryPlay() {
  v.muted = !sound;
  el.querySelector('.rplay').hidden = true;
  v.play().catch(() => {
    if (!v.muted) { sound = false; setSound(); tryPlay(); return; } // sound needs a tap; play muted instead
    el.querySelector('.rplay').hidden = false; // Low Power Mode or Low Data: tap to play
  });
}

function show(n, play) {
  const G = game(), L = G.list;
  state.i = Math.max(0, Math.min(n, L.length - 1));
  const m = L[state.i], next = [L[state.i + 1]?.clip, L[state.i + 2]?.clip || state.queue[state.gi + 1]?.list[0]?.clip];
  const x = ready(m.clip, next);
  if (x !== v) { v?.pause(); v = x; }
  if (v.currentTime > 0.6) v.currentTime = 0;
  for (const s of slots()) s.classList.toggle('off', s !== v);
  v.classList.toggle('wide', !m.clip.tall);
  // Header: the two teams in their kits and the score now.
  const { k, g } = G, L2 = k.left, R2 = k.right;
  el.setAttribute('aria-label', `Clips: ${L2.team.short} ${L2.team.score ?? ''}, ${R2.team.short} ${R2.team.score ?? ''}`);
  el.querySelector('.rteams').innerHTML = `${chip(L2)}<b>${esc(L2.team.score ?? '')}–${esc(R2.team.score ?? '')}</b>${chip(R2)}<span>${esc(g.state === 'in' ? 'Live' : g.sport === 'soccer' ? 'FT' : 'Final')}</span>`;
  // Segments: one per moment, coloured by the team that scored it.
  const kitOf = (t) => (t === L2.team.id ? L2 : t === R2.team.id ? R2 : null);
  el.querySelector('.rbar').innerHTML = L.map((mm, j) => { const s = kitOf(mm.team); return `<i class="${j < state.i ? 'done' : ''}" style="--c:${s ? s.bg : '#fff'}"><b></b></i>`; }).join('');
  // The moment: kit chip, minute, scorer, score after it.
  const s = kitOf(m.team);
  el.querySelector('.rchip').outerHTML = s ? `<span class="rchip" style="background:${s.bg};color:${s.ink}">${esc(s.team.abbr)}</span>` : '<span class="rchip" hidden></span>';
  el.querySelector('.rmin').textContent = m.full ? '' : g.sport === 'basketball' ? '' : m.label || '';
  el.querySelector('.rwho').textContent = m.who || m.clip.title || '';
  const sc = m.h != null && m.a != null ? (g.sport === 'soccer' ? `${g.home.abbr} ${m.h}–${m.a} ${g.away.abbr}` : `${g.away.abbr} ${m.a}–${m.h} ${g.home.abbr}`) : '';
  el.querySelector('.rsc').textContent = sc;
  el.querySelector('.rsrc').innerHTML = `${esc([m.clip.via, m.clip.by].filter(Boolean).join(' · '))}${m.clip.url ? ` <a href="${esc(m.clip.url)}" target="_blank" rel="noopener">Open</a>` : ''}<span>${state.i + 1} of ${L.length}${state.queue.length > 1 ? ` · Swipe up for the next game` : ''}</span>`;
  if (play === 'tap' || (play && !calm())) tryPlay(); else if (play) el.querySelector('.rplay').hidden = false;
  if (!calm()) for (const c of next) if (c) ready(c, [m.clip, ...next]);
}
const chip = (x) => `<span class="rk" style="background:${x.bg};color:${x.ink}">${crest(x.team, 18, true)}${esc(x.team.abbr)}</span>`;

// 'tap' when a person asked for it; true when it follows on its own (a clip ended).
function next(mode = 'tap') {
  if (state.i < game().list.length - 1) show(state.i + 1, mode);
  else nextGame(1, mode);
}
function nextGame(d, mode = 'tap') {
  const gi = state.gi + d;
  if (gi < 0) return;
  if (gi >= state.queue.length) { close(); return; }
  state.gi = gi; state.i = 0;
  el.classList.remove('slide-up', 'slide-down'); void el.offsetWidth; el.classList.add(d > 0 ? 'slide-up' : 'slide-down');
  show(0, mode);
}
function setSound() {
  const b = el?.querySelector('.rsnd'); if (!b) return;
  b.setAttribute('aria-pressed', String(sound)); b.innerHTML = sound ? SPK_ON : SPK;
}
function flash(svg) { const f = el.querySelector('.rflash'); f.innerHTML = svg; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function toggle() { if (v.paused) { tryPlay(); flash(PLAY); } else { v.pause(); flash(PAUSE); } }

function wire() {
  for (const s of slots()) {
    s.addEventListener('timeupdate', () => {
      if (!el || s !== v) return;
      const b = el.querySelector('.rbar').children[state.i]?.firstChild;
      if (b && s.duration) b.style.width = `${(100 * s.currentTime) / s.duration}%`;
      if (s.currentTime > 1.5) markSeen(game().list[state.i]?.clip);
    });
    s.addEventListener('ended', () => { if (el && s === v) { markSeen(game().list[state.i]?.clip); next(true); } });
    s.addEventListener('error', () => { if (el && s === v && s.getAttribute('src')) next(true); }); // a deleted clip: move on, no error screen
  }
  const rv = el.querySelector('.rv');
  let x0 = 0, y0 = 0, t0 = 0, held = false, holdT = 0, moved = false;
  rv.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); moved = false; held = false; holdT = setTimeout(() => { held = true; v.pause(); }, 300); });
  rv.addEventListener('pointermove', (e) => { if (Math.abs(e.clientY - y0) > 12 || Math.abs(e.clientX - x0) > 12) { moved = true; clearTimeout(holdT); } });
  rv.addEventListener('pointerup', (e) => {
    clearTimeout(holdT);
    const dy = e.clientY - y0, dx = e.clientX - x0;
    if (held) { held = false; tryPlay(); return; }
    if (moved && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) { if (dy < 0) nextGame(1); else close(); return; }
    if (moved || Date.now() - t0 > 600) return;
    const r = rv.getBoundingClientRect(), f = (e.clientX - r.left) / r.width;
    if (f < 0.25) show(v.currentTime > 2 ? state.i : state.i - 1, 'tap');
    else if (f > 0.75) next();
    else toggle();
  });
  rv.addEventListener('pointercancel', () => { clearTimeout(holdT); held = false; });
  el.querySelector('.rx').addEventListener('click', close);
  el.querySelector('.rprev').addEventListener('click', () => show(state.i - 1, 'tap'));
  el.querySelector('.rnext').addEventListener('click', () => next());
  el.querySelector('.rnextg').addEventListener('click', () => nextGame(1));
  el.querySelector('.rplay').addEventListener('click', tryPlay);
  el.querySelector('.rsnd').addEventListener('click', () => { sound = !sound; setSound(); v.muted = !sound; if (!v.paused) tryPlay(); });
  document.addEventListener('keydown', onKey);
}
function onKey(e) {
  if (!el) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') show(state.i - 1, 'tap');
  else if (e.key === 'ArrowDown') nextGame(1);
  else if (e.key === 'ArrowUp') nextGame(-1);
  else if (e.key === ' ') { e.preventDefault(); toggle(); }
}
addEventListener('hashchange', close);

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z"/></svg>';
const SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
const SPK_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>';
