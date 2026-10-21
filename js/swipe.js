// Swipe between games on a match page (Darren, 22 Oct 2026): left for the next game, right for the previous,
// in the order of the list you opened it from, so reading the day's results feels like turning pages.
// The pager buttons in the match header do the same for VoiceOver and one-handed taps.

export const swipe = { replacing: false };
let list = [];

// Remember the games on the screen you tap a game from (My games, This week, a team or competition page).
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#/m/"]');
  if (!a || (location.hash || '').startsWith('#/m/')) return;
  list = [...new Set([...document.querySelectorAll('#view a[href^="#/m/"]')].map((x) => x.getAttribute('href')))];
}, true);

export function position(hash) {
  const i = list.indexOf(hash);
  return i < 0 || list.length < 2 ? null : { i, n: list.length, prev: list[i - 1], next: list[i + 1] };
}

const main = () => document.getElementById('view');
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Go to the next (+1) or previous (-1) game. The history entry is replaced, so Back still returns to the list.
export function swipeTo(dir) {
  const p = position(location.hash);
  const to = p && (dir > 0 ? p.next : p.prev);
  const m = main();
  if (!to) { if (m) bounce(m, dir); return; }
  const done = () => {
    swipe.replacing = true;
    location.replace(to);
    if (still()) { m.style.transform = ''; return; }
    m.style.transition = 'none';
    m.style.transform = `translateX(${dir > 0 ? 28 : -28}%)`;
    m.style.opacity = '0';
    setTimeout(() => { m.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s'; m.style.transform = ''; m.style.opacity = ''; }, 30);
  };
  if (still()) return done();
  m.style.transition = 'transform .16s ease-in, opacity .16s';
  m.style.transform = `translateX(${dir > 0 ? -40 : 40}%)`;
  m.style.opacity = '0';
  setTimeout(done, 160);
}
function bounce(m, dir) {
  if (still()) return;
  m.style.transition = 'transform .12s ease-out';
  m.style.transform = `translateX(${dir > 0 ? -16 : 16}px)`;
  setTimeout(() => { m.style.transform = ''; }, 120);
}

// The gesture: a sideways drag on a match page. Vertical scrolling and sideways-scrolling tables are left alone.
let t = null;
const NO = '.boxwrap, .chips, .seg, input, button, .tline';
document.addEventListener('touchstart', (e) => {
  t = null;
  if (!(location.hash || '').startsWith('#/m/') || e.touches.length !== 1 || e.target.closest(NO)) return;
  const p = e.touches[0];
  if (p.clientX < 20 || p.clientX > innerWidth - 20) return; // leave the screen edges to the system
  t = { x: p.clientX, y: p.clientY, at: Date.now(), dir: null };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!t) return;
  const p = e.touches[0], dx = p.clientX - t.x, dy = p.clientY - t.y;
  if (!t.dir) {
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) t.dir = 'x';
    else if (Math.abs(dy) > 12) { t = null; return; }
    else return;
  }
  e.preventDefault();
  const pos = position(location.hash), has = pos && (dx < 0 ? pos.next : pos.prev);
  const m = main();
  m.style.transition = 'none';
  m.style.transform = `translateX(${has ? dx : dx / 3}px)`;
  t.dx = dx;
}, { passive: false });
document.addEventListener('touchend', () => {
  if (!t || t.dir !== 'x') { t = null; return; }
  const dx = t.dx || 0, fast = Math.abs(dx) / Math.max(1, Date.now() - t.at) > 0.5;
  t = null;
  const m = main();
  if (Math.abs(dx) > 80 || (fast && Math.abs(dx) > 30)) swipeTo(dx < 0 ? 1 : -1);
  else { m.style.transition = 'transform .18s ease-out'; m.style.transform = ''; }
});
