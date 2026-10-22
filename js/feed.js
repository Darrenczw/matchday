// FTLTG feeds: highlight clips and fan talk from Reddit, matched to your games (PRD-ftltg 7.4, 7.5).
// Live: the calendar helper reads Reddit's combined feeds (worker/src/reddit.js) and serves them at /api/fans;
// here they are matched to your games from the last three nights. A thread or clip is only ever shown on a game
// it was matched to: by ESPN's game id where Reddit carries it, else both teams' names and the time, and for a
// goal the minute and scorer against ESPN's own goals. NBA clips are ESPN's own, plus r/nba's highlights of plays ESPN
// didn't clip.
// If the helper can't be reached, the saved snapshot of real data (data/ftltg-snapshot.json) stands in, labelled.
import { summary, norm, isMine, gamesFor, isLive } from './espn.js';
import { load, save, picks, emit, sportOf } from './store.js';
import { clipList } from './clips.js';
import { CAL_API } from './cal.js';
import { subOf } from './subs.js';
import { addDays, todayKey, sg, ago } from './util.js';

const MIN = 60e3, HOUR = 60 * MIN;
let F = null; // { mode: 'live' | 'snapshot', at, threads, clips, teams, banter, resting }
export const feedMode = () => F?.mode || '';
export const snapAt = () => (F?.mode === 'snapshot' ? F.at : '');
export const feedAt = () => F?.at || 0;
export const resting = () => F?.resting || 0;
// The header line: how fresh the fan feeds are, or that this is the saved snapshot.
export function feedLabel() {
  if (!F) return '';
  if (F.mode === 'snapshot') { const s = sg(F.at); return `Snapshot · ${s.d} ${s.mo} ${s.hm}`; }
  return `Updated ${ago(F.at)}`;
}

let snapP = null;
const snapshot = () => (snapP ||= fetch('data/ftltg-snapshot.json').then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).catch((e) => { snapP = null; throw e; }));

// ---------- Names, for matching Reddit's titles to ESPN's teams.
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const namesOf = (t) => [...new Set([t.name, t.short, t.nickname].map(fold).map((n) => n.replace(/^(afc|fc|cf) | (fc|afc|cf)$/g, '')).filter((n) => n.length >= 4))];
const has = (title, t) => { const x = ` ${fold(title)} `; return namesOf(t).some((n) => x.includes(` ${n} `)); };
const SPORT = { soccer: 'soccer', nfl: 'football', nba: 'basketball' };
const surname = (s) => fold(s).split(' ').pop();
const minOf = (s) => parseInt(String(s).replace(/\+.*/, ''), 10);
export const redditId = (url) => String(url).match(/\/comments\/(\w+)/)?.[1] || '';

