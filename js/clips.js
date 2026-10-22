// Clips on match pages, like Instagram Stories (R7, Darren 22 Oct 2026). NBA first: ESPN's game summary lists
// 6–19 short play clips per game, live too, each with a real 9:16 stream.
// - They sit at the very bottom of the match page: read the stats, then scroll down into watching. The player
//   fills the screen and the tab bar slides away ("reels" mode).
// - Tap for the next clip (left edge: previous), hold to pause, swipe sideways for the next game (swipe.js).
//   A swipe made while watching opens the next game straight in its clips.
// - Fast: two video slots. While one plays, the other already holds the next clip, so a tap swaps at once.
//   The first clip starts loading before you get to the bottom.
// The player lives outside the 5 s redraw: the page draws a box with data-keep, app.js's morph() leaves it
// alone, and this module builds the player inside it once.
import { esc } from './util.js';

export const CLIPS = new Set(['basketball']);
const lists = new Map(); // game id -> clips, refreshed on every draw (live games gain clips)
const at = new Map(); // game id -> the clip you're on
let sound = false, pending = false;
const root = document.documentElement;
// iPhone plays HLS itself, so it gets the small vertical stream (about 1–4 MB a clip). Desktop browsers
// that can't get the plain MP4, which is far bigger: fine for testing on the Mac.
const HLS = !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl');

// The clips of a game, in the order they happened; a full recap (over 45 s) goes first.
export function clipList(d) {
  const out = (d?.videos || []).map((v) => {
    const s = v.links?.source || {};
    const src = HLS ? s.HLS?.['9x16']?.href || s.HLS?.href : s.href;
    return src && { id: v.id, title: v.headline || '', dur: v.duration || 0, src, tall: HLS && !!s.HLS?.['9x16'], poster: v.thumbnail || '', t: v.originalPublishDate || '' };
  }).filter(Boolean);
  out.sort((a, b) => ((b.dur > 45) - (a.dur > 45)) || a.t.localeCompare(b.t));
  return out;
}

// The box at the bottom of the page. `title` is the scoreline shown over the clip ("ATL 132–125 ORL").
export function clipBox(g, d, title) {
  const list = CLIPS.has(g.sport) ? clipList(d) : [];
  if (!list.length) {
    // Swiped here while watching: say so on a full screen, so the next swipe carries on.
    if (pending && CLIPS.has(g.sport)) { setTimeout(mount, 0); return `<section class="clips none" data-keep="clip-${esc(g.id)}-0" data-g="${esc(g.id)}"><div class="cv"><p class="cnone"><b>${esc(title)}</b>No clips for this game yet.<span>Swipe for the next game</span></p></div></section>`; }
    if (pending) setTimeout(stopPending, 0);
    return '';
  }
  lists.set(g.id, list);
  setTimeout(mount, 0);
  return `<section class="clips" data-keep="clip-${esc(g.id)}" data-g="${esc(g.id)}" data-title="${esc(title)}" aria-label="${list.length} clips from this game"></section>`;
}

function stopPending() { pending = false; root.classList.remove('reels'); }
addEventListener('hashchange', () => {
  // A swipe while watching keeps watching on the next game; anything else leaves watching mode.
  if (root.classList.contains('reels') && (location.hash || '').startsWith('#/m/')) { pending = true; setTimeout(() => { if (pending) stopPending(); }, 2500); }
  else stopPending();
  for (const v of document.querySelectorAll('.clips video')) v.pause();
});

// On screen (half or more): play. Filling the screen: watching mode. Within a screen and a half: start loading.
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
  for (const e of es) {
    const p = e.target._p; if (!p) continue;
    if (e.intersectionRatio >= 0.5) p.show(); else p.hide();
    if (e.target.isConnected) root.classList.toggle('reels', e.intersectionRatio >= 0.9);
  }
}, { threshold: [0, 0.5, 0.9] }) : null;
const near = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting && e.target._p) { e.target._p.warm(); near.unobserve(e.target); }
}, { rootMargin: '150% 0px' }) : null;

function mount() {
  for (const box of document.querySelectorAll('.clips[data-g]:not([data-on])')) {
    box.dataset.on = '1';
    if (!box.classList.contains('none')) { box._p = player(box, box.dataset.g); io?.observe(box); near?.observe(box); }
    if (pending) { pending = false; root.classList.add('reels'); scrollTo({ top: box.getBoundingClientRect().top + scrollY, behavior: 'instant' }); box._p?.show(); }
  }
}

