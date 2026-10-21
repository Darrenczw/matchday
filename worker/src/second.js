// Second source: TheSportsDB (free key). Each calendar game within 14 days is checked once a day (every 3 hours
// while the two disagree), and once more inside the last 3 hours. If its time is more than 5 minutes from ESPN's,
// the game is "Time unconfirmed" (ESPN's time is still shown) until they agree. TECH-DESIGN sections 3, 4 and 13.
const TSDB = 'https://www.thesportsdb.com/api/v1/json/123';
const UA = { 'user-agent': 'Mozilla/5.0 (Matchday personal app)' };
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const SECOND_BUDGET = 3; // TheSportsDB calls per run, 3 s apart (free key: 30 a minute)
export const AGREE_MS = 5 * MIN;
const SPORT = { soccer: 'Soccer', football: 'American Football', basketball: 'Basketball' };

// ESPN name → TheSportsDB name, where even the short name (below) differs. Found from a week of real games
// (21 Oct 2026); a game that still doesn't match is left "not listed", never guessed.
export const ALIAS = {
  'LA Clippers': 'Los Angeles Clippers',
  'FC Cologne': 'Köln',
  'Internazionale': 'Inter Milan',
  'Athletic Club': 'Athletic Bilbao',
  'Alavés': 'Deportivo Alavés',
  'Deportivo': 'Deportivo de A Coruña',
  'Racing Santander': 'Racing de Santander',
};

// For comparing names: no accents, case, punctuation, numbers or club prefixes and suffixes ("VfB Stuttgart",
// "1. FC Union Berlin", "SC Paderborn 07" and "AS Roma" become "stuttgart", "union berlin", "paderborn", "roma").
const CLUB = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'as', 'ss', 'ssc', 'us', 'vfb', 'vfl', 'tsg', 'sv', 'bsc', 'rcd', 'cd', 'ud', 'sd', 'club', 'de', 'the']);
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !CLUB.has(w) && !/^\d+$/.test(w)).join(' ');
// Words that make a different team with the same club name: never matched loosely.
const OTHER = /\b(women|w|ladies|femenino|feminin|frauen|u\d\d|ii|b|reserves|youth|academy)\b/;
// Same team? Equal after norm(), or one name is the other plus a place ("Athletic" and "Athletic Bilbao"),
// unless the extra words mark another team (women's, youth, B team).
export function sameTeam(a, b) {
  const x = norm(ALIAS[a] || a), y = norm(ALIAS[b] || b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  const sw = short.split(' '), lw = long.split(' ');
  if (!sw.every((w) => lw.includes(w))) return false;
  return !OTHER.test(lw.filter((w) => !sw.includes(w)).join(' '));
}
// For the search query, spaces as underscores. TheSportsDB mostly uses short club names ("Stuttgart", "Roma"),
// so short() drops the prefixes and numbers that norm() ignores: "1. FC Union Berlin" → "Union Berlin".
export const short = (s) => s.split(/\s+/).filter((w) => norm(w)).join(' ');
export const tsdbName = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/\s+/g, '_');
// The searches to try, in order: TheSportsDB's name (alias, else ESPN's), then the short names, then the other way round.
export function searches(r) {
  const n = (x) => ALIAS[x] || x;
  const h = n(r.home_full), a = n(r.away_full);
  return [...new Set([[h, a], [short(h), short(a)], [a, h]].map(([x, y]) => `${tsdbName(x)}_vs_${tsdbName(y)}`))];
}

// Is a game due a second-source check? Only timed, scheduled games within 14 days: further out, kick-off
// times are still placeholders on both sources.
export function secondDue(r, now) {
  if (!r.time_valid || r.status !== 'scheduled') return false;
  const until = r.start_utc - now;
  if (until <= 0 || until > 14 * DAY) return false;
  const last = r.second_checked_at || 0;
  if (until <= 3 * HOUR) return last < r.start_utc - 3 * HOUR; // once inside the last 3 hours
  return now - last >= (r.unconfirmed ? 3 * HOUR : DAY); // a disagreement is looked at again sooner, so it clears sooner
}

// TheSportsDB's kick-off for one of its events, or null when it has no real time.
export function tsdbStart(ev, espnStart) {
  if (!ev?.strTimestamp && !(ev?.dateEvent && ev?.strTime)) return null;
  const ms = Date.parse((ev.strTimestamp || `${ev.dateEvent}T${ev.strTime}`).replace(/(\+00:00|Z)?$/, 'Z'));
  if (!Number.isFinite(ms)) return null;
  // "00:00:00" is often TheSportsDB's "time not set". Trust it only when ESPN also says midnight UTC.
  if (/T00:00:00/.test(new Date(ms).toISOString()) && Math.abs(ms - espnStart) > AGREE_MS) return null;
  return ms;
}