function kindOf(title) {
  const t = fold(title);
  if (/post (match|game) thread/.test(t)) return 'post';
  if (/pre (match|game) thread/.test(t)) return 'pre';
  if (/(match|game) thread/.test(t)) return 'match';
  return '';
}
// Which game a thread belongs to.
function threadGame(x, games) {
  const sport = SPORT[x.sub.toLowerCase()], at = new Date(x.at).getTime();
  const espnId = x.link?.match(/gameId\/(\d+)/)?.[1];
  if (espnId) return games.find((g) => g.id === espnId) || null;
  const c = games.filter((g) => g.sport === sport && has(x.title, g.home) && has(x.title, g.away))
    .filter((g) => { const d = at - new Date(g.date).getTime(); return d > -4 * HOUR && d < 16 * HOUR; });
  return c.sort((a, b) => Math.abs(at - new Date(a.date)) - Math.abs(at - new Date(b.date)))[0] || null;
}
// A goal clip: "Arsenal [1] - 0 Everton - Saka 23'" (the bracket marks who scored).
const GOAL = /^(.+?)\s+(\[?\d+\]?)\s*-\s*(\[?\d+\]?)\s+(.+?)\s+-\s+(.+?)\s+(\d+(?:\+\d+)?)'/;
function goalClip(x, games, via = `r/${x.sub}`) {
  const m = x.title.match(GOAL);
  if (!m || !x.src) return null;
  const [, a, sa, sb, b, who, min] = m, at = new Date(x.at).getTime();
  const g = games.find((y) => y.sport === 'soccer' && ((has(a, y.home) && has(b, y.away)) || (has(a, y.away) && has(b, y.home)))
    && at - new Date(y.date).getTime() > -10 * MIN && at - new Date(y.date).getTime() < 4 * HOUR);
  if (!g) return null;
  const aIsHome = has(a, g.home), scorerA = sa.startsWith('[');
  const team = (scorerA === aIsHome ? g.home : g.away).id;
  return { game: g.id, kind: 'goal', min: `${min}'`, team, who: who.trim(), title: x.title, src: x.src, poster: x.img || '', via, by: x.by, url: x.url, at: x.at };
}
// An NFL or NBA highlight ("[Highlight] Luka bounces a no-look pass to Kessler"): posted during the game or up to 5 hours
// after it started, naming one of its players. A full name wins; for the NBA a surname alone counts when only one
// game that night has a player by it.
const PLAYS = { nfl: 'football', nba: 'basketball' };
function playClip(x, games, people) {
  const sport = PLAYS[x.sub.toLowerCase()];
  if (!sport || !x.src) return null;
  const at = new Date(x.at).getTime(), t = ` ${fold(x.title)} `;
  const near = games.filter((g) => { const d = at - new Date(g.date).getTime(); return g.sport === sport && d > -15 * MIN && d < 5 * HOUR; });
  let hit = null;
  for (const g of near) { const p = (people.get(g.id) || []).find((q) => q.name && t.includes(` ${fold(q.name)} `)); if (p) { hit = { g, p }; break; } }
  if (!hit && sport === 'basketball') {
    const c = near.flatMap((g) => (people.get(g.id) || []).filter((q) => surname(q.name).length >= 4 && t.includes(` ${surname(q.name)} `)).map((p) => ({ g, p })));
    if (c.length && c.every((y) => y.g === c[0].g)) hit = c.sort((a, b) => t.indexOf(` ${surname(a.p.name)} `) - t.indexOf(` ${surname(b.p.name)} `))[0];
  }
  if (!hit) return null;
  return { game: hit.g.id, kind: 'play', min: '', team: hit.p.team, who: hit.p.name, title: x.title.replace(/^\[highlight\]\s*/i, ''), src: x.src, poster: x.img || '', via: `r/${x.sub}`, by: x.by, url: x.url, at: x.at };
}

