// R3-1: the helper as the app's backup (TECH-DESIGN section 14). Scores stored from ESPN, Follow picks tracked
// but kept out of the feed, and GET /api/games in the app's norm() shape.
// Run: deno test --allow-read --allow-env tests/
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { rowFrom, upsert, jobKeys, tracked } from '../worker/src/sync.js';
import worker, { gameOut } from '../worker/src/index.js';
import { fakeD1 } from './d1.js';

const H = 3600e3, NOW = Date.now();
const team = (id, name, short, abbr, score, homeAway) => ({ homeAway, score, team: { id, displayName: name, shortDisplayName: short, abbreviation: abbr } });
const event = (id, state, { start = NOW + 2 * H, hs = '0', as = '0', clock = "0'", period = 0, name = 'STATUS_SCHEDULED', detail = 'Sat, October 24th at 10:00 AM EDT' } = {}) => ({
  id, date: new Date(start).toISOString(), league: { slug: 'eng.1' },
  competitions: [{
    competitors: [team('359', 'Arsenal', 'Arsenal', 'ARS', hs, 'home'), team('368', 'Everton', 'Everton', 'EVE', as, 'away')],
    status: { displayClock: clock, period, type: { state, name, shortDetail: detail, completed: state === 'post' } },
    venue: { fullName: 'Emirates Stadium', address: { city: 'London', country: 'England' } },
  }],
});

Deno.test('ESPN rows carry scores only once the game has started, plus clock, period and status text', () => {
  const pre = rowFrom(event('1', 'pre'), 'soccer/eng.1');
  assertEquals([pre.home_score, pre.away_score, pre.home_abbr, pre.away_abbr], [null, null, 'ARS', 'EVE']);
  const live = rowFrom(event('1', 'in', { hs: '2', as: '1', clock: "67'", period: 2, name: 'STATUS_SECOND_HALF', detail: "67'" }), 'soccer/eng.1');
  assertEquals([live.status, live.home_score, live.away_score, live.clock, live.period, live.status_name, live.detail], ['live', '2', '1', "67'", 2, 'STATUS_SECOND_HALF', "67'"]);
  // Team schedules give the score as an object.
  const sched = event('1', 'post', { name: 'STATUS_FULL_TIME' });
  sched.competitions[0].competitors[0].score = { value: 3, displayValue: '3' };
  assertEquals(rowFrom(sched, 'soccer/eng.1').home_score, '3');
});

Deno.test('a score change is stored without telling iOS (no seq, no updated_at): the feed has no scores', async () => {
  const env = { DB: fakeD1() };
  await upsert(env, [rowFrom(event('1', 'pre'), 'soccer/eng.1')], NOW - H);
  await upsert(env, [rowFrom(event('1', 'in', { hs: '1', clock: "12'", period: 1, name: 'STATUS_FIRST_HALF' }), 'soccer/eng.1')], NOW);
  const r = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind('1').first();
  assertEquals([r.status, r.home_score, r.away_score, r.seq, r.updated_at, r.source], ['live', '1', '0', 0, NOW - H, 'espn']);
});

Deno.test('Follow picks are discovered too: teams and games like the calendar, a followed league only for 7 days', () => {
  const cal = { comps: [{ path: 'soccer/eng.1' }], teams: [{ path: 'soccer/eng.1', id: '359' }], games: [] };
  const follow = { comps: [{ path: 'soccer/eng.1' }, { path: 'basketball/nba' }], teams: [{ path: 'soccer/eng.1', id: '359' }, { path: 'football/nfl', id: '3' }], games: [{ id: '9', path: 'football/nfl' }] };
  assertEquals(jobKeys(cal, follow).sort(), ['comp|soccer/eng.1', 'game|football/nfl|9', 'team|football/nfl|3', 'team|soccer/eng.1|359', 'week|basketball/nba'].sort());
  const r = { id: '5', path: 'basketball/nba', sport: 'basketball', home_id: '1', away_id: '2' };
  assert(tracked(r, { cal, follow }));
  assert(!tracked(r, { cal, follow: {} }));
});

