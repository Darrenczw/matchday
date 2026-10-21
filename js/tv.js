// Where to watch, per market. Exact = listed for this game. Likely = rights holder this season (rights table,
// every entry sourced). Not listed = said plainly, never guessed (PRD 7.3).
import { settings, MARKETS } from './store.js';

let rights = null;
export const rightsReady = fetch('data/rights.json').then((r) => r.json()).then((d) => { rights = d; return d; }).catch(() => null);
export const rightsChecked = () => rights?.checked;

const ukTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// Premier League games kicking off 15:00 on a Saturday, UK time, are never shown live in the UK.
export function blackout(g) {
  if (g.league !== 'eng.1' || !g.timeValid) return false;
  const p = Object.fromEntries(ukTime.formatToParts(new Date(g.date)).map((x) => [x.type, x.value]));
  return p.weekday === 'Sat' && p.hour === '15' && p.minute === '00';
}

export function market(g, m) {
  const label = MARKETS[m];
  if (m === 'uk' && blackout(g)) return { m, label, channels: ['Not shown live'], kind: 'exact', note: 'Saturday 3pm blackout in the UK' };
  if (m === 'us' && g.usTV.length) return { m, label, channels: g.usTV, kind: 'exact', note: 'Listed for this game (ESPN)' };
  const r = rights?.entries?.[g.league]?.[m]; // keyed by slug: eng.1, nfl, nba ...
  if (r) return { m, label, channels: r.channels, kind: 'likely', note: `Holds the rights ${r.seasons ? `(${r.seasons})` : 'this season'}`, source: r.source };
  return { m, label, channels: [], kind: 'none' };
}
export const allMarkets = (g) => settings.markets.map((m) => market(g, m));
export const mainMarket = (g) => market(g, settings.markets[0]);
// One-line TV for game rows and cards: "Sky Sports · 1 more", "3pm blackout" or "Not listed".
export function tvShort(x, more = true) {
  if (x.kind === 'none') return 'Not listed';
  if (x.channels[0] === 'Not shown live') return '3pm blackout';
  return x.channels[0] + (more && x.channels.length > 1 ? ` · ${x.channels.length - 1} more` : '');
}
// Every channel, written one way everywhere a full list shows: "Sky Sports, Channel 5 and DAZN".
const LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });
export const chanList = (channels) => LIST.format(channels);
export const KIND = { exact: 'Exact', likely: 'Likely', none: 'Not listed' };
