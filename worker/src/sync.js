// Keeps the games table current: finds every game for the calendar picks (discovery) and re-checks
// kick-off times more often as each game gets closer (TECH-DESIGN sections 3 and 4).
import { NICE } from '../../js/names.js';
import { secondRun } from './second.js';
import { backupRun, backupDue, nflverse } from './backup.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const UA = { 'user-agent': 'Mozilla/5.0 (Matchday personal app)' }; // ESPN refuses requests with no browser-style agent
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const BUDGET = 6; // ESPN calls per run: keeps each run inside the free plan's 10 ms of CPU

// When ESPN last answered and last failed, written to meta at the end of each run (TECH-DESIGN 14.9).
let espnOk = 0, espnFail = 0, espnLast = ''; // espnLast: 'ok' or 'fail', whichever happened last
// Outage drill on the practice helper only: `wrangler deploy --env test --var ESPN_DOWN_TEST:1` makes every ESPN
// call fail, to test the backup end to end. Deploy again without it to end the drill.
let drill = false;
async function get(url) {
  try {
    if (drill) throw new Error('ESPN 503 (drill)');
    const r = await fetch(url, { headers: UA });
    if (!r.ok) throw new Error(`ESPN ${r.status} ${url.replace(SITE, '')}`);
    const d = await r.json();
    espnOk = Date.now(); espnLast = 'ok';
    return d;
  } catch (e) { espnFail = Date.now(); espnLast = 'fail'; throw e; }
}

// ESPN's "dates=" is a US date. A US date key for a moment in time:
const usFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export const usDate = (ms) => usFmt.format(new Date(ms)).replaceAll('-', '');
const addDay = (ymd, n) => { const d = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10).replaceAll('-', ''); };

// A team's score: a plain string on scoreboards, an object on team schedules.
const score = (t) => (t.score == null ? null : String(typeof t.score === 'object' ? t.score.displayValue ?? t.score.value ?? '' : t.score));

// One event from a scoreboard or a team schedule, as a games row.
export function rowFrom(e, path, leagueName) {
  const c = e.competitions?.[0];
  if (!c) return null;
  if (e.league?.slug && path.startsWith('soccer/')) path = `soccer/${e.league.slug}`;
  const sport = path.split('/')[0], slug = path.split('/')[1];
  const H = c.competitors?.find((x) => x.homeAway === 'home'), A = c.competitors?.find((x) => x.homeAway === 'away');
  if (!H || !A) return null;
  const ty = (c.status || e.status)?.type || {};
  const status = /POSTPONED/.test(ty.name || '') ? 'postponed' : /CANCEL/.test(ty.name || '') ? 'canceled'
    : ty.state === 'in' ? 'live' : ty.state === 'post' ? 'final' : 'scheduled';
  const tv = new Set();
  for (const b of c.broadcasts || []) {
    if (b.region && b.region !== 'us') continue;
    (b.names || []).forEach((n) => tv.add(n));
    if (b.media?.shortName) tv.add(b.media.shortName);
  }
  const name = (t) => t.team?.shortDisplayName || (sport !== 'soccer' && t.team?.name) || t.team?.displayName || '';
  const venue = [c.venue?.fullName, c.venue?.address?.city].filter(Boolean).join(', ');
  return {
    id: String(e.id), path, sport, start_utc: Date.parse(e.date || c.date), time_valid: e.timeValid !== false && c.timeValid !== false ? 1 : 0, status,
    home: name(H), away: name(A), home_full: H.team?.displayName || name(H), away_full: A.team?.displayName || name(A), home_id: String(H.team?.id || H.id), away_id: String(A.team?.id || A.id), venue,
    comp: sport === 'football' ? 'NFL' : sport === 'basketball' ? 'NBA' : NICE[slug] || e.league?.shortName || leagueName || slug,
    country: c.venue?.address?.country || '', us_tv: JSON.stringify([...tv]),
    postseason: sport !== 'soccer' && (e.season?.type === 3 || e.seasonType?.type === 3) ? 1 : 0, note: c.notes?.[0]?.headline || '',
    // For the app's backup: abbreviations, and scores once the game has started (null before).
    home_abbr: H.team?.abbreviation || '', away_abbr: A.team?.abbreviation || '',
    home_score: ty.state === 'pre' ? null : score(H), away_score: ty.state === 'pre' ? null : score(A),
    clock: (c.status || e.status)?.displayClock || '', period: (c.status || e.status)?.period || 0,
    status_name: ty.name || '', detail: ty.shortDetail || ty.detail || '',
  };
}

