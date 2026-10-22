// The full-screen clip player for the Clips tab (FTLTG, Darren 22 Oct 2026: "game by game", like Stories).
// Games are a vertical feed that follows your finger (native scroll-snap, like Reels): swipe up for the next game,
// down for the one before. Inside a game its moments play in order, each with a progress segment in the scoring
// team's kit colour: tap the right quarter for the next moment, the left quarter for the previous one, the middle
// to pause; hold to pause until you let go. Score, minute, scorer and source sit in strips above and below the
// video, never over the picture's middle.
// Seamless (Darren, 22 Oct 2026: "clunky, slow to start, stutters, swiping jumpy"):
// - every moment first shows a still in the kits with its minute, on top of the video, until its frames move; the
//   video itself is always visible, because iPhone may not start a video it can't see (22 Oct 2026: on Darren's
//   iPhone the player opened and never played). A clip that hasn't started in 4 s gets a play button;
// - one clip is got ready at a time, and only after the one on screen has played smoothly for a moment: first the
//   next moment, then the next game's first clip, placed in the next game's slide so a swipe drags it in already
//   showing its first frame. Three video elements are shared by every slide;
// - the next few clips' servers are warmed while you watch (warm.js), so even a clip that wasn't got ready starts fast;
// - Reduce Motion or Low Data Mode: nothing loads or plays on its own; the clip you tap plays.
import { esc, icon } from './util.js';
import { crest } from './identity.js';
import { markSeen } from './feed.js';
import { load as loadPref, save as savePref } from './store.js';
import { masterOf } from './clips.js';
import { warm } from './warm.js';

// Sound stays as you last left it, for every clip and every visit (Darren, 22 Oct 2026).
let el = null, track = null, S = null, sound = !!loadPref('clipSound', false), io = null;
// The three video elements live for the whole visit: iPhone lets a video play with sound on its own (when the clip
// before it ends) only if that same element was started once by a tap, so they're unlocked on your first tap and kept.
let SLOTS = null;
const root = document.documentElement;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!navigator.connection?.saveData;
const SETTLE = 250; // ms after the clip on screen starts before the next one loads (1.2 s made quick taps wait)
// Diagnostics: "?debug" shows each video's events on screen (used to find why clips stalled on iPhone, 22 Oct 2026).
const DBG = /[?&]debug\b/.test(location.search);
function dbg(msg) { if (!DBG) return; let b = document.getElementById('rdbg'); if (!b) { b = document.createElement('pre'); b.id = 'rdbg'; b.style.cssText = 'position:fixed;left:0;right:0;top:40%;z-index:99;max-height:40%;overflow:auto;margin:0;padding:6px;background:rgba(0,0,0,.8);color:#0f0;font:11px/1.3 monospace;pointer-events:none;white-space:pre-wrap'; document.body.appendChild(b); } b.textContent = `${(performance.now() / 1000).toFixed(1)} ${msg}\n` + b.textContent.slice(0, 3000); }
addEventListener('error', (e) => dbg(`ERR ${e.message}`));
addEventListener('unhandledrejection', (e) => dbg(`REJ ${e.reason}`));

// queue: [{ g, k, moments: [{ clip, label, sub, who, team, h, a }], full }]; starts at game gi, moment mi.
export function openReel(queue, gi = 0, mi = 0) {
  close();
  queue = queue.map((x) => ({ ...x, list: [...x.moments.filter((m) => m.clip), ...(x.full ? [{ clip: x.full, label: 'Full', who: 'Full highlights', full: true }] : [])] })).filter((x) => x.list.length);
  if (!queue.length) return;
  gi = Math.min(gi, queue.length - 1);
  S = { queue, gi: -1, at: queue.map((_, j) => (j === gi ? mi : 0)), scrollY, cur: null, primeT: 0, gen: 0, mode: 'tap' };
  el = document.createElement('div');
  el.className = 'reel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Clips');
  el.innerHTML = `<div class="rtrack">${queue.map(slide).join('')}</div>
<button class="rx" aria-label="Close clips">${icon('x')}</button>
<button class="rsnd" aria-pressed="${sound}" aria-label="Sound">${sound ? SPK_ON : SPK}</button>
<span class="rflash" aria-hidden="true"></span>
<button class="sr rprev">Previous clip</button><button class="sr rnext">Next clip</button><button class="sr rnextg">Next game</button><button class="sr rprevg">Previous game</button>`;
  document.body.appendChild(el);
  root.classList.add('reeling');
  track = el.querySelector('.rtrack');
  S.slots = SLOTS ||= [0, 1, 2].map(makeVideo);
  wire();
  track.scrollTop = gi * track.clientHeight;
  activate(gi);
  unlock(); // this open is a tap: let all three elements play with sound from now on
  // From here, whichever game the feed settles on is the one playing.
  io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) { const k = +e.target.dataset.gi; if (k !== S.gi) activate(k); }
  }, { root: track, threshold: [0.6] });
  for (const s of track.children) io.observe(s);
  el.querySelector('.rx').focus({ preventScroll: true });
}

