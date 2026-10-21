// Matchday calendar helper: the subscribed calendar feed, a small API for the app, and the 2-minute check.
import { calendar } from '../../js/ics.js';
import { reasonsWith } from '../../js/rules.js';
import { syncRun, inCal, tracked, readMeta } from './sync.js';
import { tvLines } from './tv.js';

const DAY = 864e5;
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

// The API answers only the Matchday app (and localhost while testing).
function cors(req, env) {
  const o = req.headers.get('origin') || '';
  const ok = o === env.APP_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  return ok ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', vary: 'origin' } : {};
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

const owner = (env) => env.DB.prepare('SELECT * FROM owner WHERE id = 1').first();
async function authed(req, env) {
  const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const o = await owner(env);
  return o && key && o.edit_key_hash === (await sha256(key)) ? o : null;
}
const readPicks = async (env) => JSON.parse((await env.DB.prepare('SELECT json FROM picks WHERE id = 1').first())?.json || '{}');
const feedUrl = (req, token) => `${new URL(req.url).origin}/cal/${token}.ics`;

// The calendar file, built fresh from the database on every request and never cached.
async function feed(token, req, env, ctx) {
  const o = await owner(env);
  if (!o || o.feed_token !== token) return new Response('Not found', { status: 404 });
  const now = Date.now();
  const picks = await readPicks(env);
  const prefs = picks.prefs || { free: {}, rules: {} };
  const rows = ((await env.DB.prepare('SELECT * FROM games WHERE start_utc >= ?').bind(now - 7 * DAY).all()).results || []).filter((r) => inCal(r, picks.cal));
  const games = rows.map((r) => ({
    ...r,
    tv: tvLines(r, picks.markets),
    why: reasonsWith({ timeValid: !!r.time_valid, date: r.start_utc, sport: r.sport, country: r.country, usTV: JSON.parse(r.us_tv || '[]'), postseason: !!r.postseason, note: r.note }, prefs).join(' · '),
  }));
  ctx.waitUntil(env.DB.prepare('INSERT INTO fetches (at, ua) VALUES (?, ?)').bind(now, (req.headers.get('user-agent') || '').slice(0, 200)).run());
  return new Response(calendar(games, { now, name: env.CAL_NAME || 'Matchday' }), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'content-disposition': 'inline; filename="matchday.ics"' },
  });
}

// What the app shows: when the iPhone last fetched, when times were last checked, and changes not yet fetched.
async function status(req, env, o) {
  const now = Date.now();
  const picks = await readPicks(env);
  const last = await env.DB.prepare('SELECT at, ua FROM fetches ORDER BY at DESC LIMIT 1').first();
  const lastRun = await env.DB.prepare('SELECT at, ok, note FROM runs ORDER BY at DESC LIMIT 1').first();
  const lastOk = (await env.DB.prepare('SELECT MAX(at) AS at FROM runs WHERE ok = 1').first())?.at || null;
  const rows = ((await env.DB.prepare('SELECT id, path, sport, home, away, home_id, away_id, start_utc, time_valid, status, prev_start, moved_at, updated_at, checked_at, unconfirmed, second_start, second_note, second_checked_at FROM games WHERE start_utc >= ?')
    .bind(now - 3 * 3600e3).all()).results || []).filter((r) => inCal(r, picks.cal));
  const pending = rows.filter((r) => !last || r.updated_at > last.at).sort((a, b) => a.start_utc - b.start_utc)
    .map(({ id, path, sport, home, away, start_utc, time_valid, status: st, prev_start }) => ({ id, path, sport, home, away, start_utc, time_valid, status: st, prev_start }));
  return {
    feedUrl: feedUrl(req, o.feed_token), games: rows.length, lastFetch: last || null, lastCheck: lastOk, lastRun: lastRun || null,
    ...health(await readMeta(env)),
    pending: last ? pending : [], checkedById: Object.fromEntries(rows.map((r) => [r.id, r.checked_at])),
    unconfirmed: rows.filter((r) => r.unconfirmed && r.start_utc > now).sort((a, b) => a.start_utc - b.start_utc)
      .map(({ id, path, sport, home, away, start_utc, second_start, second_note }) => ({ id, path, sport, home, away, start_utc, second_start, second_note })),
    // Second source per game: [note, checked at, its time]; note = agree | differ | postponed | notime | nomatch
    secondById: Object.fromEntries(rows.filter((r) => r.second_note).map((r) => [r.id, [r.second_note, r.second_checked_at, r.second_start]])), now,
  };
}