// Insert or update. Only a new time, a time becoming known, or postponed/cancelled counts as a change
// iOS must see (raises seq, sets updated_at). A real move also records where it moved from, re-compares
// with the second source's last time, and asks for a fresh second-source check.
const UPSERT = `INSERT INTO games (id, path, sport, start_utc, time_valid, status, home, away, home_id, away_id, venue, comp, country, us_tv, postseason, note, home_full, away_full,
  home_abbr, away_abbr, home_score, away_score, clock, period, status_name, detail, source, seq, checked_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, 'espn', 0, ?17, ?17)
ON CONFLICT(id) DO UPDATE SET
  seq = games.seq + (CASE WHEN games.start_utc != excluded.start_utc OR games.time_valid != excluded.time_valid
    OR (games.status IN ('postponed','canceled')) != (excluded.status IN ('postponed','canceled')) THEN 1 ELSE 0 END),
  updated_at = CASE WHEN games.start_utc != excluded.start_utc OR games.time_valid != excluded.time_valid
    OR (games.status IN ('postponed','canceled')) != (excluded.status IN ('postponed','canceled')) THEN excluded.checked_at ELSE games.updated_at END,
  prev_start = CASE WHEN games.time_valid = 1 AND excluded.time_valid = 1 AND games.start_utc != excluded.start_utc THEN games.start_utc ELSE games.prev_start END,
  moved_at = CASE WHEN games.time_valid = 1 AND excluded.time_valid = 1 AND games.start_utc != excluded.start_utc THEN excluded.checked_at ELSE games.moved_at END,
  unconfirmed = CASE WHEN excluded.status IN ('postponed','canceled') THEN 0
    WHEN games.start_utc = excluded.start_utc AND games.time_valid = excluded.time_valid THEN games.unconfirmed
    WHEN excluded.time_valid = 0 OR games.second_start IS NULL THEN 0 ELSE abs(excluded.start_utc - games.second_start) > 300000 END,
  second_note = CASE WHEN excluded.status IN ('postponed','canceled') OR excluded.time_valid = 0 THEN NULL
    WHEN games.start_utc = excluded.start_utc OR games.second_start IS NULL THEN games.second_note
    WHEN abs(excluded.start_utc - games.second_start) > 300000 THEN 'differ' ELSE 'agree' END,
  second_checked_at = CASE WHEN games.start_utc != excluded.start_utc THEN 0 ELSE games.second_checked_at END,
  home_full = excluded.home_full, away_full = excluded.away_full,
  home_abbr = excluded.home_abbr, away_abbr = excluded.away_abbr, home_score = excluded.home_score, away_score = excluded.away_score,
  clock = excluded.clock, period = excluded.period, status_name = excluded.status_name, detail = excluded.detail, source = 'espn',
  path = excluded.path, start_utc = excluded.start_utc, time_valid = excluded.time_valid, status = excluded.status,
  home = excluded.home, away = excluded.away, home_id = excluded.home_id, away_id = excluded.away_id, venue = excluded.venue,
  comp = excluded.comp, country = excluded.country, us_tv = excluded.us_tv, postseason = excluded.postseason, note = excluded.note,
  checked_at = excluded.checked_at`;
export async function upsert(env, rows, now) {
  const ok = rows.filter(Boolean);
  for (let i = 0; i < ok.length; i += 50) {
    await env.DB.batch(ok.slice(i, i + 50).map((r) => env.DB.prepare(UPSERT).bind(r.id, r.path, r.sport, r.start_utc, r.time_valid, r.status,
      r.home, r.away, r.home_id, r.away_id, r.venue, r.comp, r.country, r.us_tv, r.postseason, r.note, now, r.home_full || r.home, r.away_full || r.away,
      r.home_abbr ?? null, r.away_abbr ?? null, r.home_score ?? null, r.away_score ?? null, r.clock ?? null, r.period ?? null, r.status_name ?? null, r.detail ?? null)));
  }
  return ok.length;
}

