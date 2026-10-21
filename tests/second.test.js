// Second-source check (TheSportsDB): name matching, when it's due, and what it stores.
// Run: deno test --allow-read tests/
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { norm, tsdbName, secondDue, sameGame, compare, tsdbStart, secondRun } from '../worker/src/second.js';
import { upsert } from '../worker/src/sync.js';
import { calendar } from '../js/ics.js';
import { fakeD1 } from './d1.js';

const H = 3600e3, NOW = Date.UTC(2026, 9, 21, 6, 0);
const game = {
  id: '740001', path: 'soccer/eng.1', sport: 'soccer', start_utc: NOW + 3 * 24 * H, time_valid: 1, status: 'scheduled',
  home: 'Brighton', away: 'Man Utd', home_full: 'Brighton & Hove Albion', away_full: 'Manchester United', home_id: '331', away_id: '360',
  venue: 'Amex Stadium, Brighton', comp: 'Premier League', country: 'England', us_tv: '[]', postseason: 0, note: '',
};
const ev = (over = {}) => ({ idEvent: '2494100', strSport: 'Soccer', strHomeTeam: 'Brighton and Hove Albion', strAwayTeam: 'Manchester United',
  dateEvent: new Date(game.start_utc).toISOString().slice(0, 10), strTimestamp: new Date(game.start_utc).toISOString().slice(0, 19), strPostponed: 'no', ...over });

Deno.test('names: accents, "&", FC and aliases', () => {
  assertEquals(norm('Brighton & Hove Albion'), norm('Brighton and Hove Albion'));
  assertEquals(norm('Atlético Madrid'), 'atletico madrid');
  assertEquals(norm('Liverpool FC'), 'liverpool');
  assertEquals(tsdbName('Atlético Madrid'), 'Atletico_Madrid');
  assertEquals(tsdbName('Brighton & Hove Albion'), 'Brighton_and_Hove_Albion');
});

Deno.test('same game: both teams, either way round, same sport, close date', () => {
  assert(sameGame(ev(), game));
  assert(sameGame(ev({ strHomeTeam: 'Manchester United', strAwayTeam: 'Brighton and Hove Albion' }), game));
  assert(!sameGame(ev({ strAwayTeam: 'Manchester United Women' }), game));
  assert(!sameGame(ev({ strSport: 'Basketball' }), game));
  assert(!sameGame(ev({ dateEvent: '2026-11-30' }), game));
});

Deno.test('due: daily within 14 days, and once in the last 3 hours', () => {
  assert(secondDue({ ...game, second_checked_at: null }, NOW));
  assert(!secondDue({ ...game, second_checked_at: NOW - 20 * H }, NOW));
  assert(secondDue({ ...game, second_checked_at: NOW - 25 * H }, NOW));
  assert(!secondDue({ ...game, start_utc: NOW + 15 * 24 * H }, NOW), 'too far out');
  assert(!secondDue({ ...game, time_valid: 0 }, NOW), 'time TBC');
  const soon = { ...game, start_utc: NOW + 2 * H };
  assert(secondDue({ ...soon, second_checked_at: NOW - 2 * H }, NOW), 'last check was before the 3-hour mark');
  assert(!secondDue({ ...soon, second_checked_at: NOW - 30 * 60e3 }, NOW), 'already checked inside 3 hours');
});

Deno.test('compare: agree within 5 minutes, differ beyond, no time, postponed, no match', () => {
  assertEquals(compare(game, ev(), NOW).note, 'agree');
  assertEquals(compare(game, ev({ strTimestamp: new Date(game.start_utc + 4 * 60e3).toISOString().slice(0, 19) }), NOW).unconfirmed, 0);
  const off = compare(game, ev({ strTimestamp: new Date(game.start_utc + 30 * 60e3).toISOString().slice(0, 19) }), NOW);
  assertEquals([off.note, off.unconfirmed, off.second_start], ['differ', 1, game.start_utc + 30 * 60e3]);
  assertEquals(compare(game, ev({ strTimestamp: null, strTime: null }), NOW).note, 'notime');
  assertEquals(compare(game, ev({ strPostponed: 'yes' }), NOW).note, 'postponed');
  assertEquals(compare(game, null, NOW).note, 'nomatch');
  // TheSportsDB's 00:00 placeholder isn't a real time, unless ESPN says midnight too.
  assertEquals(tsdbStart({ strTimestamp: '2026-10-24T00:00:00' }, Date.UTC(2026, 9, 24, 14)), null);
  assertEquals(tsdbStart({ strTimestamp: '2026-10-26T00:20:00' }, Date.UTC(2026, 9, 26, 0, 20)), Date.UTC(2026, 9, 26, 0, 20));
});

