// ESPN public feed: fetching, caching and turning events into one simple game shape.
// Unofficial and undocumented (PRD 9). Called only from this phone, at low volume.
import { sg, addDays, keyRange, ymd, todayKey } from './util.js';
import { hex, compLogo, regionOf, setTeamHook } from './identity.js';
import { load, save, emit, sportOf, teamKey } from './store.js';
import { NICE } from './names.js';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const V2 = 'https://site.api.espn.com/apis/v2/sports';
const MIN = 60e3, HOUR = 3600e3;

// ---------- Fetch with a short memory cache. The service worker keeps the last copy for offline use
// and marks it with "x-md-cached", so the app can say how old the data is.
export const net = { lastOk: load('lastOk', 0), offline: false, staleSince: 0 };
const mem = new Map();
export function get(url, maxAge = MIN) {
  const c = mem.get(url);
  if (c && Date.now() - c.t < maxAge) return c.p;
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cached = r.headers.get('x-md-cached');
    if (cached) { net.offline = true; net.staleSince = net.staleSince ? Math.min(net.staleSince, +cached) : +cached; }
    else { net.offline = false; net.staleSince = 0; net.lastOk = Date.now(); save('lastOk', net.lastOk); }
    return r.json();
  }).catch((e) => { mem.delete(url); net.offline = true; throw e; });
  mem.set(url, { t: Date.now(), p });
  return p;
}

// ---------- Team identity memory: colours and logos, so schedule-only games still wear their kit.
const ids = load('ids', {});
let saveTimer = 0;
function remember(sport, t) {
  const k = `${sport}:${t.id}`, old = ids[k];
  if (old && old.color === t.color && old.logo === t.logo) return;
  ids[k] = { color: t.color, alt: t.alt, logo: t.logo, logoDark: t.logoDark, abbr: t.abbr, name: t.name, short: t.short };
  clearTimeout(saveTimer); saveTimer = setTimeout(() => save('ids', ids), 800);
}
const filling = new Set();
function fill(sport, id) {
  const k = `${sport}:${id}`;
  if (filling.has(k)) return;
  filling.add(k);
  coreTeam(sport, id).then((t) => { if (t?.color) emit('ids'); }).catch(() => filling.delete(k));
}
// Games are built once but drawn many times: fill in colours and logos that arrived later.
function hydrate(t, sport) {
  if (!t || t.color) return;
  const k = ids[`${sport}:${t.id}`];
  if (k?.color) { t.color = k.color; t.alt = k.alt; t.logo ||= k.logo; t.logoDark ||= k.logoDark; }
  else if (t.id) fill(sport, t.id);
}
setTeamHook((g) => { hydrate(g.home, g.sport); hydrate(g.away, g.sport); });

function teamFrom(x, sport) {
  const T = x.team || x;
  const logos = T.logos || [];
  const k = ids[`${sport}:${T.id}`] || {};
  const t = {
    id: String(T.id), abbr: T.abbreviation || k.abbr || '', name: T.displayName || T.name || k.name || '',
    short: T.shortDisplayName || (sport !== 'soccer' && T.name) || T.displayName || k.short || '', nickname: T.nickname || '',
    color: hex(T.color) || k.color || null, alt: hex(T.alternateColor) || k.alt || null,
    logo: T.logo || logos.find((l) => l.rel?.includes('default'))?.href || logos[0]?.href || k.logo || '',
    logoDark: logos.find((l) => l.rel?.includes('dark'))?.href || k.logoDark || '',
    home: x.homeAway === 'home', score: typeof x.score === 'object' ? x.score?.displayValue : x.score, winner: !!x.winner,
    national: !!T.isNational,
  };
  if (hex(T.color)) remember(sport, t); else if (!t.color && T.id) fill(sport, t.id);
  return t;
}

