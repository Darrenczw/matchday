// Picks and settings, kept on this phone (localStorage). "?demo" uses a separate practice copy,
// so sample picks never touch the real ones.

export const DEMO = /[?&]demo\b/.test(location.search);
const NS = DEMO ? 'md-demo:' : 'md:';

export function load(k, def) {
  try { const v = localStorage.getItem(NS + k); return v ? JSON.parse(v) : def; } catch { return def; }
}
export function save(k, v) {
  try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch { /* storage full or blocked: the app still works for this visit */ }
}

export { MARKETS } from './names.js';
import { windowsOf } from './rules.js';

const DEFAULTS = {
  markets: ['uk', 'us', 'ca', 'sg', 'my', 'hk', 'kr', 'mena'],
  theme: 'auto',
  free: { mornings: true, evenings: true, late: true },
  rules: { overseas: true, streaming: true, playoffs: true, big: true, near: true },
  suggest: { nfl: true, nba: true, soccer: true },
};
const saved = load('settings', {});
export const settings = {
  ...DEFAULTS, ...saved,
  free: { ...DEFAULTS.free, ...saved.free }, rules: { ...DEFAULTS.rules, ...saved.rules }, suggest: { ...DEFAULTS.suggest, ...saved.suggest },
};
// Free-hour windows Darren edits himself (22 Oct 2026). Saved settings from before start from the old three switches.
settings.windows = saved.windows || windowsOf({ free: settings.free });

// Sample picks for the practice copy only. Labelled "Sample picks" on screen.
const SAMPLE = {
  comps: [{ path: 'soccer/eng.1', name: 'Premier League', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' }],
  teams: [
    { path: 'soccer/eng.1', id: '359', name: 'Arsenal', abbr: 'ARS', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png' },
    { path: 'basketball/nba', id: '25', name: 'Oklahoma City Thunder', abbr: 'OKC', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/okc.png' },
    { path: 'football/nfl', id: '3', name: 'Chicago Bears', abbr: 'CHI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png' },
  ],
  games: [],
};
export const picks = load('picks', DEMO ? SAMPLE : { comps: [], teams: [], games: [] });

const subs = new Set();
export const on = (fn) => (subs.add(fn), () => subs.delete(fn));
export const emit = (why) => subs.forEach((fn) => fn(why));

export const sportOf = (path) => path.split('/')[0];
export const compKey = (path) => path;
export const teamKey = (path, id) => `${sportOf(path)}:${id}`;

export function following(kind, key) {
  if (kind === 'comp') return picks.comps.some((c) => c.path === key);
  if (kind === 'team') return picks.teams.some((t) => teamKey(t.path, t.id) === key);
  return picks.games.some((g) => g.id === key);
}
export const followingAny = () => picks.comps.length + picks.teams.length + picks.games.length > 0;

export function follow(kind, item) {
  const list = picks[kind + 's'];
  if (kind === 'comp' && following('comp', item.path)) return;
  if (kind === 'team' && following('team', teamKey(item.path, item.id))) return;
  if (kind === 'game' && following('game', item.id)) return;
  list.push(item);
  save('picks', picks); emit('picks');
}
// Returns a function that puts the item back (for "Undo").
export function unfollow(kind, key) {
  const list = picks[kind + 's'];
  const i = list.findIndex((x) => (kind === 'comp' ? x.path : kind === 'team' ? teamKey(x.path, x.id) : x.id) === key);
  if (i < 0) return null;
  const [item] = list.splice(i, 1);
  save('picks', picks); emit('picks');
  const undo = () => { list.splice(Math.min(i, list.length), 0, item); save('picks', picks); emit('picks'); };
  undo.item = item;
  return undo;
}
export function clearPicks() {
  picks.comps = []; picks.teams = []; picks.games = [];
  save('picks', picks); emit('picks');
}

export function set(path, value) {
  const keys = path.split('.'); let o = settings;
  while (keys.length > 1) o = o[keys.shift()];
  o[keys[0]] = value;
  save('settings', settings); emit('settings');
}