// The app's backup (TECH-DESIGN section 14): followed and calendar games in a window, in the app's own game shape
// (js/espn.js norm()), without colours or logos. GET /api/games?from=<ms>&to=<ms>, at most 15 days.
const STATE = { live: 'in', final: 'post' };
// Where the data stands (TECH-DESIGN 14.5, 14.9): when ESPN last answered, since when it has been failing
// (null while it answers), and the last good read from each backup source.
const health = (m) => ({
  espnOkAt: m.espn_ok_at || null, espnDownSince: (m.espn_down_since || 0) > (m.espn_ok_at || 0) ? m.espn_down_since : null,
  nflverseAt: m.nflverse_at || null, backupAt: m.backup_at || null,
});
export function gameOut(r) {
  const side = (h) => ({ id: r[`${h}_id`], abbr: r[`${h}_abbr`] || '', name: r[`${h}_full`] || r[h], short: r[h], score: r[`${h}_score`] ?? null, home: h === 'home' });
  return {
    id: r.id, path: r.path, sport: r.sport, date: new Date(r.start_utc).toISOString(), timeValid: !!r.time_valid,
    state: STATE[r.status] || 'pre', completed: r.status === 'final', postponed: r.status === 'postponed' || r.status === 'canceled',
    statusName: r.status_name || '', detail: r.detail || '', clock: r.clock || '', period: r.period || 0, src: r.source || 'espn',
    venue: (r.venue || '').split(', ')[0], country: r.country || '', postseason: !!r.postseason, note: r.note || '',
    usTV: JSON.parse(r.us_tv || '[]'), home: side('home'), away: side('away'),
  };
}
async function games(url, env) {
  const now = Date.now();
  const from = Number(url.searchParams.get('from')) || now - DAY, to = Math.min(Number(url.searchParams.get('to')) || now + 7 * DAY, from + 15 * DAY);
  const picks = await readPicks(env);
  const rows = ((await env.DB.prepare('SELECT * FROM games WHERE start_utc BETWEEN ?1 AND ?2 ORDER BY start_utc').bind(from, to).all()).results || [])
    .filter((r) => tracked(r, picks));
  return { at: now, ...health(await readMeta(env)), games: rows.map(gameOut) };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const m = url.pathname.match(/^\/cal\/([A-Za-z0-9_-]{30,})\.ics$/);
    if (m && (req.method === 'GET' || req.method === 'HEAD')) return feed(m[1], req, env, ctx);

    // Set-up: works once, while no owner exists. Returns the edit key (kept on the phone) and the feed link.
    if (url.pathname === '/api/claim' && req.method === 'POST') {
      if (await owner(env)) return json({ error: 'Already set up' }, 409, h);
      const key = randomToken(), token = randomToken();
      await env.DB.prepare('INSERT INTO owner (id, edit_key_hash, feed_token, created_at) VALUES (1, ?, ?, ?)').bind(await sha256(key), token, Date.now()).run();
      return json({ editKey: key, feedUrl: feedUrl(req, token) }, 200, h);
    }
    if (!url.pathname.startsWith('/api/')) return new Response('Matchday calendar helper', { status: 404 });

    const o = await authed(req, env);
    if (!o) return json({ error: 'Not allowed' }, 401, h);
    if (url.pathname === '/api/picks' && req.method === 'PUT') {
      const body = await req.json();
      const empty = { comps: [], teams: [], games: [] };
      // follow: what the app follows, tracked only for the app's backup (TECH-DESIGN 14). An older app sends none: keep the last.
      const old = body.follow ? null : await readPicks(env);
      const keep = { cal: body.cal || empty, follow: body.follow || old?.follow || empty, markets: body.markets || ['uk', 'us', 'sg'], prefs: body.prefs || null };
      await env.DB.prepare('INSERT INTO picks (id, json, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET json = ?1, updated_at = ?2').bind(JSON.stringify(keep), Date.now()).run();
      ctx.waitUntil(syncRun(env, { onlyDiscover: true }).catch(() => {})); // new picks reach the feed within a minute
      return json({ ok: true }, 200, h);
    }
    if (url.pathname === '/api/status' && req.method === 'GET') return json(await status(req, env, o), 200, h);
    if (url.pathname === '/api/games' && req.method === 'GET') return json(await games(url, env), 200, h);
    if (url.pathname === '/api/rotate' && req.method === 'POST') {
      const token = randomToken();
      await env.DB.prepare('UPDATE owner SET feed_token = ? WHERE id = 1').bind(token).run();
      return json({ feedUrl: feedUrl(req, token) }, 200, h);
    }
    if (url.pathname === '/api/run' && req.method === 'POST') return json(await syncRun(env), 200, h); // "check now"
    return json({ error: 'Unknown' }, 404, h);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncRun(env));
  },
};