// Is a games row in the calendar? (Calendar picks are their own layer, separate from Follow.)
export function inCal(r, cal = {}) {
  return (cal.comps || []).some((c) => c.path === r.path)
    || (cal.teams || []).some((t) => t.path.split('/')[0] === r.sport && (t.id === r.home_id || t.id === r.away_id))
    || (cal.games || []).some((g) => g.id === r.id);
}
// Tracked = in the calendar, or followed in the app (the app's backup, TECH-DESIGN section 14). Only calendar
// games go in the feed; followed games are kept fresh for /api/games.
export const tracked = (r, picks = {}) => inCal(r, picks.cal) || inCal(r, picks.follow);

// How often a game's time is re-checked, by how far away it is (TECH-DESIGN section 3).
export function checkEvery(r, now) {
  const until = r.start_utc - now;
  if (r.status === 'live' || until <= 3 * HOUR) return 2 * MIN;
  if (until <= 2 * DAY) return 5 * MIN;
  if (until <= 14 * DAY) return 15 * MIN;
  return null; // further out: refreshed with the pick's schedule every 6 hours
}

// ---------- Discovery: one calendar pick per call
const jobKey = (kind, p) => (kind === 'team' ? `team|${p.path}|${p.id}` : kind === 'comp' ? `comp|${p.path}` : `game|${p.path}|${p.id}`);
export const jobKeys = (cal = {}, follow = {}) => [...new Set([
  ...(cal.teams || []).map((t) => jobKey('team', t)), ...(cal.comps || []).map((c) => jobKey('comp', c)), ...(cal.games || []).map((g) => jobKey('game', g)),
  // Followed: a team's or game's discovery is the same as the calendar's; a followed league needs only 3 days back to 7 ahead.
  ...(follow.teams || []).map((t) => jobKey('team', t)), ...(follow.games || []).map((g) => jobKey('game', g)),
  ...(follow.comps || []).filter((c) => !(cal.comps || []).some((x) => x.path === c.path)).map((c) => `week|${c.path}`),
])];

async function scoreboard(path, ymd) {
  const d = await get(`${SITE}/${path}/scoreboard?dates=${ymd}&limit=300`);
  return (d.events || []).map((e) => rowFrom(e, path, d.leagues?.[0]?.name));
}

// Returns { rows, calls, cursor, done }.
async function discover(key, cursor, now, budget, picks) {
  const [kind, path, id] = key.split('|');
  const since = now - 7 * DAY;
  if (kind === 'team') {
    const sport = path.split('/')[0];
    const urls = sport === 'soccer'
      ? [`${SITE}/soccer/all/teams/${id}/schedule?fixture=true`, `${SITE}/soccer/all/teams/${id}/schedule`]
      : [`${SITE}/${path}/teams/${id}/schedule`];
    const rows = [];
    for (const u of urls) { const d = await get(u); rows.push(...(d.events || []).map((e) => rowFrom(e, path))); }
    return { rows: rows.filter((r) => r && r.start_utc >= since), calls: urls.length, done: true };
  }
  if (kind === 'game') {
    const pick = [...(picks.cal?.games || []), ...(picks.follow?.games || [])].find((g) => g.id === id);
    const day = usDate(Date.parse(pick?.date || now));
    const rows = [...(await scoreboard(path, addDay(day, -1))), ...(await scoreboard(path, day))].filter((r) => r?.id === id);
    return { rows, calls: 2, done: true };
  }
  // A whole league: walk day by day, a few days per run. Calendar: 7 days ago to the end of the season.
  // Followed only ("week"): 3 days ago (My games shows 3 days of results) to 7 days ahead.
  const [from, to] = kind === 'week' ? [now - 3 * DAY, now + 7 * DAY] : [since, now + 300 * DAY];
  let ymd = cursor || usDate(from), calls = 0;
  const rows = [];
  while (calls < budget) {
    const day = await scoreboard(path, ymd);
    calls++;
    rows.push(...day.filter(Boolean));
    ymd = addDay(ymd, 1);
    if (ymd > usDate(to)) return { rows, calls, done: true };
  }
  return { rows, calls, cursor: ymd, done: false };
}