// The real request handler, on the fake database. Fetches to ESPN fail fast, so the discovery a picks upload
// starts in the background just writes a failed run.
async function helper() {
  const env = { DB: fakeD1(), APP_ORIGIN: 'https://darrenczw.github.io' };
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const call = async (method, path, body, key) => {
    const res = await worker.fetch(new Request(`https://helper.test${path}`, { method, body: body && JSON.stringify(body), headers: key ? { authorization: `Bearer ${key}` } : {} }), env, ctx);
    return { status: res.status, json: await res.json() };
  };
  const { json: { editKey } } = await call('POST', '/api/claim');
  return { env, call: (m, p, b) => call(m, p, b, editKey), call0: call, settle: () => Promise.all(waits) };
}

Deno.test('GET /api/games: followed and calendar games in the window, app shape, ESPN health; feed stays calendar-only', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('down', { status: 503 });
  try {
    const { env, call, call0, settle } = await helper();
    await upsert(env, [
      rowFrom(event('1', 'in', { hs: '2', as: '1', clock: "67'", period: 2, name: 'STATUS_SECOND_HALF', detail: "67'" }), 'soccer/eng.1'),
      { ...rowFrom(event('2', 'pre', { start: NOW + 30 * H }), 'soccer/eng.1'), id: '2', home_id: '1', away_id: '2' }, // nobody's pick
    ], NOW);
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('espn_ok_at', ?)").bind(String(NOW - 5 * 60e3)).run();
    assertEquals((await call('PUT', '/api/picks', { cal: { comps: [], teams: [], games: [] }, follow: { comps: [], teams: [{ path: 'soccer/eng.1', id: '359' }], games: [] } })).status, 200);
    await settle();

    const { status, json } = await call('GET', `/api/games?from=${NOW - H}&to=${NOW + 3 * 24 * H}`);
    assertEquals(status, 200);
    assertEquals([json.espnOkAt, json.games.length, json.games[0].id], [NOW - 5 * 60e3, 1, '1']);
    const g = json.games[0];
    assertEquals([g.state, g.completed, g.postponed, g.clock, g.period, g.src, g.timeValid], ['in', false, false, "67'", 2, 'espn', true]);
    assertEquals(g.home, { id: '359', abbr: 'ARS', name: 'Arsenal', short: 'Arsenal', score: '2', home: true });
    assertEquals(g.away.score, '1');
    assertEquals(g.venue, 'Emirates Stadium');

    // An older app sends no follow list: the helper keeps the last one.
    await call('PUT', '/api/picks', { cal: { comps: [], teams: [], games: [] } });
    await settle();
    assertEquals((await call('GET', `/api/games?from=${NOW - H}&to=${NOW + 3 * 24 * H}`)).json.games.length, 1);

    // Same lock as /api/status.
    assertEquals((await call0('GET', '/api/games')).status, 401);

    // The feed has only calendar games: the followed one is not in it.
    const o = await env.DB.prepare('SELECT feed_token FROM owner').first();
    const ics = await (await worker.fetch(new Request(`https://helper.test/cal/${o.feed_token}.ics`), env, { waitUntil: () => {} })).text();
    assert(ics.includes('BEGIN:VCALENDAR') && !ics.includes('BEGIN:VEVENT'), 'followed game leaked into the feed');
  } finally { globalThis.fetch = realFetch; }
});

Deno.test('gameOut: postponed, final and TBC games read the way the app expects', () => {
  const base = { id: '7', path: 'football/nfl', sport: 'football', start_utc: NOW, time_valid: 0, home: 'Bears', away: 'Patriots', home_full: 'Chicago Bears', away_full: 'New England Patriots', home_id: '3', away_id: '17', us_tv: '["CBS"]' };
  const p = gameOut({ ...base, status: 'postponed' });
  assertEquals([p.state, p.postponed, p.timeValid, p.usTV, p.home.score, p.away.home], ['pre', true, false, ['CBS'], null, false]);
  const f = gameOut({ ...base, time_valid: 1, status: 'final', home_score: '24', away_score: '17', status_name: 'STATUS_FINAL', detail: 'Final' });
  assertEquals([f.state, f.completed, f.home.score, f.detail], ['post', true, '24', 'Final']);
});
