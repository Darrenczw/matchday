// R3-3: backup sources while ESPN is down (TECH-DESIGN 14.9). nflverse (NFL) and TheSportsDB (the rest) fill
// scores and "final"; they never move a kick-off time.
// Run: deno test --allow-read --allow-env tests/
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { csvLine, nflverse, tsdbFinal, backupRun, backupDue } from '../worker/src/backup.js';
import { upsert, syncRun, readMeta } from '../worker/src/sync.js';
import { fakeD1 } from './d1.js';

const H = 3600e3, NOW = Date.now();
const HEADER = 'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,result,espn,stadium';
const nflRow = (espn, as, hs) => `2026_07_X_Y,2026,REG,7,2026-10-25,Sunday,13:00,SF,${as},ATL,${hs},Home,,${espn},"Stadium, City"`;
// nflverse: the whole file, older seasons first. The filler rows make up a whole season (fewer than 200 games is refused).
const FILL = Array.from({ length: 220 }, (_, i) => `2026_01_A_B,2026,REG,1,2026-09-13,Sunday,13:00,A,10,B,20,Home,,40187${String(i).padStart(4, '0')},S`);
const nflFetch = (rows) => async () => new Response(`${HEADER}\n2025_01_A_B,2025,REG,1,2025-09-07,Sunday,13:00,A,3,B,7,Home,,401770000,S\n${[...FILL, ...rows].join('\n')}\n`);
const game = (id, sport, path, start, extra = {}) => ({
  id, path, sport, start_utc: start, time_valid: 1, status: 'scheduled', home: 'Falcons', away: '49ers', home_full: 'Atlanta Falcons', away_full: 'San Francisco 49ers',
  home_id: '1', away_id: '25', venue: '', comp: 'NFL', country: '', us_tv: '[]', postseason: 0, note: '', ...extra,
});
const row = async (env, id) => env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first();

Deno.test('CSV lines with quotes and commas', () => {
  assertEquals(csvLine('a,"b, c",,"say ""hi"""'), ['a', 'b, c', '', 'say "hi"']);
});

Deno.test('nflverse: columns by name, only the current season, rows by ESPN id', async () => {
  const m = await nflverse(nflFetch([nflRow('401873017', '24', '27'), nflRow('401873099', '', '')]));
  assertEquals(m.get('401873017'), { home_score: '27', away_score: '24' });
  assertEquals(m.get('401873099'), { home_score: '', away_score: '' });
  assertEquals(m.size, 222, 'last season left out');
  // A download without the season (e.g. unreadable) is refused, not trusted.
  const bad = async () => new Response(`${HEADER}\n2025_01_A_B,2025,REG,1,2025-09-07,Sunday,13:00,A,3,B,7,Home,,401770000,S\n`);
  let err = '';
  await nflverse(bad).catch((e) => { err = e.message; });
  assert(err.includes('only 0 games read for 2026'), err);
});

Deno.test('TheSportsDB final: both scores and a finished status, nothing else', () => {
  assert(tsdbFinal({ intHomeScore: '104', intAwayScore: '116', strStatus: 'FT' }));
  assert(tsdbFinal({ intHomeScore: '2', intAwayScore: '2', strStatus: 'Match Finished' }));
  assert(!tsdbFinal({ intHomeScore: '50', intAwayScore: '48', strStatus: 'Q3' }));
  assert(!tsdbFinal({ intHomeScore: null, intAwayScore: null, strStatus: 'FT' }));
  assert(!tsdbFinal({ intHomeScore: '1', intAwayScore: '0', strStatus: 'NS' }));
});

Deno.test('due: started 2 hours to 2 days ago, not final, not looked at for 15 minutes', () => {
  const g = game('1', 'football', 'football/nfl', NOW - 3 * H);
  assert(backupDue(g, NOW));
  assert(!backupDue({ ...g, start_utc: NOW - H }, NOW), 'still playing');
  assert(!backupDue({ ...g, start_utc: NOW - 3 * 24 * H }, NOW), 'too old');
  assert(!backupDue({ ...g, status: 'final' }, NOW));
  assert(!backupDue({ ...g, backup_at: NOW - 5 * 60e3 }, NOW), 'looked at 5 minutes ago');
});

