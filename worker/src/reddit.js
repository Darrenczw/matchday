// FTLTG fan feeds (PRD-ftltg 7.4, 7.5): Reddit's public RSS, read here because the app can't (Reddit sends no
// CORS header) and so one copy serves every phone. Reddit blocks cloud addresses that ask too much (22 Oct 2026:
// blocked after ~25 requests six seconds apart), so this asks little (Darren chose "route 1", 22 Oct 2026):
// - a few combined feeds: every match/game thread of r/soccer, r/nfl and r/nba in one search, all followed teams'
//   subreddits in one multi-feed, banter from all three in one feed, goal clips in two searches;
// - its own 2-minute run on the odd minutes, one Reddit request at most every 4 minutes (about 15 an hour). Tested
//   from the practice helper (22 Oct 2026): a request every 2 minutes alternated 200 and 429, because many Workers
//   share Cloudflare's addresses; one every 4 minutes keeps clear of it;
// - threads and clips are kept for 3 days (each read is merged with what's saved), so "today" searches are enough;
// - comments only for threads an app asked for, faster while a followed game is live;
// - after a 429 (slow down) it pauses 5 minutes, after a 403 (blocked) 30 minutes; the app shows what it already has.
const R = 'https://www.reddit.com';
const UA = 'web:ftltg:0.1 (personal sports app; github.com/Darrenczw/matchday)';
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const PER_RUN = 1, GAP = 6000, REST = 30 * MIN, SLOW = 5 * MIN, SPACING = 3.5 * MIN, KEEP = 3 * DAY;

// Built-in feeds and how often each refreshes: [while a followed game is live, otherwise].
const FEEDS = {
  threads: { url: `${R}/r/soccer+nfl+nba/search.rss?q=${encodeURIComponent('title:"match thread" OR title:"game thread"')}&restrict_sr=on&sort=new&t=day&limit=60`, every: [6 * MIN, 15 * MIN] },
  goals: { url: `${R}/r/soccer/search.rss?q=flair%3Amedia&restrict_sr=on&sort=new&t=day&limit=100`, every: [4 * MIN, 20 * MIN] },
  plays: { url: `${R}/r/nba+nfl/search.rss?q=title%3Ahighlight&restrict_sr=on&sort=new&t=day&limit=100`, every: [6 * MIN, 30 * MIN] },
  banter: { url: `${R}/r/soccer+nfl+nba/top/.rss?t=day&limit=30`, every: [45 * MIN, 30 * MIN] },
};

// ---------- Reading Reddit's Atom feeds: just the fields the app shows.
const unesc = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const strip = (html) => unesc(unesc(html).replace(/<!--.*?-->/gs, '').replace(/<br\s*\/?>|<\/p>/g, '\n').replace(/<[^>]+>/g, ''))
  .replace(/\[link\]|\[comments\]/g, '').replace(/submitted by\s+\/u\/\S+(\s+to\s+r\/\S+)?/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const pick = (e, re) => e.match(re)?.[1] || '';
export function parse(xml, { comments = false } = {}) {
  const out = [];
  for (const [, e] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const raw = pick(e, /<content type="html">([\s\S]*?)<\/content>/);
    const links = [...unesc(raw).matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => unesc(m[1]));
    const by = pick(e, /<name>\/?(u\/[^<]+)<\/name>/);
    const x = {
      id: pick(e, /<id>t[13]_(\w+)<\/id>/), title: unesc(pick(e, /<title>([\s\S]*?)<\/title>/)), by,
      sub: pick(e, /<category term="([^"]+)"/), at: pick(e, /<published>([^<]+)<\/published>/) || pick(e, /<updated>([^<]+)<\/updated>/),
      url: unesc(pick(e, /<link href="([^"]+)"/)),
    };
    if (comments) {
      x.text = strip(raw).slice(0, 600);
      if (!x.text || /^u\/AutoModerator$/i.test(by) || /^\[(deleted|removed)\]$/.test(x.text)) continue;
    } else {
      x.link = links.find((h) => !/reddit\.com|redd\.it\/?$|redditmedia/.test(h) || /v\.redd\.it/.test(h)) || '';
      x.img = unesc(pick(e, /<media:thumbnail url="([^"]+)"/));
      x.text = strip(raw.replace(/<table[\s\S]*?<\/table>/g, '')).slice(0, 300);
      if (/\bnsfw\b/i.test(x.title)) continue;
    }
    out.push(x);
  }
  return out;
}

