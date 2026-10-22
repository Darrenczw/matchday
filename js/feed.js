// FTLTG feeds: highlight clips and fan talk from Reddit, matched to your games (PRD-ftltg 7.4, 7.5).
// Prototype: a saved snapshot of real data (data/ftltg-snapshot.json, labelled on screen). The calendar helper
// serves the same shape later (TECH-DESIGN-ftltg). NBA clips come live from ESPN's game summary, as on match pages.
// A clip is only ever shown on the game it was matched to: by game id in the snapshot, then by minute or player
// against ESPN's own goals and scoring plays. A clip that doesn't match a moment is still that game's clip, shown
// after the moments; a moment with no clip yet is an empty "Clip coming" slot.
import { summary, norm, isMine } from './espn.js';
import { load, save, picks, emit, sportOf } from './store.js';
import { clipList } from './clips.js';

let snap = null, snapP = null;
export function snapshot() {
  snapP ||= fetch('data/ftltg-snapshot.json').then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((j) => { snap = j; emit('feed'); return j; })
    .catch((e) => { snapP = null; throw e; });
  return snapP;
}
export const snapAt = () => snap?.at || '';
snapshot().catch(() => {});

// ---------- Games with clips or threads: each snapshot game's ESPN summary, so it wears its kit and has its goals.
export async function feedGames() {
  const s = await snapshot();
  const res = await Promise.allSettled((s.games || []).map(async (x) => {
    const d = await summary(x.path, x.id);
    const g = d?.header ? norm({ ...d.header, competitions: [{ ...d.header.competitions[0] }] }, x.path) : null;
    return g && { g, d };
  }));
  const out = res.map((r) => r.value).filter(Boolean);
  // Newest first; a live game before everything.
  out.sort((a, b) => (b.g.state === 'in') - (a.g.state === 'in') || new Date(b.g.date) - new Date(a.g.date));
  return out;
}
// Your games first. With no follows among them, the whole snapshot shows, and the screen says so.
export function mineFirst(list) {
  const mine = list.filter((x) => isMine(x.g, picks));
  return { list: mine.length ? mine : list, all: !mine.length };
}

// ---------- Moments: one per goal or scoring play, with its clip when there is one.
const surname = (s) => String(s || '').trim().split(/\s+/).pop().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const minOf = (s) => parseInt(String(s).replace(/\+.*/, ''), 10);

export function moments(g, d) {
  const clips = (snap?.clips || []).filter((c) => c.game === g.id && c.kind !== 'full' && c.src);
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
      const clip = take((c) => c.team === team && who && (surname(c.who) === surname(who) || c.title.toLowerCase().includes(surname(who))));
      return { key: `${g.id}:${i}`, team, label: p.type?.abbreviation || 'TD', sub: `Q${p.period?.number || ''} ${p.clock?.displayValue || ''}`.trim(), who, ini: initialsOf(who), h: p.homeScore, a: p.awayScore, clip };
    });
  } else if (g.sport === 'basketball') {
    // ESPN's own NBA clips: the player is found in the box score, so the sticker gets his face and team.
    const people = [];
    for (const t of d?.boxscore?.players || []) for (const s of t.statistics || []) for (const x of s.athletes || []) people.push({ team: String(t.team?.id || ''), a: x.athlete });
    out = clipList(d).filter((c) => c.dur <= 45).map((c, i) => {
      const p = people.find((x) => x.a?.displayName && c.title.includes(x.a.displayName)) || people.find((x) => x.a?.shortName && c.title.includes(surname(x.a.displayName)));
      const clip = { src: c.src, tall: c.tall, poster: c.poster, title: c.title, via: 'ESPN', by: '', at: c.t };
      return { key: `${g.id}:${c.id}`, team: p?.team || '', label: String(i + 1), who: p?.a?.shortName || '', ini: initialsOf(p?.a?.displayName), athlete: p?.a || null, clip, title: c.title };
    });
  }
  // Clips that matched no moment are still this game's: after the moments, in the order they were posted.
  for (const c of clips) if (!used.has(c)) out.push({ key: `${g.id}:x:${c.src}`, team: c.team, label: c.min || '', who: c.who, ini: initialsOf(c.who), clip: c, extra: true });
  for (const m of out) if (m.clip && !m.clip.title && m.title) m.clip.title = m.title;
  return out;
}
export const fullHighlights = (g) => (snap?.clips || []).find((c) => c.game === g.id && c.kind === 'full' && c.src) || null;
function initialsOf(name = '') {
  const w = String(name).replace(/\./g, '').split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() || '·';
}

// ---------- Watched clips, kept on this phone.
const seen = new Set(load('clipSeen', []));
export const isSeen = (c) => !!c && seen.has(c.src);
export function markSeen(c) {
  if (!c || seen.has(c.src)) return;
  seen.add(c.src);
  save('clipSeen', [...seen].slice(-600));
  emit('seen');
}

// ---------- Fan talk
export const threadsOf = (id) => (snap?.threads || []).filter((t) => t.game === id);
export const threadById = (rid) => (snap?.threads || []).find((t) => redditId(t.url) === rid) || null;
export const redditId = (url) => String(url).match(/\/comments\/(\w+)/)?.[1] || '';
export function teamSubs() {
  const all = snap?.teams || [];
  const mine = all.filter((t) => picks.teams.some((p) => sportOf(p.path) === t.sport && p.id === t.id));
  return { list: mine.length ? mine : all, all: !mine.length };
}
export const banter = () => snap?.banter || [];

// "3 clips · thread" for a finished game on My games.
export function badge(id) {
  if (!snap) return '';
  const n = (snap.clips || []).filter((c) => c.game === id && c.kind !== 'full').length;
  const t = (snap.threads || []).some((x) => x.game === id);
  return [n ? `${n} clip${n > 1 ? 's' : ''}` : '', t ? 'thread' : ''].filter(Boolean).join(' · ');
}