// ---------- Loading: your games from the last three nights (and live ones), their summaries, and the helper's feeds.
let lastWant = '';
async function helperFeeds(subs, want, live) {
  const q = new URLSearchParams({ subs: subs.join(','), want, live: live ? '1' : '0' });
  const r = await fetch(`${CAL_API}/api/fans?${q}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const mySubs = () => [...new Set(picks.teams.map((t) => subOf(sportOf(t.path), t.name)).filter(Boolean))];

export async function feedGames() {
  try {
    const out = await liveFeed();
    if (out) return out;
  } catch (e) { console.warn('feed', e); }
  return snapshotFeed();
}

async function liveFeed() {
  if (!CAL_API) return null;
  const t = todayKey();
  const mine = await gamesFor(picks, { k0: addDays(t, -3), k1: t, live: true });
  const games = (mine.games || []).filter((g) => g.state !== 'pre' && !g.postponed).sort((a, b) => (b.state === 'in') - (a.state === 'in') || new Date(b.date) - new Date(a.date)).slice(0, 24);
  const subs = mySubs(), live = games.some(isLive);
  let j = await helperFeeds(subs, lastWant, live);
  if (!j || (!j.at && !(j.threads || []).length)) return null; // the helper hasn't read Reddit yet
  const sums = await Promise.allSettled(games.map((g) => summary(g.path, g.id, g.state === 'in')));
  const list = games.map((g, i) => {
    const d = sums[i].value;
    return { g: d?.header ? norm({ ...d.header, competitions: [{ ...d.header.competitions[0] }] }, g.path) || g : g, d };
  });
  const gs = list.map((x) => x.g);
  // Threads: matched to games; the one each game leads with is the one whose comments the helper keeps fresh.
  const threads = [];
  for (const x of j.threads || []) {
    const kind = kindOf(x.title), g = kind && threadGame(x, gs);
    if (g) threads.push({ game: g.id, kind, title: x.title, sub: `r/${x.sub}`, url: x.url, at: x.at, id: x.id, comments: [] });
  }
  const want = [];
  for (const x of list) {
    const ts = threads.filter((t) => t.game === x.g.id), lead = x.g.state === 'in' ? ts.find((t) => t.kind === 'match') : ts.find((t) => t.kind === 'post') || ts.find((t) => t.kind === 'match');
    if (lead) want.push(`${x.g.state === 'in' ? 'live' : 'post'}:${lead.id}`);
  }
  const w = want.join(',');
  if (w !== lastWant) { lastWant = w; j = (await helperFeeds(subs, w, live).catch(() => null)) || j; } // ask again, so comments come back
  for (const t of threads) t.comments = (j.comments?.[t.id] || []).map((c) => ({ by: c.by, text: c.text, at: c.at }));
  // Clips: goals from r/soccer, plays from r/nfl and r/nba. People in each NFL and NBA game, for naming a highlight's player.
  const people = new Map(list.filter((x) => x.g.sport === 'football' || x.g.sport === 'basketball').map((x) => [x.g.id, peopleOf(x.d)]));
  const clips = [...(j.goals || []).map((x) => goalClip(x, gs)), ...(j.plays || []).map((x) => playClip(x, gs, people))].filter(Boolean);
  await streamable(clips);
  // Games from before the helper started reading Reddit: the saved snapshot's checked clips and comments fill in.
  const snap = await snapshot().catch(() => null);
  if (snap) {
    const ids = new Set(gs.map((g) => g.id)), have = new Set(clips.map((c) => c.url));
    for (const c of snap.clips || []) if (ids.has(c.game) && !have.has(c.url)) clips.push(c);
    for (const t of snap.threads || []) {
      const mine = threads.find((x) => x.url === t.url || (x.game === t.game && x.kind === t.kind));
      if (mine && !mine.comments.length) mine.comments = t.comments;
      else if (!mine && ids.has(t.game)) threads.push({ ...t });
    }
  }
  // StreaMusk's fast copies of the same goal posts (same title): they replace a slow host's file, and goals Reddit
  // hasn't given us yet come in on their own. Reddit's own videos (v.redd.it) stay first.
  for (const m of (j.musk || []).map((x) => goalClip(x, gs, 'StreaMusk')).filter(Boolean)) {
    const twin = clips.find((c) => c.kind === 'goal' && c.game === m.game && (fold(c.title) === fold(m.title) || (minOf(c.min) === minOf(m.min) && c.team === m.team)));
    if (!twin) clips.push(m);
    else if (rank(twin) > 0) twin.src = m.src;
  }
  // Your teams: the helper's multi-feed, split back by subreddit.
  const teams = picks.teams.map((p) => ({ sport: sportOf(p.path), id: p.id, name: p.name, sub: subOf(sportOf(p.path), p.name) })).filter((x) => x.sub)
    .map((x) => ({ ...x, sub: `r/${x.sub}`, posts: (j.teams || []).filter((y) => y.sub.toLowerCase() === x.sub.toLowerCase()).map(postOut) }));
  F = { mode: 'live', at: j.at || Date.now(), resting: j.resting || 0, threads, clips, teams, banter: (j.banter || []).map((x) => ({ ...postOut(x), sub: `r/${x.sub}` })) };
  emit('feed');
  return list.filter((x) => isMine(x.g, picks));
}
const postOut = (x) => ({ title: x.title, by: x.by, at: x.at, url: x.url, img: x.img && !/default|self|nsfw/.test(x.img) ? x.img : '', text: x.text || '' });
function peopleOf(d) {
  const out = [];
  for (const t of d?.boxscore?.players || []) for (const s of t.statistics || []) for (const a of s.athletes || []) if (a.athlete?.displayName) out.push({ team: String(t.team?.id || ''), name: a.athlete.displayName });
  return out;
}
// Streamable's video links expire, so they are asked for when the clips load (streamable allows browser calls).
async function streamable(clips) {
  await Promise.allSettled(clips.filter((c) => c.src.startsWith('streamable:')).map(async (c) => {
    const j = await fetch(`https://api.streamable.com/videos/${c.src.slice(11)}`).then((r) => r.json());
    const u = j?.files?.mp4?.url || j?.files?.['mp4-mobile']?.url;
    c.src = u ? (u.startsWith('//') ? `https:${u}` : u) : '';
  }));
  for (let i = clips.length - 1; i >= 0; i--) if (!clips[i].src) clips.splice(i, 1);
}

