// Real away and third kit colours for football clubs, read from the club's Wikipedia info box
// (body1 = home, body2 = away, body3 = third). Looked up only when a clash needs them; kept for 7 days.
import { load, save, emit } from './store.js';

const WEEK = 7 * 864e5;
const cache = load('kits', {});
const busy = new Set();
const W = 'https://en.wikipedia.org/w/api.php?format=json&origin=*';
const hexOf = (s) => (s && /^[0-9a-f]{6}$/i.test(s.trim()) ? '#' + s.trim().toLowerCase() : null);

async function lookup(team) {
  const q = `${team.name} football club`;
  const s = await fetch(`${W}&action=query&list=search&srlimit=3&srsearch=${encodeURIComponent(q)}`).then((r) => r.json());
  const words = team.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  for (const hit of s.query?.search || []) {
    if (!words.some((w) => hit.title.toLowerCase().includes(w))) continue;
    const p = await fetch(`${W}&action=parse&prop=wikitext&section=0&page=${encodeURIComponent(hit.title)}`).then((r) => r.json());
    const text = p.parse?.wikitext?.['*'] || '';
    const body = (n) => hexOf((text.match(new RegExp(`\\|\\s*body${n}\\s*=\\s*([^\\n|}]*)`)) || [])[1]);
    if (body(1) || body(2)) return { home: body(1), away: body(2), third: body(3), page: hit.title, t: Date.now() };
  }
  return { t: Date.now() };
}

// Returns what's known now; starts a lookup in the background if needed, then redraws.
export function awayKit(team) {
  const k = cache[team.id];
  if (k && Date.now() - k.t < WEEK) return k;
  if (!busy.has(team.id) && team.name) {
    busy.add(team.id);
    lookup(team)
      .then((v) => { cache[team.id] = v; save('kits', cache); if (v.away || v.third) emit('kits'); })
      .catch(() => {})
      .finally(() => busy.delete(team.id));
  }
  return k || null;
}