export function close() {
  if (!el) return;
  clearTimeout(S?.primeT); clearTimeout(S?.watch);
  io?.disconnect(); io = null;
  for (const s of S.slots) { s.v.pause(); s.v.removeAttribute('src'); delete s.v.dataset.src; s.v.classList.remove('on'); s.ready = null; s.v.load(); }
  document.removeEventListener('keydown', onKey);
  el.remove(); el = null; track = null;
  root.classList.remove('reeling');
  scrollTo(0, S.scrollY);
  S = null;
  dispatchEvent(new Event('reel:closed'));
}

// ---------- One slide per game: its kits and score at the top, segments, the moment's caption at the bottom.
const chip = (x) => `<span class="rk" style="background:${x.bg};color:${x.ink}">${crest(x.team, 18, true)}${esc(x.team.abbr)}</span>`;
function slide(x, gi) {
  const { k, g } = x, L = k.left, R = k.right;
  const kitOf = (t) => (t === L.team.id ? L : t === R.team.id ? R : null);
  const segs = x.list.map((m) => `<i style="--c:${kitOf(m.team)?.bg || '#fff'}"><b></b></i>`).join('');
  return `<section class="rslide" data-gi="${gi}" style="--a:${L.bg};--b:${R.bg}" aria-label="${esc(`${L.team.short} ${L.team.score ?? ''}, ${R.team.short} ${R.team.score ?? ''}`)}">
<div class="rpost" aria-hidden="true"><b></b></div><div class="rvbox"></div>
<div class="rtop"><div class="rbar" aria-hidden="true">${segs}</div><div class="rgame"><span class="rteams">${chip(L)}<b>${esc(L.team.score ?? '')}–${esc(R.team.score ?? '')}</b>${chip(R)}<span>${esc(g.state === 'in' ? 'Live' : g.sport === 'soccer' ? 'FT' : 'Final')}</span></span></div></div>
<div class="rcap"><div class="rmom"></div><p class="rsrc"></p></div>
<button class="rplay" hidden aria-label="Play">${PLAY}</button></section>`;
}
const slideEl = (gi) => track?.children[gi];
const game = () => S.queue[S.gi];