// ---------- Competition names: short, as people say them (NICE in names.js).
const leagues = load('leagues', {}); // path -> { name, logoId }
export function compInfo(path) {
  if (path === 'football/nfl') return { path, name: 'NFL', logo: compLogo(path) };
  if (path === 'basketball/nba') return { path, name: 'NBA', logo: compLogo(path) };
  const slug = path.split('/')[1], L = leagues[path] || {};
  return { path, slug, name: NICE[slug] || L.name || slug, logo: compLogo(path, L.logoId), region: regionOf(slug) };
}
function noteLeague(path, L) {
  if (!L || !path.startsWith('soccer/')) return;
  const logoId = L.alternateId || (L.logos?.[0]?.href.match(/\/(\d+)\.png/) || [])[1];
  if (leagues[path]?.logoId === logoId) return;
  leagues[path] = { name: L.shortName || L.name, logoId };
  save('leagues', leagues);
}

// ---------- One game shape for scoreboards, team schedules and match summaries.
export function norm(e, path, src = 'sb') {
  const c = e.competitions?.[0] || e;
  if (e.league?.slug && path.startsWith('soccer/')) { path = `soccer/${e.league.slug}`; noteLeague(path, e.league); }
  const sport = sportOf(path);
  const st = c.status || e.status || {}, ty = st.type || {};
  const list = c.competitors || [];
  const H = list.find((x) => x.homeAway === 'home') || list[0], A = list.find((x) => x.homeAway === 'away') || list[1];
  if (!H || !A) return null;
  const tv = new Set();
  for (const b of c.broadcasts || []) {
    if (b.region && b.region !== 'us') continue;
    (b.names || []).forEach((n) => tv.add(n));
    if (b.media?.shortName) tv.add(b.media.shortName);
  }
  return {
    id: String(e.id || c.id), path, sport, league: path.split('/')[1], comp: compInfo(path), src,
    date: e.date || c.date, timeValid: e.timeValid !== false && c.timeValid !== false,
    state: ty.state || 'pre', completed: !!ty.completed, statusName: ty.name || '', detail: ty.shortDetail || ty.detail || '',
    clock: st.displayClock || '', period: st.period || 0,
    postponed: /POSTPONED|CANCELED|SUSPENDED|FORFEIT/.test(ty.name || ''),
    venue: c.venue?.fullName || '', city: c.venue?.address?.city || '', country: c.venue?.address?.country || '', neutral: !!c.neutralSite,
    home: teamFrom(H, sport), away: teamFrom(A, sport), usTV: [...tv],
    postseason: sport !== 'soccer' && (e.season?.type === 3 || e.seasonType?.type === 3 || String(e.seasonType?.id) === '3'),
    note: c.notes?.[0]?.headline || '',
  };
}

// Live label: "82'", "HT", "Q4 · 1:14".
export function liveLabel(g) {
  if (/HALFTIME/.test(g.statusName)) return 'Half time';
  if (/END_PERIOD/.test(g.statusName)) return g.detail;
  if (g.sport === 'soccer') return g.clock || g.detail;
  const q = g.period > 4 ? 'OT' : `Q${g.period}`;
  return g.clock ? `${q} · ${g.clock}` : g.detail;
}

