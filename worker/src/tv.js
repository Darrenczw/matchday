// "Where to watch" lines for the calendar notes. Same rules as the app's tv.js: Exact = listed for this
// game (ESPN, US), Likely = holds the rights this season (sourced rights table), never guessed.
import rights from '../../data/rights.json' with { type: 'json' };
import { MARKETS } from '../../js/names.js';

const london = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function blackout(r) {
  if (!r.path.endsWith('/eng.1') || !r.time_valid) return false;
  const p = Object.fromEntries(london.formatToParts(new Date(r.start_utc)).map((x) => [x.type, x.value]));
  return p.weekday === 'Sat' && p.hour === '15' && p.minute === '00';
}

// The first three markets in Darren's order, e.g. "UK: Sky Sports or TNT Sports (Likely)".
export function tvLines(r, markets = ['uk', 'us', 'sg']) {
  const league = r.path.split('/')[1];
  const usTV = JSON.parse(r.us_tv || '[]');
  return markets.slice(0, 3).map((m) => {
    const label = MARKETS[m] || m.toUpperCase();
    if (m === 'uk' && blackout(r)) return `${label}: not shown live (3pm blackout)`;
    if (m === 'us' && usTV.length) return `${label}: ${usTV.join(', ')} (Exact)`;
    const e = rights.entries?.[league]?.[m];
    return e ? `${label}: ${e.channels.join(' or ')} (Likely)` : `${label}: not listed`;
  });
}
