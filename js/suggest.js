// "Good for you": games that fit Darren's free hours in SGT, are played overseas, are on a streamer,
// or are playoffs. A helper only: nothing is followed without his tap (PRD 7.8).
import { sg } from './util.js';
import { settings } from './store.js';

const STREAMERS = ['Netflix', 'Prime Video', 'YouTube', 'Disney+'];
const HOME_COUNTRIES = ['USA', 'United States', 'Canada'];

export function freeHour(g) {
  if (!g.timeValid) return null;
  const s = sg(g.date), t = s.mins, prev = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][(s.dow + 6) % 7];
  if (settings.free.mornings && s.dow >= 1 && s.dow <= 5 && t >= 7 * 60 && t < 10 * 60 + 30) return 'Weekday morning';
  if (settings.free.evenings && t >= 19 * 60) return `${s.wdl} evening`;
  if (settings.free.evenings && t < 60) return `${prev} night`;
  if (settings.free.late && (s.dow === 6 || s.dow === 0) && t < 3 * 60) return `${prev} late night`;
  return null;
}
export function reasons(g) {
  const out = [];
  const f = freeHour(g); if (f) out.push(f);
  if (settings.rules.overseas && g.sport !== 'soccer' && g.country && !HOME_COUNTRIES.includes(g.country)) out.push(`Played in ${g.country}`);
  if (settings.rules.streaming) { const s = g.usTV.find((n) => STREAMERS.some((x) => n.includes(x))); if (s) out.push(`On ${s}`); }
  if (settings.rules.playoffs && (g.postseason || /final|playoff/i.test(g.note))) out.push('Playoffs');
  return out;
}
export const FREE_WINDOWS = [
  { key: 'mornings', label: 'Weekday mornings', sub: 'Mon to Fri, 07:00 to 10:30' },
  { key: 'evenings', label: 'Evenings', sub: 'Every day, 19:00 to 01:00' },
  { key: 'late', label: 'Weekend late nights', sub: 'Fri and Sat nights, to 03:00' },
];