// ---------- The three shared video elements.
function makeVideo() {
  const v = document.createElement('video');
  v.playsInline = true; v.muted = true; v.preload = 'auto';
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  const s = { v, ready: null };
  if (DBG) for (const ev of ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled', 'pause', 'ended', 'error']) v.addEventListener(ev, () => dbg(`${S?.slots?.indexOf(s)} ${ev} ${(v.dataset.src || '').slice(-18)} rs${v.readyState} ${v.error ? 'e' + v.error.code : ''} cur${s === S?.cur ? 1 : 0}`));
  v.addEventListener('playing', () => {
    v.classList.add('on');
    s.ready?.(); s.ready = null;
    if (s !== S?.cur) v.pause(); // got ready: hold on the first frame
  });
  v.addEventListener('timeupdate', () => {
    if (v.currentTime > 0.05) v.classList.add('on'); // frames are moving, even if 'playing' never came
    if (!el || s !== S.cur) return;
    const b = slideEl(S.gi)?.querySelector('.rbar').children[S.at[S.gi]]?.firstChild;
    if (b && v.duration) b.style.width = `${(100 * v.currentTime) / v.duration}%`;
    if (v.currentTime > 1.5) markSeen(game().list[S.at[S.gi]]?.clip);
  });
  v.addEventListener('waiting', () => { if (s === S?.cur) segClass('buf', true); });
  // Playing: no "loading" pulse, and no play button over it (the watchdog may have shown one while it loaded).
  v.addEventListener('playing', () => { if (s === S?.cur) { segClass('buf', false); clearTimeout(S.watch); slideEl(S.gi)?.querySelector('.rplay')?.setAttribute('hidden', ''); } });
  v.addEventListener('ended', () => { if (el && s === S.cur) { markSeen(game().list[S.at[S.gi]]?.clip); next(true); } });
  v.addEventListener('error', () => {
    // ESPN's direct 720p stream missing: its master playlist instead (clips.js).
    const alt = masterOf(v.getAttribute('src'));
    if (alt) { v.src = alt; v.play().catch(() => {}); return; }
    s.ready?.(); s.ready = null; if (el && s === S.cur && v.getAttribute('src')) next(true); // a deleted clip: move on
  });
  return s;
}
const segClass = (c, on) => slideEl(S.gi)?.querySelector('.rbar').children[S.at[S.gi]]?.classList.toggle(c, on);
function load(s, clip, box, hidden) {
  if (s.v.parentNode !== box) box.appendChild(s.v);
  s.v.classList.toggle('off', !!hidden);
  s.v.classList.toggle('wide', !clip.tall);
  if (s.v.dataset.src === clip.src) return;
  s.v.dataset.src = clip.src; s.v.classList.remove('on');
  s.v.src = clip.src;
}
// Get a clip ready: iOS loads nothing for a video that never plays, so play it muted until its first frame, then hold.
function prime(s, clip, box, hidden) {
  load(s, clip, box, hidden);
  if (s.v.classList.contains('on')) return Promise.resolve();
  return new Promise((done) => {
    const t = setTimeout(() => { s.ready = null; done(); }, 8000);
    s.ready = () => { clearTimeout(t); done(); };
    s.v.muted = true;
    s.v.play().catch(() => { s.ready?.(); s.ready = null; });
  });
}
// A slot for this clip: the one already holding it, else one the plan doesn't need.
function slotFor(clip, keep) {
  return S.slots.find((s) => s.v.dataset.src === clip.src) || S.slots.find((s) => s !== S.cur && !keep.includes(s.v.dataset.src)) || S.slots.find((s) => s !== S.cur);
}

// ---------- Showing a moment
function activate(gi) {
  if (S.cur && S.gi !== gi) S.cur.v.pause();
  S.gi = gi;
  const mode = S.mode; S.mode = 'tap'; // a swipe is a choice; an automatic move to the next game passes its own mode
  show(S.at[gi] || 0, mode);
}
function show(n, mode) {
  const G = game(), L = G.list, gi = S.gi;
  const i = Math.max(0, Math.min(n, L.length - 1));
  S.at[gi] = i;
  const m = L[i], sl = slideEl(gi), box = sl.querySelector('.rvbox');
  const nextGameClip = S.queue[gi + 1]?.list[S.at[gi + 1] || 0]?.clip;
  const s = slotFor(m.clip, [L[i + 1]?.clip.src, nextGameClip?.src]);
  if (S.cur && S.cur !== s) S.cur.v.pause();
  S.cur = s;
  load(s, m.clip, box, false);
  for (const v of box.querySelectorAll('video')) if (v !== s.v) v.classList.add('off');
  if (s.v.currentTime > 0.6) s.v.currentTime = 0;
  poster(sl, G, m);
  caption(sl, G, m, i, L.length);
  [...sl.querySelector('.rbar').children].forEach((x, j) => { x.classList.toggle('done', j < i); if (j >= i) x.firstChild.style.width = '0'; });
  const pb = sl.querySelector('.rplay');
  if (mode === 'tap' || (mode && !calm())) play(); else pb.hidden = false;
  warm([m.clip, ...L.slice(i + 1, i + 4).map((x) => x.clip), ...(S.queue[gi + 1]?.list.slice(S.at[gi + 1] || 0, 2) || []).map((x) => x.clip)]);
  schedulePrime();
}
function play() {
  const s = S.cur, v = s.v, pb = slideEl(S.gi).querySelector('.rplay');
  pb.hidden = true;
  v.muted = !sound;
  // Never a stuck still: if this clip hasn't started within 4 seconds, offer the play button (it keeps loading).
  clearTimeout(S.watch);
  S.watch = setTimeout(() => { if (S && S.cur === s && (v.paused || v.currentTime < 0.05) && !v.ended) { dbg('watchdog: not started'); pb.hidden = false; } }, 4000);
  v.play().catch((err) => {
    dbg(`play() rejected ${err?.name}`);
    // Sound not allowed without a tap: play muted this once and keep your choice; the next tap turns it back on.
    if (!v.muted) { v.muted = true; v.play().catch(() => { pb.hidden = false; }); return; }
    pb.hidden = false; // Low Power Mode: no auto-play, so a play button
  });
}
// The still under the video: the clip's own picture when Reddit gives one, else the two kits with the minute.
function poster(sl, G, m) {
  const box = sl.querySelector('.rpost'), b = box.querySelector('b');
  let img = box.querySelector('img');
  if (m.clip.poster) {
    if (!img) { img = document.createElement('img'); img.alt = ''; img.referrerPolicy = 'no-referrer'; box.prepend(img); }
    if (img.getAttribute('src') !== m.clip.poster) img.src = m.clip.poster;
  } else img?.remove();
  b.textContent = m.full ? 'Full' : G.g.sport === 'basketball' ? '' : m.label || '';
}
function caption(sl, G, m, i, n) {
  const { k, g } = G, L = k.left, R = k.right;
  const s = m.team === L.team.id ? L : m.team === R.team.id ? R : null;
  const sc = m.h != null && m.a != null ? (g.sport === 'soccer' ? `${g.home.abbr} ${m.h}–${m.a} ${g.away.abbr}` : `${g.away.abbr} ${m.a}–${m.h} ${g.home.abbr}`) : '';
  sl.querySelector('.rmom').innerHTML = `${s ? `<span class="rchip" style="background:${s.bg};color:${s.ink}">${esc(s.team.abbr)}</span>` : ''}${!m.full && g.sport !== 'basketball' && m.label ? `<b class="rmin">${esc(m.label)}</b>` : ''}<span class="rwho">${esc(m.who || m.clip.title || '')}</span>${sc ? `<span class="rsc">${esc(sc)}</span>` : ''}`;
  sl.querySelector('.rsrc').innerHTML = `${esc([m.clip.via, m.clip.by].filter(Boolean).join(' · '))}${m.clip.url ? ` <a href="${esc(m.clip.url)}" target="_blank" rel="noopener">Open</a>` : ''}<span>${i + 1} of ${n}${S.queue.length > 1 ? ' · Swipe up for the next game' : ''}</span>`;
}

// ---------- Getting the next clips ready, one at a time, once the one on screen plays smoothly.
function schedulePrime() {
  clearTimeout(S.primeT);
  if (calm()) return;
  const gen = ++S.gen, v = S.cur.v;
  const start = () => { if (S && gen === S.gen) S.primeT = setTimeout(() => primeNext(gen), SETTLE); };
  if (!v.paused && v.readyState >= 3) start();
  else v.addEventListener('playing', start, { once: true });
}
async function primeNext(gen) {
  if (!el || gen !== S.gen) return;
  const gi = S.gi, L = game().list, i = S.at[gi];
  const nm = L[i + 1]?.clip, ng = S.queue[gi + 1]?.list[S.at[gi + 1] || 0]?.clip;
  if (nm) await prime(slotFor(nm, [ng?.src]), nm, slideEl(gi).querySelector('.rvbox'), true);
  if (!el || gen !== S.gen) return;
  if (ng) await prime(slotFor(ng, [nm?.src]), ng, slideEl(gi + 1).querySelector('.rvbox'), false); // its first frame waits in the next slide
}

// ---------- Moving
function next(mode = 'tap') {
  if (S.at[S.gi] < game().list.length - 1) show(S.at[S.gi] + 1, mode);
  else goGame(1, mode);
}
function goGame(d, mode = 'tap') {
  const k = S.gi + d;
  if (k < 0) return;
  if (k >= S.queue.length) { if (mode === 'tap') close(); else slideEl(S.gi).querySelector('.rplay').hidden = false; return; }
  S.mode = mode;
  track.scrollTo({ top: k * track.clientHeight, behavior: calm() ? 'auto' : 'smooth' });
}
function setSound() {
  savePref('clipSound', sound);
  const b = el?.querySelector('.rsnd'); if (!b) return;
  b.setAttribute('aria-pressed', String(sound)); b.innerHTML = sound ? SPK_ON : SPK;
}
// Inside a tap: start and stop every element once, so iPhone lets each play with sound later without a tap.
function unlock() {
  for (const s of S.slots) {
    if (s === S.cur) continue;
    const v = s.v;
    v.muted = true; // silent: the tap is what counts, not the sound
    if (s.ready) continue; // already being got ready (playing muted to its first frame)
    v.play().then(() => { if (s !== S?.cur) v.pause(); }).catch(() => {});
  }
}
function flash(svg) { const f = el.querySelector('.rflash'); f.innerHTML = svg; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function toggle() { const v = S.cur.v; if (v.paused) { play(); flash(PLAY); } else { v.pause(); flash(PAUSE); } }

function wire() {
  // Taps on the slide on screen: left quarter back, right quarter on, middle pause. Hold to pause. Vertical drags
  // are the feed's own scrolling (they cancel the hold).
  let holdT = 0, held = false, x0 = 0, y0 = 0;
  track.addEventListener('pointerdown', (e) => { if (e.target.closest('button, a')) return; x0 = e.clientX; y0 = e.clientY; held = false; holdT = setTimeout(() => { held = true; S.cur.v.pause(); }, 300); });
  track.addEventListener('pointermove', (e) => { if (Math.abs(e.clientY - y0) > 10 || Math.abs(e.clientX - x0) > 10) clearTimeout(holdT); });
  track.addEventListener('pointercancel', () => { clearTimeout(holdT); held = false; });
  track.addEventListener('scroll', () => clearTimeout(holdT), { passive: true });
  track.addEventListener('pointerup', () => { clearTimeout(holdT); if (held) { held = false; play(); } });
  track.addEventListener('click', (e) => {
    if (sound && S.cur.v.muted) S.cur.v.muted = false; // a tap may play sound: put back what an automatic step lost
    if (e.target.closest('.rplay')) { if (S.cur.v.ended) show(0, 'tap'); else play(); return; }
    if (e.target.closest('button, a') || held) return;
    const r = track.getBoundingClientRect(), f = (e.clientX - r.left) / r.width;
    if (f < 0.25) show(S.cur.v.currentTime > 2 ? S.at[S.gi] : S.at[S.gi] - 1, 'tap');
    else if (f > 0.75) next();
    else toggle();
  });
  el.querySelector('.rx').addEventListener('click', close);
  el.querySelector('.rprev').addEventListener('click', () => show(S.at[S.gi] - 1, 'tap'));
  el.querySelector('.rnext').addEventListener('click', () => next());
  el.querySelector('.rnextg').addEventListener('click', () => goGame(1));
  el.querySelector('.rprevg').addEventListener('click', () => goGame(-1));
  el.querySelector('.rsnd').addEventListener('click', () => { sound = !sound; setSound(); S.cur.v.muted = !sound; if (!S.cur.v.paused) play(); unlock(); });
  document.addEventListener('keydown', onKey);
}
function onKey(e) {
  if (!el) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') show(S.at[S.gi] - 1, 'tap');
  else if (e.key === 'ArrowDown') { e.preventDefault(); goGame(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); goGame(-1); }
  else if (e.key === ' ') { e.preventDefault(); toggle(); }
}
addEventListener('hashchange', close);

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z"/></svg>';
const SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
const SPK_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>';