Deno.test('backup fills scores and final, keeps the kick-off time and tells iOS nothing', async () => {
  const env = { DB: fakeD1() };
  const nfl = game('401873017', 'football', 'football/nfl', NOW - 4 * H), nba = game('nba1', 'basketball', 'basketball/nba', NOW - 3 * H, { home_full: 'San Antonio Spurs', away_full: 'Oklahoma City Thunder' });
  const notYet = game('401873099', 'football', 'football/nfl', NOW - 3 * H);
  await upsert(env, [nfl, nba, notYet], NOW - 5 * H);
  const before = await row(env, nfl.id);
  const map = await nflverse(nflFetch([nflRow('401873017', '24', '27'), nflRow('401873099', '', '')]));
  const tsdb = async () => new Response(JSON.stringify({ event: [{ idEvent: '2601667', strSport: 'Basketball', strHomeTeam: 'San Antonio Spurs', strAwayTeam: 'Oklahoma City Thunder',
    dateEvent: new Date(nba.start_utc).toISOString().slice(0, 10), intHomeScore: '104', intAwayScore: '116', strStatus: 'FT' }] }));
  const rows = (await env.DB.prepare('SELECT * FROM games').all()).results;
  const res = await backupRun(env, rows, map, NOW, { gap: 0, fetchFn: tsdb });
  assertEquals([res.finals, res.calls], [2, 1]);
  const a = await row(env, nfl.id), b = await row(env, 'nba1'), c = await row(env, notYet.id);
  assertEquals([a.status, a.home_score, a.away_score, a.source, a.start_utc, a.seq, a.updated_at], ['final', '27', '24', 'nflverse', before.start_utc, before.seq, before.updated_at]);
  assertEquals([b.status, b.home_score, b.away_score, b.source, b.tsdb_id], ['final', '104', '116', 'tsdb', '2601667']);
  assertEquals([c.status, c.backup_at], ['scheduled', NOW]);
});

// A whole run with ESPN down: the run is marked failed (red banner still works), the backup still fills finals,
// and ESPN coming back clears "down".
Deno.test('a run with ESPN down: failed run, backup finals, espnDownSince; ESPN back clears it', async () => {
  const realFetch = globalThis.fetch;
  let espnUp = false;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('espn.com')) return espnUp ? new Response(JSON.stringify({ events: [] })) : new Response('down', { status: 503 });
    if (u.includes('nflverse')) return nflFetch([nflRow('401873017', '24', '27')])(u, opts);
    return new Response(JSON.stringify({ event: null }));
  };
  try {
    const env = { DB: fakeD1() };
    await env.DB.prepare('INSERT INTO picks (id, json, updated_at) VALUES (1, ?, 0)').bind(JSON.stringify({ cal: {}, follow: { teams: [{ path: 'football/nfl', id: '1' }] } })).run();
    await env.DB.prepare("INSERT INTO jobs (key, next_at) VALUES ('team|football/nfl|1', ?)").bind(NOW + H).run(); // discovery not due
    await upsert(env, [game('401873017', 'football', 'football/nfl', NOW - 4 * H, { checked_at: 0 })], NOW - 5 * H);
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('espn_ok_at', ?)").bind(String(NOW - 10 * 60e3)).run();

    let threw = false;
    await syncRun(env).catch(() => { threw = true; });
    const run = await env.DB.prepare('SELECT * FROM runs ORDER BY at DESC LIMIT 1').first();
    const m = await readMeta(env);
    assert(threw, 'a failed ESPN run still reports failure');
    assertEquals(run.ok, 0);
    assert(run.note.includes('ESPN 503') && run.note.includes('backup: 1 finals'), run.note);
    assert(m.espn_down_since > m.espn_ok_at && m.nflverse_at > 0);
    assertEquals((await row(env, '401873017')).source, 'nflverse');

    espnUp = true;
    await env.DB.prepare("UPDATE jobs SET next_at = 0").run(); // a schedule refresh calls ESPN
    await syncRun(env);
    const m2 = await readMeta(env);
    assert(!(m2.espn_down_since > m2.espn_ok_at), 'ESPN back: not down any more');
  } finally { globalThis.fetch = realFetch; }
});
