// "Good for you" rules as plain functions, so the app and the calendar helper agree.
// prefs = { windows: [{ days, from, to, on }], rules: { overseas, streaming, playoffs } }. The helper stores
// prefs as { free: { mornings, evenings, late, windows }, rules }, so both places are read; the three old
// switches still work for a helper that hasn't been updated yet.
import { sg } from './util.js';

const STREAMERS = ['Netflix', 'Prime Video', 'YouTube', 'Disney+'];
const HOME_COUNTRIES = ['USA', 'United States', 'Canada'];

// ---------- Free-hour windows: days (0 = Sunday) plus a start and end time in SGT. A window that ends
// earlier than it starts runs past midnight, and belongs to the day it starts on ("Fri 23:00 to 03:00").
export const DEFAULT_WINDOWS = [
  { id: 'mornings', days: [1, 2, 3, 4, 5], from: '07:00', to: '10:30', on: true },
  { id: 'evenings', days: [0, 1, 2, 3, 4, 5, 6], from: '19:00', to: '01:00', on: true },
  { id: 'late', days: [5, 6], from: '23:00', to: '03:00', on: true },
];
const mins = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
export function inWindow(w, dow, t) {
  const a = mins(w.from), b = mins(w.to);
  if (a < b) return w.days.includes(dow) && t >= a && t < b;
  return (w.days.includes(dow) && t >= a) || (w.days.includes((dow + 6) % 7) && t < b);
}
// A name from the days and the start time, so nothing has to be typed: "Weekday morning", "Evening",
// "Weekend late night", "Sat, Sun afternoon".
const D3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function windowName(w) {
  const a = mins(w.from), d = [...w.days].sort((x, y) => x - y).join();
  const b = mins(w.to), long = (b > a ? b - a : b + 1440 - a) >= 5 * 60;
  const part = long && a >= 8 * 60 && a < 14 * 60 && b > a && b <= 20 * 60 ? 'daytime' : a < 5 * 60 ? 'late night' : a < 12 * 60 ? 'morning' : a < 14 * 60 ? 'lunch' : a < 18 * 60 ? 'afternoon' : a < 23 * 60 ? 'evening' : 'late night';
  const nights = a >= 18 * 60;
  const when = d === '0,1,2,3,4,5,6' ? '' : d === '1,2,3,4,5' ? 'Weekday' : d === '0,6' || (nights && d === '5,6') ? 'Weekend' : w.days.length ? [...w.days].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)).map((x) => D3[x]).join(', ') : 'No days';
  const s = when ? `${when} ${part}` : part;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// The old three switches, as windows, for prefs saved before custom windows.
const fromLegacy = (free = {}) => DEFAULT_WINDOWS.map((w) => ({ ...w, on: free[w.id] !== false }));
export const windowsOf = (prefs) => prefs.windows || prefs.free?.windows || fromLegacy(prefs.free);

// g: { timeValid, date, sport, country, usTV, postseason, note }
export function freeHourWith(g, prefs) {
  if (!g.timeValid) return null;
  const s = sg(g.date);
  const w = windowsOf(prefs).find((x) => x.on && inWindow(x, s.dow, s.mins));
  return w ? windowName(w) : null;
}
export function reasonsWith(g, prefs) {
  const out = [];
  const f = freeHourWith(g, prefs); if (f) out.push(f);
  if (prefs.rules.overseas && g.sport !== 'soccer' && g.country && !HOME_COUNTRIES.includes(g.country)) out.push(`Played in ${g.country}`);
  if (prefs.rules.streaming) { const s = (g.usTV || []).find((n) => STREAMERS.some((x) => n.includes(x))); if (s) out.push(`On ${s}`); }
  if (prefs.rules.playoffs && (g.postseason || /final|playoff/i.test(g.note || ''))) out.push('Playoffs');
  return out;
}
