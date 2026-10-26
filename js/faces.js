// Football player faces (TECH-DESIGN 15): ESPN has headshots for about 5% of football players, so the calendar
// helper collects TheSportsDB cut-outs and Wikipedia photos (worker/src/faces.js). The players on screen are asked
// for in one request a moment after the screen draws; answers are kept on the phone and the screen redraws.
// Cut-outs are kept 30 days; Wikipedia photos and "none yet" 2 days, so a cut-out found later replaces them.
import { CAL_API } from './cal.js';
import { load, save, emit } from './store.js';

const DAY = 864e5, TTL = { cut: 30 * DAY, wiki: 2 * DAY, none: 2 * DAY }, MAX = 3000, BATCH = 80;
const memo = load('faces', {}); // ESPN athlete id → { u: photo URL or '', k: 'cut' | 'wiki' | 'none', t: when asked }
const queue = new Map(), asked = new Set(); // asked: once per visit, so a failing helper isn't asked again and again
let timer = 0;

// The photo for a football player ({ u, k }), or null. Unknown or old answers are asked for in the background.
export function photo(a, team) {
  const id = a?.id && String(a.id), m = id ? memo[id] : null;
  if (!id || !CAL_API) return null;
  if ((!m || Date.now() - m.t > TTL[m.k]) && !asked.has(id) && a.displayName) {
    queue.set(id, { id, name: a.displayName, team: team || '' });
    clearTimeout(timer); timer = setTimeout(flush, 150);
  }
  return m?.u ? m : null;
}

async function flush() {
  const list = [...queue.values()].slice(0, BATCH);
  for (const p of list) { queue.delete(p.id); asked.add(p.id); }
  if (queue.size) timer = setTimeout(flush, 150);
  if (!list.length) return;
  try {
    const r = await fetch(`${CAL_API}/api/faces`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ players: list }) });
    if (!r.ok) return;
    const got = (await r.json()).faces || {}, now = Date.now();
    let changed = false;
    for (const p of list) {
      const f = got[p.id], next = f ? { u: f.u, k: f.k, t: now } : { u: '', k: 'none', t: now };
      if (memo[p.id]?.u !== next.u) changed = true;
      memo[p.id] = next;
    }
    const ids = Object.keys(memo);
    if (ids.length > MAX) for (const id of ids.sort((x, y) => memo[x].t - memo[y].t).slice(0, ids.length - MAX)) delete memo[id];
    save('faces', memo);
    if (changed) emit('faces');
  } catch { /* offline or the helper is down: numbers stay, asked again next visit */ }
}
