// Football player faces (TECH-DESIGN 15, Darren 26 Oct 2026): ESPN has headshots for about 5% of football players,
// so the helper collects TheSportsDB cut-outs (the NBA/NFL look) and Wikipedia photos as a backup, once for every
// phone. Cut-outs: one TheSportsDB search per player (its free team list stops at 10), 6 a run on the odd minutes,
// 3 s apart, players someone opened first, then every squad of the followed leagues. Wikipedia: during the app's
// request, up to 50 names a call, so a player opened for the first time gets a photo at once.
import { sameTeam } from './second.js';

const TSDB = 'https://www.thesportsdb.com/api/v1/json/123';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const WIKI = 'https://en.wikipedia.org/w/api.php';
const UA = 'Mozilla/5.0 (Matchday personal app; darrenczw.github.io/matchday)';
const DAY = 864e5;
export const FACES_BUDGET = 6; // TheSportsDB searches per run (the second-source check uses 3 on the even minutes)
const GAP = 3000, SQUADS_PER_RUN = 2, AGAIN = 30 * DAY, MAX_ASK = 80;

// ---------- Wikipedia: a page counts when its short description says football ("English footballer (born 2001)").
// Pass 1 the plain name, pass 2 "Name (footballer)", pass 3 "Name (footballer, born 1997)" when the birth year is known.
async function wikiBatch(titles) {
  if (!titles.length) return {};
  const q = new URLSearchParams({ action: 'query', prop: 'pageimages|description', piprop: 'thumbnail', pithumbsize: '200', redirects: '1', titles: titles.join('|'), format: 'json', formatversion: '2' });
  const j = (await fetch(`${WIKI}?${q}`, { headers: { 'User-Agent': UA } }).then((r) => (r.ok ? r.json() : null)).catch(() => null))?.query;
  if (!j) return null;
  const to = new Map();
  for (const n of [...(j.normalized || []), ...(j.redirects || [])]) to.set(n.from, n.to);
  const pages = new Map((j.pages || []).map((p) => [p.title, p]));
  const out = {};
  for (const t of titles) {
    let x = t;
    for (let i = 0; i < 3 && to.has(x); i++) x = to.get(x);
    const p = pages.get(x);
    if (p?.thumbnail?.source && /football|soccer/i.test(p.description || '')) out[t] = p.thumbnail.source;
  }
  return out;
}
async function wikiFaces(players) {
  const found = {};
  const passes = [(p) => p.name, (p) => `${p.name} (footballer)`, (p) => (p.born ? `${p.name} (footballer, born ${p.born})` : null)];
  let left = players;
  for (const title of passes) {
    const ask = left.map((p) => [p, title(p)]).filter(([, t]) => t);
    for (let i = 0; i < ask.length; i += 50) {
      const part = ask.slice(i, i + 50), got = await wikiBatch(part.map(([, t]) => t));
      if (!got) return found; // Wikipedia didn't answer: try again next time
      for (const [p, t] of part) if (got[t]) found[p.id] = got[t];
    }
    left = left.filter((p) => !found[p.id]);
    if (!left.length) break;
  }
  return found;
}