// A fake TheSportsDB: answers searches and lookups with one event whose time we choose.
const fakeTsdb = (when) => {
  const log = [];
  const fn = async (url) => {
    log.push(url.replace(/^.*\/123\//, ''));
    const e = ev({ strTimestamp: when() === null ? null : new Date(when()).toISOString().slice(0, 19) });
    return new Response(JSON.stringify(url.includes('searchevents') ? { event: [e] } : { events: [e] }));
  };
  return { fn, log };
};
const env = () => ({ DB: fakeD1() });
const row = async (e, id = game.id) => (await e.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first());

Deno.test('a disagreement makes the game "Time unconfirmed" in the feed, and iOS is told (seq, updated_at)', async () => {
  const e = env();
  await upsert(e, [game], NOW - H);
  let tsdbTime = game.start_utc + 30 * 60e3;
  const t = fakeTsdb(() => tsdbTime);
  const res = await secondRun(e, () => true, NOW, { gap: 0, fetchFn: t.fn });
  assertEquals([res.calls, res.checked], [1, 1]);
  assert(t.log[0].startsWith('searchevents.php?e=Brighton_and_Hove_Albion_vs_Manchester_United&d='));
  let r = await row(e);
  assertEquals([r.unconfirmed, r.second_note, r.tsdb_id, r.seq, r.updated_at], [1, 'differ', '2494100', 1, NOW]);
  const ics = calendar([r], { now: NOW }).replace(/\r\n /g, '');
  assert(ics.includes("Time unconfirmed: TheSportsDB says"), 'feed note missing');

  // A day later they agree: back to confirmed, and iOS is told again. Lookup by id this time.
  tsdbTime = game.start_utc;
  await secondRun(e, () => true, NOW + 25 * H, { gap: 0, fetchFn: t.fn });
  r = await row(e);
  assertEquals([r.unconfirmed, r.second_note, r.seq, r.updated_at], [0, 'agree', 2, NOW + 25 * H]);
  assert(t.log[1].startsWith('lookupevent.php?id=2494100'));
});

Deno.test('ESPN moving to the second source\'s time clears "unconfirmed" at once, and asks for a fresh check', async () => {
  const e = env();
  await upsert(e, [game], NOW - H);
  await secondRun(e, () => true, NOW, { gap: 0, fetchFn: fakeTsdb(() => game.start_utc + 30 * 60e3).fn });
  assertEquals((await row(e)).unconfirmed, 1);
  await upsert(e, [{ ...game, start_utc: game.start_utc + 30 * 60e3 }], NOW + 10 * 60e3);
  const r = await row(e);
  assertEquals([r.unconfirmed, r.second_checked_at, r.prev_start, r.seq], [0, 0, game.start_utc, 2]);
});

Deno.test('an agreeing check changes nothing iOS must fetch', async () => {
  const e = env();
  await upsert(e, [game], NOW - H);
  await secondRun(e, () => true, NOW, { gap: 0, fetchFn: fakeTsdb(() => game.start_utc).fn });
  const r = await row(e);
  assertEquals([r.unconfirmed, r.second_note, r.seq, r.updated_at], [0, 'agree', 0, NOW - H]);
});

Deno.test('budget: at most 3 calls a run, games inside 3 hours first, 429 stops the run', async () => {
  const e = env();
  const later = { ...game, id: 'later', start_utc: NOW + 5 * 24 * H }, soon = { ...game, id: 'soon', start_utc: NOW + 2 * H };
  await upsert(e, [later, soon, { ...game, id: 'third' }], NOW - H);
  const none = async (url) => new Response(JSON.stringify(url.includes('searchevents') ? { event: null } : { events: null }));
  const res = await secondRun(e, () => true, NOW, { gap: 0, fetchFn: none });
  assertEquals(res.calls, 2, 'a search that misses tries both ways round, then stops: 1 call left is not enough for another search');
  assertEquals((await row(e, 'soon')).second_note, 'nomatch');
  assertEquals((await row(e, 'third')).second_note, null);
  const busy = await secondRun(e, () => true, NOW, { gap: 0, fetchFn: async () => new Response('', { status: 429 }) });
  assertEquals([busy.checked, busy.note], [0, 'TheSportsDB busy (429)']);
});

Deno.test('ESPN moving away from an agreed time makes it "unconfirmed", and the match page note says so too', async () => {
  const e = env();
  await upsert(e, [game], NOW - H);
  await secondRun(e, () => true, NOW, { gap: 0, fetchFn: fakeTsdb(() => game.start_utc).fn });
  assertEquals((await row(e)).second_note, 'agree');
  await upsert(e, [{ ...game, start_utc: game.start_utc + 60 * 60e3 }], NOW + 10 * 60e3);
  const r = await row(e);
  assertEquals([r.unconfirmed, r.second_note, r.second_start, r.second_checked_at], [1, 'differ', game.start_utc, 0]);
});

Deno.test('ESPN marking a game postponed clears "unconfirmed" (the title already says POSTPONED)', async () => {
  const e = env();
  await upsert(e, [game], NOW - H);
  await secondRun(e, () => true, NOW, { gap: 0, fetchFn: fakeTsdb(() => game.start_utc + 30 * 60e3).fn });
  await upsert(e, [{ ...game, status: 'postponed' }], NOW + 10 * 60e3);
  const r = await row(e);
  assertEquals([r.unconfirmed, r.second_note], [0, null]);
});

Deno.test('a disagreement is checked again after 3 hours, not a day', () => {
  assert(secondDue({ ...game, unconfirmed: 1, second_checked_at: NOW - 3.1 * H }, NOW));
  assert(!secondDue({ ...game, unconfirmed: 1, second_checked_at: NOW - 2 * H }, NOW));
});

Deno.test('team names: club prefixes and numbers drop, a place may be added, other teams never match', async () => {
  const { sameTeam } = await import('../worker/src/second.js');
  for (const [a, b] of [['VfB Stuttgart', 'Stuttgart'], ['1. FC Union Berlin', 'Union Berlin'], ['SC Paderborn 07', 'Paderborn'], ['AS Roma', 'Roma'],
    ['Hamburg SV', 'Hamburg'], ['TSG Hoffenheim', 'Hoffenheim'], ['Athletic Club', 'Athletic Bilbao'], ['Racing Santander', 'Racing de Santander'],
    ['Brighton & Hove Albion', 'Brighton and Hove Albion'], ['Atlético Madrid', 'Atletico Madrid']]) assert(sameTeam(a, b), `${a} = ${b}`);
  for (const [a, b] of [['Stuttgart', 'Stuttgart Women'], ['Manchester United', 'Manchester City'], ['Real Madrid', 'Atlético Madrid'],
    ['Barcelona', 'Barcelona B'], ['Arsenal', 'Arsenal U21'], ['Bayern Munich', 'Bayern Munich II'], ['Athletic Club', 'Atlético Madrid']]) assert(!sameTeam(a, b), `${a} ≠ ${b}`);
});

Deno.test('searches: full name, then short name, then the other way round; aliases first', async () => {
  const { searches } = await import('../worker/src/second.js');
  assertEquals(searches({ home_full: 'FC Augsburg', away_full: '1. FC Union Berlin' }),
    ['FC_Augsburg_vs_1._FC_Union_Berlin', 'Augsburg_vs_Union_Berlin', '1._FC_Union_Berlin_vs_FC_Augsburg']);
  assertEquals(searches({ home_full: 'Racing Santander', away_full: 'Espanyol' })[0], 'Racing_de_Santander_vs_Espanyol');
  assertEquals(searches({ home_full: 'Arsenal', away_full: 'Everton' }), ['Arsenal_vs_Everton', 'Everton_vs_Arsenal']);
});

Deno.test('a saved id that now answers with another game is forgotten, and the game is searched next run', async () => {
  const e = env();
  await upsert(e, [game], NOW - H);
  await e.DB.prepare("UPDATE games SET tsdb_id = '999' WHERE id = ?").bind(game.id).run();
  const res = await secondRun(e, () => true, NOW, { gap: 0, fetchFn: fakeTsdb(() => game.start_utc).fn });
  let r = await row(e);
  assertEquals([res.calls, res.checked, r.tsdb_id, r.second_note], [1, 0, null, null]);
  await secondRun(e, () => true, NOW, { gap: 0, fetchFn: fakeTsdb(() => game.start_utc).fn });
  r = await row(e);
  assertEquals([r.tsdb_id, r.second_note], ['2494100', 'agree']);
});