// ---------- Clip hosts: where the video file is (spike, 22 Oct 2026). v.redd.it and streamff need no fetch;
// streamable links expire, so the app asks streamable itself when it plays one.
function srcFor(link) {
  let m;
  if ((m = link.match(/v\.redd\.it\/(\w+)/))) return `https://v.redd.it/${m[1]}/HLSPlaylist.m3u8`;
  if ((m = link.match(/streamable\.com\/(?:e\/)?(\w+)/))) return `streamable:${m[1]}`;
  if ((m = link.match(/streamff\.(?:pro|com|link)\/v\/(\w+)/))) return `https://cdn.hostedhost.top/${m[1]}.mp4`;
  return '';
}
const PAGE = [/streamin\.(?:link|me|one)\/v\/\w+/, /clipse\.cloud\/v\/\w+/, /streama\.in\/\w+/, /streamain\.com\/(?:embed\/)?\w+/];
async function resolve(link) {
  let u = link;
  const sa = link.match(/streama(?:\.in|in\.com)\/(?:embed\/)?(\w+)/);
  if (sa) u = `https://streamain.com/embed/${sa[1]}`;
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (FTLTG personal app)' }, redirect: 'follow' });
  if (!r.ok) return '';
  const t = (await r.text()).slice(0, 200e3);
  return unesc(t.match(/property="og:video(?::url)?"\s+content="([^"]+\.mp4[^"]*)"/)?.[1] || t.match(/data-link="([^"]+\.mp4[^"]*)"/)?.[1] || t.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/)?.[1] || '');
}
const isGoal = (t) => /\[\d+\]\s*-\s*\d+|\d+\s*-\s*\[\d+\]/.test(t);

// ---------- Storage (D1, migrate-5.sql): rfeeds holds each feed's items; rwant the subreddits and threads apps asked for.
const meta = async (env, k) => (await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(k).first())?.value;
const setMeta = (env, k, v) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2').bind(k, String(v)).run();
async function readFeed(env, key) {
  const r = await env.DB.prepare('SELECT * FROM rfeeds WHERE key = ?').bind(key).first();
  return r ? { ...r, items: JSON.parse(r.body || '[]') } : null;
}
const writeFeed = (env, key, items, next) => env.DB.prepare('INSERT INTO rfeeds (key, at, next_at, body, err) VALUES (?1, ?2, ?3, ?4, NULL) ON CONFLICT(key) DO UPDATE SET at = ?2, next_at = ?3, body = ?4, err = NULL')
  .bind(key, Date.now(), next, JSON.stringify(items)).run();

async function get(env, url) {
  await setMeta(env, 'reddit_last', Date.now());
  const r = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/atom+xml' } });
  const t = await r.text();
  if (r.status === 403 || r.status === 429 || !/^\s*<\?xml/.test(t)) {
    await setMeta(env, 'reddit_rest_until', Date.now() + (r.status === 429 ? SLOW : REST));
    await setMeta(env, 'reddit_err', `${r.status} at ${new Date().toISOString()}`);
    throw new Error(`reddit ${r.status}`);
  }
  return t;
}

// What is due, oldest first: the built-in feeds, the followed teams' multi-feed, and wanted threads' comments.
async function due(env, now, live) {
  const want = (await env.DB.prepare('SELECT key, kind, seen_at FROM rwant WHERE seen_at > ?').bind(now - 3 * DAY).all()).results || [];
  const subs = want.filter((w) => w.kind === 'sub').map((w) => w.key.slice(2)).sort();
  const jobs = Object.entries(FEEDS).map(([key, f]) => ({ key, url: f.url, every: f.every[live ? 0 : 1] }));
  if (subs.length) jobs.push({ key: 'teams', url: `${R}/r/${subs.slice(0, 60).join('+')}/top/.rss?t=day&limit=80`, every: live ? 45 * MIN : 30 * MIN, subs });
  // Comments: a live thread every 6 minutes, a post-match thread every 30, other opened threads hourly.
  for (const w of want.filter((x) => x.kind === 'live' || x.kind === 'post' || x.kind === 'thread')) {
    if (now - w.seen_at > DAY) continue;
    jobs.push({ key: w.key, url: `${R}/comments/${w.key.slice(2)}/.rss?sort=top&limit=25`, every: w.kind === 'live' ? 6 * MIN : w.kind === 'post' ? 30 * MIN : HOUR, comments: true });
  }
  const have = new Map(((await env.DB.prepare('SELECT key, at FROM rfeeds').all()).results || []).map((r) => [r.key, r.at]));
  return jobs.map((j) => ({ ...j, at: have.get(j.key) || 0 })).filter((j) => now - j.at >= j.every).sort((a, b) => a.at - b.at);
}