function player(box, id) {
  box.innerHTML = `<div class="cv"><video playsinline muted preload="auto"></video><video playsinline muted preload="auto" class="off"></video>
<div class="ctop"><div class="cbar" aria-hidden="true"></div><p class="cgame"><b>${esc(box.dataset.title || '')}</b><span>Clips</span></p></div>
<p class="ccap"><b></b><span></span></p>
<button class="cplay" hidden aria-label="Play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg></button>
<button class="csnd" aria-pressed="false" aria-label="Sound">${SPK}</button>
<button class="sr cprev">Previous clip</button><button class="sr cnext">Next clip</button></div>`;
  const cv = box.querySelector('.cv'), [A, B] = box.querySelectorAll('video');
  const bar = box.querySelector('.cbar'), cap = box.querySelector('.ccap'), playBtn = box.querySelector('.cplay');
  let v = A, spare = B, on = false, warmed = false, held = false, i = Math.max(0, Math.min(at.get(id) || 0, (lists.get(id) || []).length - 1));
  const list = () => lists.get(id) || [];
  // Muted play-then-pause makes iOS fetch the start of a clip it would otherwise leave alone.
  const prime = (el, c) => { if (!c || el.dataset.src === c.src) return; el.dataset.src = c.src; el.src = c.src; el.muted = true; el.play().then(() => { if (el !== v || !on) el.pause(); }).catch(() => {}); };
  const tryPlay = () => {
    v.muted = !sound;
    v.play().then(() => { playBtn.hidden = true; }).catch(() => {
      if (!v.muted) { v.muted = true; setSound(false); tryPlay(); return; } // sound needs a tap; play muted instead
      playBtn.hidden = false; // Low Power Mode: no autoplay, so show a play button
    });
  };
  function show(n, play) {
    const L = list(); if (!L.length) return;
    i = Math.max(0, Math.min(n, L.length - 1)); at.set(id, i);
    const c = L[i];
    if (spare.dataset.src === c.src) { [v, spare] = [spare, v]; v.currentTime = 0; } // the next clip is ready: swap
    else if (v.dataset.src !== c.src) { v.dataset.src = c.src; v.src = c.src; v.poster = c.poster; }
    else v.currentTime = 0;
    v.classList.remove('off'); spare.classList.add('off'); spare.pause();
    v.classList.toggle('wide', !c.tall);
    cap.querySelector('b').textContent = c.title;
    cap.querySelector('span').textContent = `${i + 1} of ${L.length} · via ESPN`;
    bar.innerHTML = L.map((_, j) => `<i class="${j < i ? 'done' : ''}"><b></b></i>`).join('');
    if (play) tryPlay();
    prime(spare, L[i + 1]); // and get the one after it ready
  }
  const next = () => { if (i < list().length - 1) show(i + 1, true); else { v.pause(); playBtn.hidden = false; } };
  for (const el of [A, B]) {
    el.addEventListener('timeupdate', () => { if (el !== v) return; const b = bar.children[i]?.firstChild; if (b && el.duration) b.style.width = `${(100 * el.currentTime) / el.duration}%`; });
    el.addEventListener('ended', () => { if (el === v) next(); });
  }
  // Tap: next clip, or the previous one on the left fifth. Hold: pause until you let go. Sideways drags
  // belong to swipe.js (a drag never makes a click).
  let holdT = 0;
  cv.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; held = false; holdT = setTimeout(() => { held = true; v.pause(); }, 250); });
  const release = () => { clearTimeout(holdT); if (held && on) tryPlay(); };
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', () => { clearTimeout(holdT); held = false; });
  cv.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (held) { held = false; return; }
    const r = cv.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 5) show(v.currentTime > 2 ? i : i - 1, true); else next();
  });
  box.querySelector('.cnext').addEventListener('click', next);
  box.querySelector('.cprev').addEventListener('click', () => show(i - 1, true));
  playBtn.addEventListener('click', () => { if (v.ended && i === list().length - 1) show(0, true); else tryPlay(); });
  function setSound(s) {
    sound = s;
    for (const x of document.querySelectorAll('.clips .csnd')) { x.setAttribute('aria-pressed', String(s)); x.innerHTML = s ? SPK_ON : SPK; }
  }
  box.querySelector('.csnd').addEventListener('click', () => { setSound(!sound); v.muted = !sound; if (on) tryPlay(); });
  show(i, false);
  return {
    warm() { if (warmed) return; warmed = true; prime(v, list()[i]); prime(spare, list()[i + 1]); },
    // One clip plays at a time: the one on screen. Off screen it pauses where it was.
    show() { this.warm(); if (on) return; on = true; for (const x of document.querySelectorAll('.clips video')) if (x !== v) x.pause(); tryPlay(); },
    hide() { on = false; v.pause(); },
  };
}

const SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
const SPK_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>';
