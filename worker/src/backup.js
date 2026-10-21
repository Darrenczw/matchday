// Backup sources while ESPN is down (TECH-DESIGN section 14.9): nflverse for NFL, TheSportsDB for the rest.
// They fill scores and "final" only. A backup never moves a kick-off time: times come from ESPN alone.
import { findEvent, searches, STALE } from './second.js';

const NFLVERSE = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const TSDB = 'https://www.thesportsdb.com/api/v1/json/123';
const UA = { 'user-agent': 'Mozilla/5.0 (Matchday personal app)' };
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const BACKUP_BUDGET = 3; // TheSportsDB calls per run, on top of the second-source check's 3 (one search can take 3)

// One CSV line into fields ("a,\"b, c\",d" → a | b, c | d).
export function csvLine(line) {
  const out = [];
  let f = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(f); f = ''; }
    else f += c;
  }
  out.push(f);
  return out;
}

// nflverse rows by ESPN game id: { home_score, away_score } ('' until played), for the current season.
// The whole file is fetched: from Cloudflare, GitHub sends it gzip-compressed whatever we ask, so a byte range
// would cut compressed data (drill, 21 Oct 2026). Only the season's rows, at the end of the file, are parsed.
export async function nflverse(fetchFn = fetch, now = Date.now()) {
  const r = await fetchFn(NFLVERSE, { headers: UA });
  if (!r.ok) throw new Error(`nflverse ${r.status}`);
  const text = await r.text();
  const cols = csvLine(text.slice(0, text.indexOf('\n')));
  const at = (name) => { const i = cols.indexOf(name); if (i < 0) throw new Error(`nflverse: no ${name} column`); return i; };
  const [espn, hs, as] = [at('espn'), at('home_score'), at('away_score')];
  // The season that started this year (from September), else last year's (it runs into February).
  const d = new Date(now), year = d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const start = text.indexOf(`\n${year}_`);
  const out = new Map();
  if (start >= 0) {
    for (const l of text.slice(start + 1).split('\n')) {
      if (!l.trim()) continue;
      const f = csvLine(l);
      if (f[espn]) out.set(f[espn], { home_score: f[hs], away_score: f[as] });
    }
  }
  if (out.size < 200) throw new Error(`nflverse: only ${out.size} games read for ${year}`); // a season is 272 or more
  return out;
}

// TheSportsDB's word for a finished game.
export const tsdbFinal = (ev) => ev?.intHomeScore != null && ev?.intAwayScore != null && ev.intHomeScore !== '' && ev.intAwayScore !== ''
  && /^(FT|AOT|AET|PEN|Match Finished|Finished|After Over ?Time)$/i.test(String(ev.strStatus || '').trim());

const FINAL = `UPDATE games SET home_score = ?2, away_score = ?3, status = 'final', status_name = 'STATUS_FINAL', detail = 'Final',
  clock = '', source = ?4, backup_at = ?5 WHERE id = ?1 AND status IN ('scheduled', 'live')`;

// Is a game due a backup look-up? Tracked, not final, started 2 hours to 2 days ago, not looked at for 15 minutes.
export const backupDue = (r, now) => (r.status === 'scheduled' || r.status === 'live') && r.start_utc <= now - 2 * HOUR
  && r.start_utc >= now - 2 * DAY && now - (r.backup_at || 0) >= 15 * MIN;

// One run's backup step. `rows` are the tracked games; `nfl` is the nflverse map (or null when not fetched).
// Returns { finals, calls, note }.
export async function backupRun(env, rows, nfl, now = Date.now(), { budget = BACKUP_BUDGET, gap = 3000, fetchFn = fetch } = {}) {
  let finals = 0, calls = 0, note = '';
  const due = rows.filter((r) => backupDue(r, now)).sort((a, b) => a.start_utc - b.start_utc);
  // NFL: nflverse, by ESPN id. No calls of its own here: the file was read once for this run.
  for (const r of due.filter((r) => r.sport === 'football')) {
    const n = nfl?.get(r.id);
    if (n && n.home_score !== '' && n.away_score !== '') {
      await env.DB.prepare(FINAL).bind(r.id, n.home_score, n.away_score, 'nflverse', now).run();
      finals++;
    } else await env.DB.prepare('UPDATE games SET backup_at = ? WHERE id = ?').bind(now, r.id).run();
  }
  // Everything else: TheSportsDB, a few calls per run, spaced out.
  const call = async (q) => {
    if (calls >= budget) throw Object.assign(new Error('budget'), { budget: true });
    if (calls) await new Promise((res) => setTimeout(res, gap));
    calls++;
    const res = await fetchFn(`${TSDB}/${q}`, { headers: UA });
    if (res.status === 429) throw Object.assign(new Error('TheSportsDB busy (429)'), { budget: true });
    if (!res.ok) throw new Error(`TheSportsDB ${res.status}`);
    return res.json();
  };
  for (const r of due.filter((r) => r.sport !== 'football')) {
    if (budget - calls < (r.tsdb_id ? 1 : searches(r).length)) break; // start a game only with enough calls left
    let ev;
    try { ev = await findEvent(r, call); }
    catch (e) { if (e.message !== 'budget') note = e.message; break; }
    if (ev === STALE) { await env.DB.prepare('UPDATE games SET tsdb_id = NULL WHERE id = ?').bind(r.id).run(); continue; } // searched next run
    if (tsdbFinal(ev)) {
      await env.DB.prepare(FINAL).bind(r.id, String(ev.intHomeScore), String(ev.intAwayScore), 'tsdb', now).run();
      await env.DB.prepare('UPDATE games SET tsdb_id = ? WHERE id = ?').bind(String(ev.idEvent), r.id).run();
      finals++;
    } else await env.DB.prepare('UPDATE games SET backup_at = ?, tsdb_id = COALESCE(?, tsdb_id) WHERE id = ?').bind(now, ev?.idEvent ? String(ev.idEvent) : null, r.id).run();
  }
  return { finals, calls, note };
}
