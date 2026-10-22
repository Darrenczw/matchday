// Small shared helpers: escaping, Singapore time, icons.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Singapore is UTC+8 all year (no daylight saving), so a fixed offset is exact.
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export function sg(d) {
  const x = new Date(new Date(d).getTime() + 8 * 3600e3);
  const h = x.getUTCHours(), m = x.getUTCMinutes();
  return {
    wd: WD[x.getUTCDay()], wdl: WDL[x.getUTCDay()], dow: x.getUTCDay(), d: x.getUTCDate(), mo: MO[x.getUTCMonth()],
    h, m, mins: h * 60 + m, hm: `${pad(h)}:${pad(m)}`, key: x.toISOString().slice(0, 10),
  };
}
export const todayKey = () => sg(Date.now()).key;
// A viewing night runs to 05:00 SGT: a 00:30 or 03:00 kick-off belongs with the evening before it, so lists
// group by night, not by calendar date (Darren, 21 Oct 2026). The row itself still shows the real day and time.
export const nightKey = (d) => sg(new Date(d).getTime() - 5 * 3600e3).key;
export const nightToday = () => nightKey(Date.now());
// "2026-10-21" → "21 Oct 2026", for dates written in sentences.
export const dateText = (key) => { const [y, m, d] = String(key).split('-').map(Number); return d ? `${d} ${MO[m - 1]} ${y}` : String(key); };
export function addDays(key, n) {
  const x = new Date(key + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
export const keyRange = (k0, k1) => { const out = []; for (let k = k0; k <= k1; k = addDays(k, 1)) out.push(k); return out; };
export const ymd = (key) => key.replaceAll('-', '');
export function keyLabel(key) {
  const t = nightToday();
  if (key === t) return 'Today';
  if (key === addDays(t, 1)) return 'Tomorrow';
  if (key === addDays(t, -1)) return 'Yesterday';
  const s = sg(key + 'T04:00:00Z'); // noon SGT on that day
  return `${s.wd} ${s.d} ${s.mo}`;
}
// The seam under a kick-off time. Rows sit under dated headers, so use the plain weekday (or date when
// more than a week out) rather than "Tonight", which clashes with a "Tomorrow" header for 03:00 games.
export function shortDay(d) {
  const s = sg(d), t = todayKey();
  return s.key > addDays(t, 7) ? `${s.d} ${s.mo}` : s.wd; // My games runs to today + 7
}

export function ago(ts) {
  if (!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  const d = Math.round(h / 24);
  return h < 24 ? `${h} h ago` : `${d} day${d > 1 ? 's' : ''} ago`;
}
export function countdown(d) {
  const mins = Math.round((new Date(d) - Date.now()) / 60e3);
  if (mins <= 0) return 'Starting now';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return `in ${h} h ${m} min`;
  if (h < 72) return `in ${Math.floor(h / 24)} day${h >= 48 ? 's' : ''} ${h % 24} h`;
  return `in ${Math.round(h / 24)} days`;
}

const ICON = {
  back: '<path d="M15 5l-7 7 7 7"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M9 14.5l2 2 4-4"/>',
  calplus: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5"/>',
  grip: '<path d="M9 7h.01M9 12h.01M9 17h.01M15 7h.01M15 12h.01M15 17h.01" stroke-width="3"/>',
  chev: '<path d="M9 5l7 7-7 7"/>', up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5h.01"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>', wifi: '<path d="M2 2l20 20M8.5 16.5a5 5 0 017 0M5 13a10 10 0 015.2-2.8M19 13a10 10 0 00-2.3-1.6M12 20h.01"/>',
};
export const icon = (k, cls = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICON[k]}</svg>`;