// ---------- Loaders
// ESPN's "dates=" is a US date. A Singapore day spans that US date and the day before.
export async function day(path, usKey, live = false) {
  const past = usKey < addDays(todayKey(), -2);
  const d = await get(`${SITE}/${path}/scoreboard?dates=${ymd(usKey)}&limit=300`, past ? 6 * HOUR : live ? 8e3 : MIN);
  noteLeague(path, d.leagues?.[0]);
  return (d.events || []).map((e) => norm(e, path)).filter(Boolean);
}
// Days a football competition has games (skips empty days, e.g. Champions League midweeks only).
async function matchDays(path) {
  if (!path.startsWith('soccer/')) return null;
  try {
    const d = await get(`${SITE}/${path}/scoreboard`, 6 * HOUR);
    noteLeague(path, d.leagues?.[0]);
    const cal = d.leagues?.[0]?.calendar;
    if (!Array.isArray(cal) || typeof cal[0] !== 'string') return null;
    return new Set(cal.map((x) => x.slice(0, 10)));
  } catch { return null; }
}
export async function range(path, k0, k1, live = false) {
  const days = await matchDays(path);
  const keys = keyRange(addDays(k0, -1), k1).filter((k) => !days || days.has(k));
  const res = await Promise.allSettled(keys.map((k) => day(path, k, live && k >= addDays(todayKey(), -1))));
  if (res.length && res.every((r) => r.status === 'rejected')) throw res[0].reason;
  return res.flatMap((r) => r.value || []).filter((g) => { const k = sg(g.date).key; return k >= k0 && k <= k1; });
}
export async function schedule(path, id) {
  const sport = sportOf(path);
  if (sport === 'soccer') {
    const [a, b] = await Promise.allSettled([get(`${SITE}/soccer/all/teams/${id}/schedule?fixture=true`, 10 * MIN), get(`${SITE}/soccer/all/teams/${id}/schedule`, 10 * MIN)]);
    if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
    return [...(a.value?.events || []), ...(b.value?.events || [])].map((e) => norm(e, path, 'sched')).filter(Boolean);
  }
  const d = await get(`${SITE}/${path}/teams/${id}/schedule`, 10 * MIN);
  return (d.events || []).map((e) => norm(e, path, 'sched')).filter(Boolean);
}
// ESPN's site "teams" endpoints don't allow browser calls (no CORS header); the core API does.
const CORE = 'https://sports.core.api.espn.com/v2/sports';
const coreLeague = (sport) => (sport === 'soccer' ? 'soccer/leagues/all' : sport === 'football' ? 'football/leagues/nfl' : 'basketball/leagues/nba');
async function coreTeam(sport, id) {
  const T = await get(`${CORE}/${coreLeague(sport)}/teams/${id}`, 24 * HOUR);
  return teamFrom({ team: T }, sport);
}
// Team page header: core API for identity, the schedule feed for the table position or record.
export async function teamInfo(path, id) {
  const sport = sportOf(path);
  const [t, sched] = await Promise.all([coreTeam(sport, id), get(`${SITE}/${sport === 'soccer' ? 'soccer/all' : path}/teams/${id}/schedule`, 10 * MIN).catch(() => null)]);
  const T = sched?.team || {};
  return { ...t, standing: T.standingSummary || '', record: T.recordSummary || '' };
}
// Every team in a league or tournament, from its standings (which allow browser calls).
export async function leagueTeams(path) {
  const st = await standings(path);
  const seen = new Map();
  for (const g of st.groups) for (const r of g.rows) seen.set(r.team.id, r.team);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export const summary = (path, id, live = false) => get(`${SITE}/${path}/summary?event=${id}`, live ? 8e3 : MIN);

export async function standings(path) {
  const d = await get(`${V2}/${path}/standings`, 30 * MIN);
  const groups = (d.children?.length ? d.children : [d]).map((ch) => ({
    name: ch.name || '',
    rows: (ch.standings?.entries || []).map((en) => {
      const s = Object.fromEntries((en.stats || []).map((x) => [x.name, x]));
      const v = (n) => s[n]?.displayValue ?? '';
      const T = en.team;
      const team = teamFrom({ team: T }, sportOf(path));
      return { team, rank: +(s.rank?.value || s.playoffSeed?.value || 0), gp: v('gamesPlayed'), gd: v('pointDifferential') || v('differential'),
        pts: v('points'), w: v('wins'), l: v('losses'), pct: v('winPercent'), gb: v('gamesBehind'), note: en.note };
    }).sort((a, b) => (a.rank || 99) - (b.rank || 99)),
  }));
  return { name: d.name, groups };
}

// All 220 football competitions, kept for a day.
export async function compList() {
  const c = load('comps', null);
  if (c && Date.now() - c.t < 24 * HOUR) return c.list;
  const d = await get(`${SITE.replace('/sports', '')}/leagues/dropdown?sport=soccer&limit=400`, 24 * HOUR);
  const list = (d.leagues || []).map((L) => {
    const path = `soccer/${L.slug}`;
    leagues[path] = { name: L.shortName || L.name, logoId: L.alternateId };
    return { path, slug: L.slug, name: NICE[L.slug] || L.shortName || L.name, logo: compLogo(path, L.alternateId), region: regionOf(L.slug) };
  });
  if (!list.some((x) => x.slug === 'sgp.1')) {
    leagues['soccer/sgp.1'] = { name: 'Singapore Premier League', logoId: '2338' };
    list.push({ path: 'soccer/sgp.1', slug: 'sgp.1', name: 'Singapore Premier League', logo: compLogo('soccer/sgp.1', '2338'), region: 'Asia' });
  }
  save('leagues', leagues); save('comps', { t: Date.now(), list });
  return list;
}

// Search clubs and national teams (football), NFL and NBA teams.
export async function search(q) {
  const d = await get(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=25`, 10 * MIN);
  const out = [];
  for (const r of d.results || []) {
    if (r.type !== 'team') continue;
    for (const x of r.contents || []) {
      const id = (x.uid || '').match(/t:(\d+)/)?.[1];
      let path = null;
      if (x.sport === 'soccer') path = `soccer/${x.defaultLeagueSlug || 'all'}`;
      else if (x.sport === 'football' && x.defaultLeagueSlug === 'nfl') path = 'football/nfl';
      else if (x.sport === 'basketball' && x.defaultLeagueSlug === 'nba') path = 'basketball/nba';
      if (!id || !path) continue;
      out.push({ path, id, name: x.displayName, sub: x.subtitle || '', logo: x.image?.default || '', logoDark: x.image?.defaultDark || '', abbr: '' });
    }
  }
  return out;
}

// ---------- My games: everything followed, from 3 days ago to 7 days ahead, in Singapore time.
export function isMine(g, picks) {
  return picks.comps.some((c) => c.path === g.path)
    || picks.teams.some((t) => sportOf(t.path) === g.sport && (t.id === g.home.id || t.id === g.away.id))
    || picks.games.some((x) => x.id === g.id);
}
const better = (a, b) => (!a ? b : b.src === 'sb' && a.src !== 'sb' ? b : a);

export async function gamesFor(picks, { k0, k1, live = false } = {}) {
  const t = todayKey();
  k0 ??= addDays(t, -3); k1 ??= addDays(t, 7);
  const jobs = [
    ...picks.comps.map((c) => range(c.path, k0, k1, live)),
    ...picks.teams.map((tm) => schedule(tm.path, tm.id)),
    ...picks.games.map((x) => Promise.all([day(x.path, addDays(sg(x.date).key, -1), live), day(x.path, sg(x.date).key, live)]).then((a) => a.flat())),
  ];
  const res = await Promise.allSettled(jobs);
  const byId = new Map();
  for (const r of res) for (const g of r.value || []) byId.set(g.id, better(byId.get(g.id), g));
  const all = [...byId.values()];
  let games = all.filter((g) => { const k = sg(g.date).key; return k >= k0 && k <= k1 && isMine(g, picks); });
  games = await freshen(games, live);
  // A followed team with nothing this week still shows its next game, so it never just disappears.
  const later = [];
  for (const tm of picks.teams) {
    const mine = (g) => sportOf(tm.path) === g.sport && (g.home.id === tm.id || g.away.id === tm.id);
    if (games.some((g) => mine(g) && g.state !== 'post')) continue;
    const next = sortGames(all.filter((g) => mine(g) && g.state === 'pre' && sg(g.date).key > k1))[0];
    if (next && !later.some((x) => x.id === next.id)) later.push(next);
  }
  return { games: sortGames(games), later: sortGames(later), failed: res.filter((r) => r.status === 'rejected').length, total: res.length };
}
// Team schedules can be minutes old; for games around now, read the live scoreboard instead.
async function freshen(games, live) {
  const now = Date.now();
  const need = games.filter((g) => g.src !== 'sb' || live).filter((g) => { const s = new Date(g.date).getTime(); return s < now + 20 * MIN && s > now - 6 * HOUR && !(g.completed && g.src === 'sb'); });
  const keys = new Map();
  for (const g of need) { const k = sg(g.date).key; for (const u of [addDays(k, -1), k]) keys.set(`${g.path}|${u}`, [g.path, u]); }
  const res = await Promise.allSettled([...keys.values()].map(([p, u]) => day(p, u, true)));
  const fresh = new Map(res.flatMap((r) => r.value || []).map((g) => [g.id, g]));
  return games.map((g) => fresh.get(g.id) || g);
}
export function sortGames(games) {
  return games.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id));
}
export const isLive = (g) => g.state === 'in';
export const soon = (g) => g.state === 'pre' && new Date(g.date) - Date.now() < 10 * MIN && new Date(g.date) - Date.now() > -60 * MIN;