// ---------- POST /api/faces { players: [{ id, name, team }] } → { faces: { id: { u, k } } }. k: 'cut' or 'wiki'.
export async function faces(req, env) {
  const body = await req.json().catch(() => ({}));
  const asked = (Array.isArray(body.players) ? body.players : []).filter((p) => /^\d{1,10}$/.test(String(p?.id)) && p.name).slice(0, MAX_ASK)
    .map((p) => ({ id: String(p.id), name: String(p.name).slice(0, 80), team: String(p.team || '').slice(0, 80) }));
  if (!asked.length) return { faces: {} };
  const now = Date.now();
  const rows = new Map(((await env.DB.prepare(`SELECT * FROM faces WHERE id IN (${asked.map(() => '?').join(',')})`).bind(...asked.map((p) => p.id)).all()).results || []).map((r) => [r.id, r]));
  // New players, and ones never looked up on Wikipedia: look them up now. New ones also go first in line for a cut-out.
  const wiki = asked.filter((p) => !rows.get(p.id)?.wiki_at).map((p) => ({ ...p, born: rows.get(p.id)?.born || null }));
  const found = wiki.length ? await wikiFaces(wiki) : {};
  const writes = [];
  for (const p of asked) {
    const r = rows.get(p.id);
    if (!r) {
      writes.push(env.DB.prepare('INSERT INTO faces (id, name, team, wiki, wiki_at, want_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(p.id, p.name, p.team, found[p.id] || '', now, now));
      rows.set(p.id, { id: p.id, cut: null, wiki: found[p.id] || '' });
    } else if (!r.wiki_at) {
      writes.push(env.DB.prepare('UPDATE faces SET wiki = ?, wiki_at = ?, want_at = MAX(want_at, ?) WHERE id = ?').bind(found[p.id] || '', now, now, p.id));
      r.wiki = found[p.id] || '';
    } else if (!r.tsdb_at && (r.want_at || 0) < now - DAY) writes.push(env.DB.prepare('UPDATE faces SET want_at = ? WHERE id = ?').bind(now, p.id));
  }
  if (writes.length) await env.DB.batch(writes);
  const out = {};
  for (const p of asked) {
    const r = rows.get(p.id);
    if (r?.cut) out[p.id] = { u: r.cut, k: 'cut' };
    else if (r?.wiki) out[p.id] = { u: r.wiki, k: 'wiki' };
  }
  return { faces: out };
}

// ---------- The odd-minute run: squads first (cheap, ESPN), then TheSportsDB searches.
const readPicks = async (env) => JSON.parse((await env.DB.prepare('SELECT json FROM picks WHERE id = 1').first())?.json || '{}');
// The football leagues to collect squads for: followed football competitions, and the leagues of followed football teams.
function leagues(picks) {
  const f = picks.follow || {}, c = picks.cal || {};
  const out = new Set();
  for (const x of [...(f.comps || []), ...(c.comps || []), ...(f.teams || []), ...(c.teams || [])]) {
    const m = String(x.path || '').match(/^soccer\/([\w.]+)$/);
    if (m && m[1] !== 'all') out.add(m[1]);
  }
  return [...out];
}
async function espn(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}
async function squads(env, now) {
  const want = leagues(await readPicks(env));
  if (!want.length) return 0;
  const seen = new Map(((await env.DB.prepare('SELECT key, at FROM fsquads').all()).results || []).map((r) => [r.key, r.at]));
  let calls = 0, players = 0;
  for (const lg of want) {
    if (calls >= SQUADS_PER_RUN) break;
    let teams = seen.has(`l:${lg}`) && now - seen.get(`l:${lg}`) < DAY ? null : [];
    if (teams) { // the league's team list, once a day
      const d = await espn(`${ESPN}/${lg}/teams`); calls++;
      teams = (d.sports?.[0]?.leagues?.[0]?.teams || []).map((t) => t.team).filter(Boolean);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO fsquads (key, at, body) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET at = ?2, body = ?3').bind(`l:${lg}`, now, JSON.stringify(teams.map((t) => ({ id: t.id, name: t.displayName })))),
      ]);
    } else teams = JSON.parse((await env.DB.prepare('SELECT body FROM fsquads WHERE key = ?').bind(`l:${lg}`).first())?.body || '[]').map((t) => ({ id: t.id, displayName: t.name }));
    for (const t of teams) {
      if (calls >= SQUADS_PER_RUN) break;
      const key = `t:${lg}:${t.id}`;
      if (seen.has(key) && now - seen.get(key) < DAY) continue;
      const d = await espn(`${ESPN}/${lg}/teams/${t.id}/roster`); calls++;
      const list = (d.athletes || []).filter((a) => a?.id && a.displayName);
      players += list.length;
      await env.DB.batch([
        ...list.map((a) => env.DB.prepare('INSERT INTO faces (id, name, team, born, want_at) VALUES (?1, ?2, ?3, ?4, 0) ON CONFLICT(id) DO UPDATE SET name = ?2, team = ?3, born = ?4')
          .bind(String(a.id), a.displayName, t.displayName, Number(String(a.dateOfBirth || '').slice(0, 4)) || null)),
        env.DB.prepare('INSERT INTO fsquads (key, at) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET at = ?2').bind(key, now),
      ]);
    }
  }
  return players;
}
// One TheSportsDB search. A cut-out counts only for a football player at the same club: a search for "Ben White"
// finds Wrexham's Ben White first, and "Pedri" a retired "Pedrinho".
async function cutout(p) {
  const r = await fetch(`${TSDB}/searchplayers.php?p=${encodeURIComponent(p.name.replace(/\s+/g, '_'))}`, { headers: { 'User-Agent': UA } });
  if (r.status === 429) throw Object.assign(new Error('TheSportsDB busy (429)'), { busy: true });
  if (!r.ok) throw new Error(`TheSportsDB ${r.status}`);
  const list = (await r.json().catch(() => ({})))?.player || [];
  const hit = list.find((x) => x.strSport === 'Soccer' && x.strCutout && p.team && sameTeam(x.strTeam || '', p.team));
  return hit?.strCutout || '';
}
export async function facesRun(env) {
  const now = Date.now(), notes = [];
  if (+((await env.DB.prepare("SELECT value FROM meta WHERE key = 'faces_rest_until'").first())?.value || 0) > now) return { rested: true };
  try { notes.push(`squads:${await squads(env, now)}`); } catch (e) { notes.push(`squads: ${String(e.message || e).slice(0, 60)}`); }
  // Never searched, players someone opened first; searched without a cut-out, again after 30 days.
  const due = (await env.DB.prepare('SELECT id, name, team FROM faces WHERE (tsdb_at IS NULL OR (cut = \'\' AND tsdb_at < ?)) AND team != \'\' ORDER BY want_at DESC LIMIT ?').bind(now - AGAIN, FACES_BUDGET).all()).results || [];
  let n = 0;
  for (const [i, p] of due.entries()) {
    if (i) await new Promise((r) => setTimeout(r, GAP));
    try {
      const u = await cutout(p);
      await env.DB.prepare('UPDATE faces SET cut = ?, tsdb_at = ? WHERE id = ?').bind(u, now, p.id).run();
      if (u) n++;
    } catch (e) {
      if (e.busy) await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('faces_rest_until', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(now + 5 * 60e3)).run();
      notes.push(String(e.message || e).slice(0, 60));
      break;
    }
  }
  notes.push(`cutouts:${n}/${due.length}`);
  return { notes };
}