async function snapshotFeed() {
  const s = await snapshot();
  F = { mode: 'snapshot', ...s };
  emit('feed');
  const res = await Promise.allSettled((s.games || []).map(async (x) => {
    const d = await summary(x.path, x.id);
    const g = d?.header ? norm({ ...d.header, competitions: [{ ...d.header.competitions[0] }] }, x.path) : null;
    return g && { g, d };
  }));
  const out = res.map((r) => r.value).filter(Boolean);
  out.sort((a, b) => (b.g.state === 'in') - (a.g.state === 'in') || new Date(b.g.date) - new Date(a.g.date));
  return out;
}
// Your games first. With none of them in the snapshot, the whole snapshot shows, and the screen says so.
export function mineFirst(list) {
  const mine = list.filter((x) => isMine(x.g, picks));
  return { list: mine.length ? mine : list, all: !mine.length };
}

// ---------- Moments: one per goal or scoring play, with its clip when there is one.
// Fastest first when several posts show the same goal (measured from SG, 22 Oct 2026): streams (Reddit's own, StreaMusk) start
// in ~0.03 s; streamin's files are 6–17 MB with the index at the end, so they wait for the end of the file.
const HOST = [/v\.redd\.it|\.m3u8|cloudfront\.net\/videos/, /clipse|hostedhost|streamable|cdn-cf-east/, /streamain|eraofsports/, /streamin/];
const rank = (c) => { const i = HOST.findIndex((re) => re.test(c.src)); return i < 0 ? 2 : i; };
export function moments(g, d) {
  const clips = (F?.clips || []).filter((c) => c.game === g.id && c.kind !== 'full' && c.src).sort((a, b) => rank(a) - rank(b));
  const used = new Set();
  const take = (fn) => { const c = clips.find((x) => !used.has(x) && fn(x)); if (c) used.add(c); return c || null; };
  let out = [];
  if (g.sport === 'soccer') {
    // Running score after each goal, from the home and away side.
    let h = 0, a = 0;
    out = (g.goals || []).slice().sort((x, y) => x.m - y.m).map((x, i) => {
      if (x.t === g.home.id) h++; else if (x.t === g.away.id) a++;
      const clip = take((c) => Math.abs(minOf(c.min) - x.m) <= 2 && (!c.team || c.team === x.t)) || take((c) => x.who && surname(c.who) === surname(x.who));
      return { key: `${g.id}:${i}`, team: x.t, label: `${x.m}'`, who: x.og ? 'Own goal' : x.who, ini: x.og ? 'OG' : initialsOf(x.who), h, a, clip };
    });
  } else if (g.sport === 'football') {
    out = (d?.scoringPlays || []).map((p, i) => {
      const who = (p.text || '').match(/^([A-Z][\w.'-]+(?: [A-Z][\w.'-]+)+?) \d/)?.[1] || '';
      const team = String(p.team?.id || '');
      const clip = take((c) => (!c.team || c.team === team) && who && (surname(c.who) === surname(who) || fold(c.title).includes(surname(who))));
      return { key: `${g.id}:${i}`, team, label: p.type?.abbreviation || 'TD', sub: `Q${p.period?.number || ''} ${p.clock?.displayValue || ''}`.trim(), who, ini: initialsOf(who), h: p.homeScore, a: p.awayScore, clip };
    });
  } else if (g.sport === 'basketball') {
    // ESPN's own NBA clips, and r/nba's highlights of other plays, together in the order they were posted. The player
    // is found in the box score, so the sticker gets his face and team. An r/nba post naming a player of an ESPN clip
    // posted within 8 minutes of it is the same play (ESPN's copy starts faster, see warm.js), so it's left out.
    const people = [];
    for (const t of d?.boxscore?.players || []) for (const s of t.statistics || []) for (const x of s.athletes || []) if (x.athlete?.displayName) people.push({ team: String(t.team?.id || ''), a: x.athlete });
    const first = (n) => fold(n).split(' ')[0];
    const named = (title) => {
      const t = ` ${fold(title)} `;
      return people.filter((x) => t.includes(` ${surname(x.a.displayName)} `) || t.includes(` ${fold(x.a.displayName)} `)
        || (first(x.a.displayName).length >= 4 && people.filter((y) => first(y.a.displayName) === first(x.a.displayName)).length === 1 && t.includes(` ${first(x.a.displayName)} `)))
        .sort((x, y) => t.indexOf(` ${surname(x.a.displayName)} `) - t.indexOf(` ${surname(y.a.displayName)} `));
    };
    const espn = clipList(d).filter((c) => c.dur <= 45).map((c) => {
      const ps = named(c.title), p = ps[0];
      const clip = { src: c.src, tall: c.tall, poster: c.poster, title: c.title, via: 'ESPN', by: '', at: c.t };
      return { key: `${g.id}:${c.id}`, team: p?.team || '', who: p?.a?.shortName || '', ini: initialsOf(p?.a?.displayName), athlete: p?.a || null, clip, title: c.title, t: Date.parse(c.t) || 0, ps };
    });
    for (const c of clips) {
      const ps = named(c.title);
      if (espn.some((e) => Math.abs(e.t - Date.parse(c.at)) < 8 * MIN && e.ps.some((p) => ps.includes(p)))) used.add(c);
    }
    const fans = clips.filter((c) => !used.has(c)).map((c) => {
      used.add(c);
      const p = named(c.title)[0] || people.find((x) => fold(x.a.displayName) === fold(c.who));
      return { key: `${g.id}:r:${c.url || c.src}`, team: c.team || p?.team || '', who: p?.a?.shortName || c.who, ini: initialsOf(p?.a?.displayName || c.who), athlete: p?.a || null, clip: c, title: c.title, t: Date.parse(c.at) || 0 };
    });
    out = [...espn, ...fans].sort((a, b) => a.t - b.t).map(({ ps, t, ...m }, i) => ({ ...m, label: String(i + 1) }));
  }
  // Clips that matched no moment are still this game's: after the moments, in the order they were posted.
  for (const c of clips) if (!used.has(c)) out.push({ key: `${g.id}:x:${c.src}`, team: c.team, label: c.min || '', who: c.who, ini: initialsOf(c.who), clip: c, extra: true });
  for (const m of out) if (m.clip && !m.clip.title && m.title) m.clip.title = m.title;
  return out;
}
export const fullHighlights = (g) => (F?.clips || []).find((c) => c.game === g.id && c.kind === 'full' && c.src) || null;
function initialsOf(name = '') {
  const w = String(name).replace(/\./g, '').split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() || '·';
}