const setMeta = (env, key, value) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2').bind(key, String(value)).run();
export async function readMeta(env) {
  return Object.fromEntries(((await env.DB.prepare('SELECT key, value FROM meta').all()).results || []).map((m) => [m.key, Number(m.value)]));
}
// Remember what ESPN did this run. ESPN is down when a call failed after the last one that worked; returns that.
async function noteEspn(env, since) {
  const m = await readMeta(env);
  if (espnLast === 'ok' && espnOk >= since) { await setMeta(env, 'espn_ok_at', espnOk); m.espn_ok_at = espnOk; }
  if (espnLast === 'fail' && espnFail >= since && !((m.espn_down_since || 0) > (m.espn_ok_at || 0))) {
    m.espn_down_since = Math.max(espnFail, (m.espn_ok_at || 0) + 1); // always after the last success, even in the same millisecond
    await setMeta(env, 'espn_down_since', m.espn_down_since);
  }
  return { down: (m.espn_down_since || 0) > (m.espn_ok_at || 0), meta: m };
}

// ---------- One scheduled run
export async function syncRun(env, { onlyDiscover = false } = {}) {
  const now = Date.now();
  drill = env.ESPN_DOWN_TEST === '1';
  let calls = 0, checked = 0, picks = {}, failed = null;
  const notes = [];
  try {
    picks = JSON.parse((await env.DB.prepare('SELECT json FROM picks WHERE id = 1').first())?.json || '{}');
    const cal = picks.cal || {};
    const keys = jobKeys(cal, picks.follow);
    const jobs = new Map(((await env.DB.prepare('SELECT * FROM jobs').all()).results || []).map((j) => [j.key, j]));

    // 1. Discovery: the most overdue pick (new picks are due at once).
    const due = keys.map((k) => jobs.get(k) || { key: k, next_at: 0, cursor: null }).filter((j) => j.next_at <= now).sort((a, b) => a.next_at - b.next_at);
    for (const j of due) {
      if (calls >= BUDGET - 1) break;
      const res = await discover(j.key, j.cursor, now, BUDGET - calls, picks);
      calls += res.calls;
      checked += await upsert(env, res.rows, now);
      await env.DB.prepare('INSERT INTO jobs (key, next_at, cursor) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET next_at = ?2, cursor = ?3')
        .bind(j.key, res.done ? now + 6 * HOUR : now, res.done ? null : res.cursor).run();
      if (!res.done) break; // a league walk uses the rest of this run
    }

    // 2. Time checks: tracked games that are due (times, and scores while live), one scoreboard per league and US date.
    if (!onlyDiscover) {
      const rows = ((await env.DB.prepare('SELECT * FROM games WHERE start_utc BETWEEN ?1 AND ?2').bind(now - 6 * HOUR, now + 14 * DAY).all()).results || [])
        .filter((r) => tracked(r, picks) && r.status !== 'final' && r.status !== 'canceled');
      const groups = new Map();
      for (const r of rows) {
        const every = checkEvery(r, now);
        if (!every || now - r.checked_at < every - 20e3) continue;
        const k = `${r.path}|${usDate(r.start_utc)}`;
        if (!groups.has(k)) groups.set(k, { path: r.path, ymd: usDate(r.start_utc), ids: new Set(), soonest: r.start_utc });
        const g = groups.get(k);
        g.ids.add(r.id);
        g.soonest = Math.min(g.soonest, r.start_utc);
      }
      for (const g of [...groups.values()].sort((a, b) => a.soonest - b.soonest)) {
        if (calls >= BUDGET) { notes.push('more checks waiting'); break; }
        const fresh = (await scoreboard(g.path, g.ymd)).filter((r) => r && g.ids.has(r.id));
        calls++;
        checked += await upsert(env, fresh, now);
        // A game missing from its old date was moved to another day: find it there.
        const missing = [...g.ids].filter((id) => !fresh.some((r) => r.id === id));
        if (missing.length) {
          notes.push(`not on ${g.ymd}: ${missing.join(',')}`);
          await env.DB.prepare(`UPDATE games SET checked_at = ?1 WHERE id IN (${missing.map(() => '?').join(',')})`).bind(now, ...missing).run();
          await env.DB.prepare('UPDATE jobs SET next_at = 0').run(); // rediscover, so the moved game is found on its new date
        }
      }
    }
  } catch (err) { failed = err; } // ESPN (or the database) failed: the steps below still run, the run is still marked failed

  let espn = { down: false, meta: {} };
  try { espn = await noteEspn(env, now); } catch (e) { notes.push(`meta: ${String(e.message || e).slice(0, 60)}`); }
  if (!onlyDiscover) {
    const cal = picks.cal || {};
    // 3. Second source (TheSportsDB): daily, and once in the last 3 hours, a few calls per run.
    try {
      const s = await secondRun(env, (r) => inCal(r, cal), now);
      if (s.calls) notes.push(`2nd: ${s.calls} calls, ${s.checked} checked${s.waiting ? `, ${s.waiting} waiting` : ''}`);
      if (s.note) notes.push(`2nd: ${s.note}`);
    } catch (e) { notes.push(`2nd failed: ${String(e.message || e).slice(0, 80)}`); } // never blocks the ESPN checks

    // 4. Backup while ESPN is down: finals from nflverse (NFL) and TheSportsDB (the rest). Never kick-off times.
    // nflverse is also read every 6 hours as a health check.
    try {
      const recent = espn.down ? ((await env.DB.prepare('SELECT * FROM games WHERE start_utc BETWEEN ?1 AND ?2').bind(now - 2 * DAY, now).all()).results || [])
        .filter((r) => tracked(r, picks) && backupDue(r, now)) : [];
      let nfl = null;
      const nflDue = recent.filter((r) => r.sport === 'football');
      if (nflDue.length || now - (espn.meta.nflverse_try_at || 0) >= 6 * HOUR) {
        // Reading nflverse is the heaviest step (about 28 ms of CPU). Note the attempt first, so if Cloudflare
        // ever stops a run for CPU, the next runs don't try again straight away.
        await setMeta(env, 'nflverse_try_at', now);
        if (nflDue.length) await env.DB.prepare(`UPDATE games SET backup_at = ?1 WHERE id IN (${nflDue.map(() => '?').join(',')})`).bind(now, ...nflDue.map((r) => r.id)).run();
        try { nfl = await nflverse(); await setMeta(env, 'nflverse_at', now); } catch (e) { notes.push(String(e.message || e).slice(0, 80)); }
      }
      if (recent.length) {
        const b = await backupRun(env, recent, nfl, now);
        notes.push(`backup: ${b.finals} finals, ${b.calls} calls${b.note ? `, ${b.note}` : ''}`);
        if (b.calls && !b.note) await setMeta(env, 'backup_at', now);
      }
    } catch (e) { notes.push(`backup failed: ${String(e.message || e).slice(0, 80)}`); }
  }

  // 5. Tidy: old games, fetch log and run log.
  const note = `${failed ? String(failed.message || failed).slice(0, 200) + '; ' : ''}${calls} calls${notes.length ? '; ' + notes.join('; ') : ''}`;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM games WHERE start_utc < ?').bind(now - 8 * DAY),
    env.DB.prepare('DELETE FROM fetches WHERE at < ?').bind(now - 14 * DAY),
    env.DB.prepare('DELETE FROM runs WHERE at < ?').bind(now - 3 * DAY),
    env.DB.prepare('INSERT INTO runs (at, ok, checked, note) VALUES (?, ?, ?, ?)').bind(now, failed ? 0 : 1, checked, note.slice(0, 300)),
  ]);
  if (failed) throw failed;
  return { calls, checked };
}
