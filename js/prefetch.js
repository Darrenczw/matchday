// Near-instant match pages (Darren, 22 Oct 2026). A game's details are fetched before they're needed:
// - when a finger lands on a game (the tap itself takes a little while to complete);
// - quietly, for the games on screen once a list settles, and for the next and previous games on a match page.
// Fetches land in the summary cache (espn.js), so opening the game then needs no network. Skipped in Low Data Mode.
import { summary } from './espn.js';

const at = new Map(); // game id -> when it was last prefetched
const quiet = () => navigator.connection?.saveData || document.hidden;

export function prefetch(hash) {
  const m = /^#\/m\/(\w+)\/([\w.]+)\/(\d+)$/.exec(hash || '');
  if (!m) return;
  const id = m[3];
  if (Date.now() - (at.get(id) || 0) < 55e3) return; // the summary cache keeps it for a minute
  at.set(id, Date.now());
  summary(`${m[1]}/${m[2]}`, id).catch(() => at.delete(id));
}

// Finger down on a game: start now.
document.addEventListener('pointerdown', (e) => {
  const a = e.target.closest?.('a[href^="#/m/"]');
  if (a) prefetch(a.getAttribute('href'));
}, { capture: true, passive: true });

// The games on screen (and just below), a few at a time, once the list has settled.
let timer = 0;
export function prefetchVisible(max = 6) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (quiet()) return;
    const links = [...document.querySelectorAll('#view a[href^="#/m/"]')].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight * 1.3;
    }).slice(0, max);
    links.forEach((a, i) => setTimeout(() => prefetch(a.getAttribute('href')), i * 250));
  }, 700);
}