// Does a TheSportsDB event match this game? Same sport, same two teams (either way round), within 36 hours.
export function sameGame(ev, r) {
  if (!ev || (SPORT[r.sport] && ev.strSport && ev.strSport !== SPORT[r.sport])) return false;
  const h = r.home_full, a = r.away_full, eh = ev.strHomeTeam, ea = ev.strAwayTeam;
  if (!((sameTeam(eh, h) && sameTeam(ea, a)) || (sameTeam(eh, a) && sameTeam(ea, h)))) return false;
  const t = Date.parse(`${ev.dateEvent}T12:00:00Z`);
  return !Number.isFinite(t) || Math.abs(t - r.start_utc) < 36 * HOUR;
}

// The result of comparing one game: what to store.
export function compare(r, ev, now) {
  if (!ev) return { tsdb_id: null, second_start: null, note: 'nomatch', unconfirmed: 0 };
  if (ev.strPostponed === 'yes') return { tsdb_id: ev.idEvent, second_start: null, note: 'postponed', unconfirmed: 1 };
  const t = tsdbStart(ev, r.start_utc);
  if (t === null) return { tsdb_id: ev.idEvent, second_start: null, note: 'notime', unconfirmed: 0 };
  const off = Math.abs(t - r.start_utc) > AGREE_MS;
  return { tsdb_id: ev.idEvent, second_start: t, note: off ? 'differ' : 'agree', unconfirmed: off ? 1 : 0 };
}

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
class Limited extends Error {}
export const STALE = Symbol('stale id');

// Finds this game on TheSportsDB (by "Home vs Away" on its UTC date, then the other way round), or looks it up
// by its saved id. Each call goes through `call` so the run can count and space them.
export async function findEvent(r, call) {
  if (r.tsdb_id) {
    const d = await call(`lookupevent.php?id=${r.tsdb_id}`);
    const ev = d?.events?.[0];
    if (ev && String(ev.idEvent) === String(r.tsdb_id)) return ev;
    return STALE; // the saved id answers with another game: forget it, search on the next run
  }
  if (!r.home_full || !r.away_full) return null;
  const day = new Date(r.start_utc).toISOString().slice(0, 10);
  for (const q of searches(r)) {
    const d = await call(`searchevents.php?e=${encodeURIComponent(q)}&d=${day}`);
    const ev = (d?.event || []).find((e) => sameGame(e, r));
    if (ev) return ev;
  }
  return null;
}

// One run's worth of second-source checks. Returns { calls, checked, note }.
export async function secondRun(env, inCal, now = Date.now(), { budget = SECOND_BUDGET, gap = 3000, fetchFn = fetch } = {}) {
  const rows = ((await env.DB.prepare('SELECT * FROM games WHERE start_utc BETWEEN ?1 AND ?2').bind(now, now + 14 * DAY).all()).results || [])
    .filter((r) => r.home_full && inCal(r) && secondDue(r, now))
    .sort((a, b) => (a.start_utc - now <= 3 * HOUR ? 0 : 1) - (b.start_utc - now <= 3 * HOUR ? 0 : 1) || a.start_utc - b.start_utc);
  let calls = 0, checked = 0, note = '';
  const call = async (q) => {
    if (calls >= budget) throw new Limited('budget');
    if (calls) await wait(gap);
    calls++;
    const res = await fetchFn(`${TSDB}/${q}`, { headers: UA });
    if (res.status === 429) throw new Limited('TheSportsDB busy (429)');
    if (!res.ok) throw new Error(`TheSportsDB ${res.status}`);
    return res.json();
  };
  for (const r of rows) {
    // A search can take up to 3 calls: start a new game only with enough calls left.
    if (budget - calls < (r.tsdb_id ? 1 : searches(r).length)) break;
    let ev;
    try { ev = await findEvent(r, call); }
    catch (e) { if (e instanceof Limited) { if (e.message !== 'budget') note = e.message; break; } note = e.message; break; }
    if (ev === STALE) { await env.DB.prepare('UPDATE games SET tsdb_id = NULL WHERE id = ?').bind(r.id).run(); continue; }
    const c = compare(r, ev, now);
    // A flip of "Time unconfirmed" changes the event's notes, so iOS must see it: raise seq, set updated_at.
    await env.DB.prepare(`UPDATE games SET tsdb_id = COALESCE(?2, tsdb_id), second_start = ?3, second_note = ?4, second_checked_at = ?5,
      seq = seq + (CASE WHEN unconfirmed != ?6 THEN 1 ELSE 0 END), updated_at = CASE WHEN unconfirmed != ?6 THEN ?5 ELSE updated_at END,
      unconfirmed = ?6 WHERE id = ?1`).bind(r.id, c.tsdb_id, c.second_start, c.note, now, c.unconfirmed).run();
    checked++;
  }
  return { calls, checked, note, waiting: Math.max(0, rows.length - checked) };
}
