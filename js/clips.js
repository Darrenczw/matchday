// Clips on match pages, like Instagram Stories (R7, Darren 22 Oct 2026). NBA first: ESPN's game summary lists
// 6–19 short play clips per game, live too, each with a real 9:16 stream.
// - They sit at the very bottom of the match page: read the stats, then scroll down into watching. The player
//   fills the screen and the tab bar slides away ("reels" mode).
// - Tap the right side for the next clip, the left for the previous one, the middle to pause; swipe sideways
//   for the next game (swipe.js).
//   A swipe made while watching opens the next game straight in its clips.
// - Fast: three video slots. While one plays, the other two already hold the next clips, so a tap swaps at once.
//   The first three clips get ready while you read the stats above them.
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

// On screen (half or more): play. Filling the screen: watching mode.
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
  for (const e of es) {
    const p = e.target._p; if (!p) continue;
    if (e.intersectionRatio >= 0.5) p.show(); else p.hide();
    if (e.target.isConnected) root.classList.toggle('reels', e.intersectionRatio >= 0.9);
  }
}, { threshold: [0, 0.5, 0.9] }) : null;

function mount() {
  for (const box of document.querySelectorAll('.clips[data-g]:not([data-on])')) {
    box.dataset.on = '1';
    if (!box.classList.contains('none')) { box._p = player(box, box.dataset.g); io?.observe(box); setTimeout(() => box.isConnected && box._p.warm(), 1500); }
    if (pending) { pending = false; root.classList.add('reels'); scrollTo({ top: box.getBoundingClientRect().top + scrollY, behavior: 'instant' }); box._p?.show(); }
  }
}

function player(box, id) {
  box.innerHTML = `<div class="cv"><video playsinline muted preload="auto"></video><video playsinline muted preload="auto" class="off"></video><video playsinline muted preload="auto" class="off"></video>
<div class="ctop"><div class="cbar" aria-hidden="true"></div><p class="cgame"><b>${esc(box.dataset.title || '')}</b><span>Clips</span></p></div>
<p class="ccap"><b></b><span></span></p>
<span class="cflash" aria-hidden="true"></span>
<button class="cplay" hidden aria-label="Play">${PLAY}</button>
<button class="csnd" aria-pressed="false" aria-label="Sound">${SPK}</button>
<button class="sr cprev">Previous clip</button><button class="sr ctoggle">Pause or play</button><button class="sr cnext">Next clip</button></div>`;
  const cv = box.querySelector('.cv'), slots = [...box.querySelectorAll('video')];
  const bar = box.querySelector('.cbar'), cap = box.querySelector('.ccap'), playBtn = box.querySelector('.cplay'), flash = box.querySelector('.cflash');
  let v = slots[0], on = false, warmed = false, held = false, paused = false, i = Math.max(0, Math.min(at.get(id) || 0, (lists.get(id) || []).length - 1));
  const list = () => lists.get(id) || [];
  // Get a clip ready in a spare slot: iOS fetches nothing for a video that never plays, so play it muted
  // and hidden until its first frame is up, then stop it there. A tap then only has to show it.
  const ready = (c, keep) => {
    if (!c) return null;
    let el = slots.find((x) => x.dataset.src === c.src);
    if (el) return el;
    el = slots.find((x) => x !== v && !keep.some((k) => k && x.dataset.src === k.src)) || slots.find((x) => x !== v);
    el.dataset.src = c.src; el.src = c.src; el.muted = true; el.dataset.ok = '';
    const stop = () => { el.removeEventListener('playing', stop); el.dataset.ok = '1'; if (el !== v || !on || paused) el.pause(); };
    el.addEventListener('playing', stop);
    el.play().catch(() => {});
    return el;
  };
  const tryPlay = () => {
    paused = false;
    v.muted = !sound;
    v.play().then(() => { playBtn.hidden = true; }).catch(() => {
      if (!v.muted) { v.muted = true; setSound(false); tryPlay(); return; } // sound needs a tap; play muted instead
      playBtn.hidden = false; // Low Power Mode: no autoplay, so show a play button
    });
  };
  function show(n, play) {
    const L = list(); if (!L.length) return;
    i = Math.max(0, Math.min(n, L.length - 1)); at.set(id, i);
    const c = L[i], keep = [L[i + 1], L[i + 2]];
    const el = ready(c, keep);
    if (el !== v) { v.pause(); v = el; }
    if (v.currentTime > 0.6) v.currentTime = 0; // a primed clip stopped on its first frame: no seek, no wait
    for (const x of slots) x.classList.toggle('off', x !== v);
    v.classList.toggle('wide', !c.tall);
    cap.querySelector('b').textContent = c.title;
    cap.querySelector('span').textContent = `${i + 1} of ${L.length} · via ESPN`;
    bar.innerHTML = L.map((_, j) => `<i class="${j < i ? 'done' : ''}"><b></b></i>`).join('');
    if (play) tryPlay();
    for (const k of keep) ready(k, [c, ...keep]); // and the next two after it
  }
  const next = () => { if (i < list().length - 1) show(i + 1, true); else { v.pause(); playBtn.hidden = false; } };
  const toggle = () => {
    if (v.paused) { tryPlay(); flashIt(PLAY); } else { v.pause(); paused = true; flashIt(PAUSE); }
  };
  function flashIt(svg) { flash.innerHTML = svg; flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); }
  for (const el of slots) {
    el.addEventListener('timeupdate', () => { if (el !== v) return; const b = bar.children[i]?.firstChild; if (b && el.duration) b.style.width = `${(100 * el.currentTime) / el.duration}%`; });
    el.addEventListener('ended', () => { if (el === v) next(); });
  }
  // Tap the left quarter: previous clip. The right quarter: next. The middle: pause or play. Hold anywhere:
  // pause until you let go. Sideways drags belong to swipe.js (a drag never makes a click).
  let holdT = 0;
  cv.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; held = false; holdT = setTimeout(() => { held = true; v.pause(); }, 300); });
  const release = () => { clearTimeout(holdT); if (held && on && !paused) tryPlay(); };
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', () => { clearTimeout(holdT); held = false; });
  cv.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (held) { held = false; return; }
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x < 0.25) show(v.currentTime > 2 ? i : i - 1, true);
    else if (x > 0.75) next();
    else toggle();
  });
  box.querySelector('.cnext').addEventListener('click', next);
  box.querySelector('.cprev').addEventListener('click', () => show(i - 1, true));
  box.querySelector('.ctoggle').addEventListener('click', toggle);
  playBtn.addEventListener('click', () => { if (v.ended && i === list().length - 1) show(0, true); else tryPlay(); });
  function setSound(s) {
    sound = s;
    for (const x of document.querySelectorAll('.clips .csnd')) { x.setAttribute('aria-pressed', String(s)); x.innerHTML = s ? SPK_ON : SPK; }
  }
  box.querySelector('.csnd').addEventListener('click', () => { setSound(!sound); v.muted = !sound; if (on && !paused) tryPlay(); });
  return {
    // The page opens: start getting the first three clips ready, so the first one is there when you arrive.
    warm() { if (warmed) return; warmed = true; show(i, false); },
    // One clip plays at a time: the one on screen. Off screen it pauses where it was.
    show() { this.warm(); if (on) return; on = true; for (const x of document.querySelectorAll('.clips video')) if (!slots.includes(x)) x.pause(); if (!paused) tryPlay(); },
    hide() { on = false; v.pause(); },
  };
}

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z"/></svg>';
const SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
const SPK_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>';
