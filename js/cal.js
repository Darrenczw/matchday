// The Calendar layer: what goes on the iPhone, separate from what the app follows (Darren, 21 Oct 2026).
// Kept on the phone and copied to the calendar helper (Cloudflare Worker) on every change.
import { load, save, emit, on, settings, sportOf, teamKey, DEMO, picks } from './store.js';

// Where the helper lives. Local tests use `wrangler dev`; the practice copy (?demo) uses the practice helper.
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const LIVE = 'https://matchday-cal.darren-chow-1.workers.dev', PRACTICE = 'https://matchday-cal-test.darren-chow-1.workers.dev';
// "?api=test" points a local preview at the practice helper on Cloudflare (testing the real path from the Mac).
export const CAL_API = /[?&]api=test\b/.test(location.search) ? PRACTICE : LOCAL ? 'http://127.0.0.1:8788' : DEMO ? PRACTICE : LIVE;

export const cal = load('cal', { comps: [], teams: [], games: [] });
export const calCfg = load('calcfg', { editKey: null, feedUrl: null });
const keyOf = (kind, x) => (kind === 'comp' ? x.path : kind === 'team' ? teamKey(x.path, x.id) : x.id);

export const inCal = (kind, key) => cal[kind + 's'].some((x) => keyOf(kind, x) === key);
export const calAny = () => cal.comps.length + cal.teams.length + cal.games.length > 0;
// Is this game covered by a calendar team, league or single-game pick?
export const gameInCal = (g) => cal.comps.some((c) => c.path === g.path)
  || cal.teams.some((t) => sportOf(t.path) === g.sport && (t.id === g.home.id || t.id === g.away.id))
  || cal.games.some((x) => x.id === g.id);

export function addCal(kind, item) {
  if (inCal(kind, keyOf(kind, item))) return;
  cal[kind + 's'].push(item);
  save('cal', cal); emit('cal'); push();
}
export function removeCal(kind, key) {
  const list = cal[kind + 's'], i = list.findIndex((x) => keyOf(kind, x) === key);
  if (i < 0) return null;
  const [item] = list.splice(i, 1);
  save('cal', cal); emit('cal'); push();
  const undo = () => { list.splice(Math.min(i, list.length), 0, item); save('cal', cal); emit('cal'); push(); };
  undo.item = item;
  return undo;
}

// ---------- Talking to the helper
const ready = () => !!(CAL_API && calCfg.editKey);
// What a helper failure means for Darren, in plain words, with what to do. Never the raw error text.
export function calError(err) {
  const m = String(err?.message || err || '');
  if (/Not allowed|401/.test(m)) return 'The calendar helper no longer accepts this phone, so changes aren’t reaching your calendar. Ask Claude to reset the calendar helper, then set it up again.';
  if (/Already set up|409/.test(m)) return 'The calendar is already set up on another phone or browser. Ask Claude to reset it if that wasn’t you.';
  if (/fetch|network|Load failed|TypeError/i.test(m) || err?.name === 'TypeError') return 'Couldn’t reach the calendar helper. Check your connection.';
  return 'The calendar helper had a problem.';
}
async function api(path, opts = {}) {
  const r = await fetch(CAL_API + path, { ...opts, headers: { 'content-type': 'application/json', ...(calCfg.editKey ? { authorization: `Bearer ${calCfg.editKey}` } : {}), ...opts.headers } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Calendar helper ${r.status}`);
  return r.json();
}
// Send the calendar picks, the Follow picks (the helper tracks them as the app's backup, TECH-DESIGN 14), TV market
// order and "Good for you" rules (debounced: several taps, one upload).
let pushTimer = 0;
// The three old switches, for a calendar helper that doesn't read custom windows yet.
const legacy = () => Object.fromEntries(['mornings', 'evenings', 'late'].map((k) => [k, !!settings.windows.find((w) => w.id === k)?.on]));
export const syncState = { pushing: false, lastPush: load('calpush', 0), error: null };
export function push() {
  if (!ready()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    syncState.pushing = true; emit('calsync');
    try {
      await api('/api/picks', { method: 'PUT', body: JSON.stringify({ cal, follow: { comps: picks.comps, teams: picks.teams, games: picks.games }, markets: settings.markets, prefs: { free: { ...legacy(), windows: settings.windows }, rules: settings.rules } }) });
      syncState.lastPush = Date.now(); save('calpush', syncState.lastPush); syncState.error = null;
    } catch (e) { syncState.error = calError(e); }
    syncState.pushing = false; emit('calsync');
  }, 600);
}
on((why) => { if (why === 'settings' || why === 'picks') push(); }); // 'picks' = a follow, unfollow or undo

// One-time set-up: the helper hands out the edit key (kept here) and the feed link.
export async function setUp() {
  const r = await api('/api/claim', { method: 'POST' });
  calCfg.editKey = r.editKey; calCfg.feedUrl = r.feedUrl;
  save('calcfg', calCfg); emit('cal'); push();
}
export const status = () => (ready() ? api('/api/status') : Promise.resolve(null));
// The app's backup when ESPN isn't answering: followed and calendar games from the helper, in norm() shape.
export const backupGames = (from, to) => (ready() ? api(`/api/games?from=${from}&to=${to}`) : Promise.resolve(null));
export async function newLink() {
  const r = await api('/api/rotate', { method: 'POST' });
  calCfg.feedUrl = r.feedUrl; save('calcfg', calCfg); emit('cal');
}
export const webcal = (url) => url.replace(/^https?:/, 'webcal:');
export { ready as calReady };