// ---------- Watched clips, kept on this phone. Keyed by the clip's post (its video link can change).
const seen = new Set(load('clipSeen', []));
const seenKey = (c) => c?.url || c?.src;
export const isSeen = (c) => !!c && (seen.has(seenKey(c)) || seen.has(c.src));
export function markSeen(c) {
  if (!c || isSeen(c)) return;
  seen.add(seenKey(c));
  save('clipSeen', [...seen].slice(-600));
  emit('seen');
}

// ---------- Fan talk
export const threadsOf = (id) => (F?.threads || []).filter((t) => t.game === id);
export const threadById = (rid) => (F?.threads || []).find((t) => redditId(t.url) === rid) || null;
export function teamSubs() {
  const all = F?.teams || [];
  if (F?.mode === 'live') return { list: all, all: false };
  const mine = all.filter((t) => picks.teams.some((p) => sportOf(p.path) === t.sport && p.id === t.id));
  return { list: mine.length ? mine : all, all: !mine.length };
}
export const banter = () => F?.banter || [];
// A thread's top comments, fresh from the helper (it reads Reddit at most every few seconds, for everyone).
export async function threadComments(rid) {
  if (F?.mode !== 'live' || !CAL_API) return threadById(rid)?.comments || [];
  const r = await fetch(`${CAL_API}/api/thread/${rid}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (j.comments || []).map((c) => ({ by: c.by, text: c.text, at: c.at }));
}

// "3 clips · thread" for a finished game on My games.
export function badge(id) {
  if (!F) return '';
  const n = (F.clips || []).filter((c) => c.game === id && c.kind !== 'full').length;
  const t = (F.threads || []).some((x) => x.game === id);
  return [n ? `${n} clip${n > 1 ? 's' : ''}` : '', t ? 'thread' : ''].filter(Boolean).join(' · ');
}
