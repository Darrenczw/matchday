// "Good for you" rules as plain functions, so the app and the calendar helper agree.
// prefs = { free: { mornings, evenings, late }, rules: { overseas, streaming, playoffs } }.
import { sg } from './util.js';

const STREAMERS = ['Netflix', 'Prime Video', 'YouTube', 'Disney+'];
const HOME_COUNTRIES = ['USA', 'United States', 'Canada'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// g: { timeValid, date, sport, country, usTV, postseason, note }
export function freeHourWith(g, prefs) {
  if (!g.timeValid) return null;
  const s = sg(g.date), t = s.mins, prev = DAYS[(s.dow + 6) % 7];
  if (prefs.free.mornings && s.dow >= 1 && s.dow <= 5 && t >= 7 * 60 && t < 10 * 60 + 30) return 'Weekday morning';
  if (prefs.free.evenings && t >= 19 * 60) return `${s.wdl} evening`;
  if (prefs.free.evenings && t < 60) return `${prev} night`;
  if (prefs.free.late && (s.dow === 6 || s.dow === 0) && t < 3 * 60) return `${prev} late night`;
  return null;
}
export function reasonsWith(g, prefs) {
  const out = [];
  const f = freeHourWith(g, prefs); if (f) out.push(f);
  if (prefs.rules.overseas && g.sport !== 'soccer' && g.country && !HOME_COUNTRIES.includes(g.country)) out.push(`Played in ${g.country}`);
  if (prefs.rules.streaming) { const s = (g.usTV || []).find((n) => STREAMERS.some((x) => n.includes(x))); if (s) out.push(`On ${s}`); }
  if (prefs.rules.playoffs && (g.postseason || /final|playoff/i.test(g.note || ''))) out.push('Playoffs');
  return out;
}
