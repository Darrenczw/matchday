// Clips on match pages, Stories-style (R7, Darren 22 Oct 2026). NBA first: ESPN's game summary lists 6–19 short
// play clips per game, live too, each with a real 9:16 stream. Plays muted when the player is on screen, one
// clip after another; tap the right side for the next clip, the left for the previous one. Swiping sideways
// still turns to the next game (swipe.js), whose page has its own clips.
// The player lives outside the 5 s redraw: the page draws an empty box with data-keep, app.js's morph() leaves
// it alone, and this module builds the player inside it once.
import { esc, icon } from './util.js';

export const CLIPS = new Set(['basketball']);
const lists = new Map(); // game id -> clips, refreshed on every draw (live games gain clips)
const at = new Map(); // game id -> the clip you're on
let sound = false;
// iPhone plays HLS itself, so it gets the small vertical stream (about 1–4 MB a clip). Desktop browsers
// can't, so they get the plain MP4, which is far bigger: fine for testing on the Mac.
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

// The box the page draws. Kits paint the sides, so the clip stands between the two teams.
export function clipBox(g, d, k) {
  if (!CLIPS.has(g.sport)) return '';
  const list = clipList(d);
  if (!list.length) return '';
  lists.set(g.id, list);
  setTimeout(mount, 0);
  return `<section class="clips" data-keep="clip-${esc(g.id)}" data-g="${esc(g.id)}" style="--l:${k.left.bg};--r:${k.right.bg}" aria-label="${list.length} clips from this game"></section>`;
}

const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
  for (const e of es) { const p = e.target._p; if (p) (e.isIntersecting ? p.show() : p.hide()); }
}, { threshold: 0.6 }) : null;

function mount() {
  for (const box of document.querySelectorAll('.clips[data-g]:not([data-on])')) {
    box.dataset.on = '1';
    box._p = player(box, box.dataset.g);
    io?.observe(box);
  }
}

function player(box, id) {
  box.innerHTML = `<div class="cv"><video playsinline muted preload="none"></video>
<div class="cbar" aria-hidden="true"></div>
<button class="cprev" aria-label="Previous clip"></button><button class="cnext" aria-label="Next clip"></button>
<button class="cplay" hidden aria-label="Play">${icon('chev')}</button>
<button class="csnd" aria-pressed="false" aria-label="Sound">${SPK}</button></div>
<p class="ccap"><b></b><span></span></p>`;
  const v = box.querySelector('video'), bar = box.querySelector('.cbar'), cap = box.querySelector('.ccap');
  const playBtn = box.querySelector('.cplay'), snd = box.querySelector('.csnd');
  let on = false, i = Math.min(at.get(id) || 0, (lists.get(id) || []).length - 1);
  const list = () => lists.get(id) || [];
  const tryPlay = () => { v.muted = !sound; v.play().then(() => { playBtn.hidden = true; }).catch(() => { playBtn.hidden = false; }); };
  function load(n, play) {
    const L = list(); if (!L.length) return;
    i = (n + L.length) % L.length; at.set(id, i);
    const c = L[i];
    v.poster = c.poster; v.src = c.src; v.classList.toggle('wide', !c.tall);
    cap.querySelector('b').textContent = c.title;
    cap.querySelector('span').textContent = `${i + 1} of ${L.length} · via ESPN`;
    bar.innerHTML = L.map((_, j) => `<i class="${j < i ? 'done' : ''}"><b></b></i>`).join('');
    if (play) tryPlay();
  }
  v.addEventListener('timeupdate', () => { const b = bar.children[i]?.firstChild; if (b && v.duration) b.style.width = `${(100 * v.currentTime) / v.duration}%`; });
  v.addEventListener('ended', () => { if (i < list().length - 1) load(i + 1, on); else playBtn.hidden = false; });
  box.querySelector('.cnext').addEventListener('click', () => load(i + 1, true));
  box.querySelector('.cprev').addEventListener('click', () => load(v.currentTime > 2 ? i : i - 1, true));
  playBtn.addEventListener('click', () => { if (v.ended && i === list().length - 1) load(0, true); else tryPlay(); });
  snd.addEventListener('click', () => {
    sound = !sound;
    for (const x of document.querySelectorAll('.clips video')) x.muted = !sound;
    for (const x of document.querySelectorAll('.clips .csnd')) { x.setAttribute('aria-pressed', String(sound)); x.innerHTML = sound ? SPK_ON : SPK; }
    if (sound && v.paused && on) tryPlay();
  });
  load(i, false);
  return {
    // One clip plays at a time: the one on screen. Off screen it pauses where it was.
    show() { on = true; for (const x of document.querySelectorAll('.clips video')) if (x !== v) x.pause(); tryPlay(); },
    hide() { on = false; v.pause(); },
  };
}

const SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
const SPK_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>';