// The odd-minute run.
export async function redditRun(env) {
  const now = Date.now();
  if (+(await meta(env, 'reddit_rest_until') || 0) > now) return { rested: true };
  if (now - +(await meta(env, 'reddit_last') || 0) < SPACING) return { spaced: true };
  const live = +(await meta(env, 'fans_live_until') || 0) > now;
  const jobs = (await due(env, now, live)).slice(0, PER_RUN);
  const done = [];
  for (const [i, j] of jobs.entries()) {
    if (i) await new Promise((r) => setTimeout(r, GAP));
    try {
      const xml = await get(env, j.url);
      let items = parse(xml, { comments: !!j.comments });
      if (j.comments) items = items.slice(1); // the first entry is the post itself
      if (j.key === 'goals' || j.key === 'plays') items = await withSrc(env, j.key, j.key === 'goals' ? items.filter((x) => isGoal(x.title)) : items.filter((x) => /^\[highlight\]/i.test(x.title)));
      if (j.key === 'threads' || j.key === 'goals' || j.key === 'plays') items = await merged(env, j.key, items, now);
      await writeFeed(env, j.key, items, now + j.every);
      done.push(`${j.key}:${items.length}`);
    } catch (e) {
      await env.DB.prepare("INSERT INTO rfeeds (key, at, next_at, body, err) VALUES (?1, 0, 0, '[]', ?2) ON CONFLICT(key) DO UPDATE SET err = ?2").bind(j.key, String(e.message || e)).run();
      done.push(`${j.key}:err`);
      break; // a block or a limit: stop this run
    }
  }
  return { done };
}
// New items first, then saved ones not in this read, back to 3 days.
async function merged(env, key, items, now) {
  const ids = new Set(items.map((x) => x.id));
  const old = ((await readFeed(env, key))?.items || []).filter((x) => !ids.has(x.id) && now - new Date(x.at).getTime() < KEEP);
  return [...items, ...old].slice(0, 400);
}
// Video files for clip posts. Known ones carry over from the last read; at most 4 new page look-ups a run.
async function withSrc(env, key, items) {
  const old = new Map(((await readFeed(env, key))?.items || []).map((x) => [x.id, x.src]));
  let budget = 4;
  for (const x of items) {
    x.src = old.get(x.id) || srcFor(x.link);
    if (!x.src && budget > 0 && PAGE.some((re) => re.test(x.link))) { budget--; x.src = await resolve(x.link).catch(() => ''); }
  }
  return items.filter((x) => x.src || PAGE.some((re) => re.test(x.link)));
}

// ---------- The app's view: GET /api/fans?subs=Gunners,Thunder&want=post:1xbz51m,live:1abcd&live=1
// Public Reddit content only, so no edit key is needed (friends without a calendar get it too).
export async function fans(url, env) {
  const now = Date.now(), p = url.searchParams;
  const subs = (p.get('subs') || '').split(',').map((s) => s.trim()).filter((s) => /^\w{2,21}$/.test(s)).slice(0, 40);
  const want = (p.get('want') || '').split(',').map((s) => s.split(':')).filter(([k, id]) => /^(live|post|thread)$/.test(k) && /^\w{4,10}$/.test(id || '')).slice(0, 30);
  if (p.get('live') === '1') await setMeta(env, 'fans_live_until', now + 10 * MIN);
  // Remember what was asked for (once an hour per item, to keep database writes low).
  const seen = new Map(((await env.DB.prepare('SELECT key, seen_at FROM rwant').all()).results || []).map((r) => [r.key, r.seen_at]));
  const asks = [...subs.map((s) => [`s:${s}`, 'sub']), ...want.map(([k, id]) => [`t:${id}`, k])].filter(([key]) => now - (seen.get(key) || 0) > HOUR);
  if (asks.length) await env.DB.batch(asks.map(([key, kind]) => env.DB.prepare('INSERT INTO rwant (key, kind, seen_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET kind = ?2, seen_at = ?3').bind(key, kind, now)));
  const rows = ((await env.DB.prepare('SELECT * FROM rfeeds').all()).results || []);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const items = (k) => JSON.parse(by[k]?.body || '[]');
  const lower = new Set(subs.map((s) => s.toLowerCase()));
  const comments = {};
  for (const [, id] of want) if (by[`t:${id}`]) comments[id] = items(`t:${id}`).slice(0, 15);
  const rest = +(await meta(env, 'reddit_rest_until') || 0);
  return {
    at: Math.max(0, ...rows.filter((r) => !r.key.startsWith('t:')).map((r) => r.at || 0)),
    resting: rest > now ? rest : 0,
    threads: items('threads'), goals: items('goals'), plays: items('plays'), banter: items('banter'),
    teams: items('teams').filter((x) => lower.has(x.sub.toLowerCase())), comments,
  };
}

// GET /api/thread/<id>: one thread's top comments, read now if the copy is missing or 10 minutes old and Reddit
// was last asked at least 20 seconds ago; otherwise the saved copy (and the next run fetches it).
export async function thread(id, env) {
  const now = Date.now(), key = `t:${id}`;
  const f = await readFeed(env, key);
  const rest = +(await meta(env, 'reddit_rest_until') || 0) > now, last = +(await meta(env, 'reddit_last') || 0);
  if ((!f || now - f.at > 10 * MIN) && !rest && now - last > 20e3) {
    try {
      const items = parse(await get(env, `${R}/comments/${id}/.rss?sort=top&limit=25`), { comments: true });
      await writeFeed(env, key, items.slice(1), now + HOUR);
      await env.DB.prepare('INSERT INTO rwant (key, kind, seen_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET seen_at = ?3').bind(key, 'thread', now).run();
      return { at: now, post: items[0] || null, comments: items.slice(1, 16) };
    } catch { /* fall through to the saved copy */ }
  }
  return { at: f?.at || 0, post: null, comments: (f?.items || []).slice(0, 15), resting: rest };
}
