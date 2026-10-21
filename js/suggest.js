// "Good for you": games that fit Darren's free hours in SGT, are played overseas, are on a streamer, are
// playoffs, are big games, or matter to his teams. A helper only: nothing is followed without his tap (PRD 7.8).
// Time, place, TV and playoff rules live in rules.js (shared with the calendar helper). The two table rules
// below need league tables, which only the app loads, so they live here.
import { settings, picks, sportOf } from './store.js';
import { freeHourWith, reasonsWith } from './rules.js';
import { standings } from './espn.js';

// League tables, by competition path, filled in by the screens that list games (useTables).
const tables = new Map();
let tablesVer = 0;
export const tablesVersion = () => tablesVer; // rows drawn before a table arrived are drawn again
export function useTables(ctx, paths) {
  for (const p of new Set(paths)) {
    const e = ctx.use(`table:${p}`, () => standings(p), 30 * 60e3);
    if (e.v && tables.get(p) !== e.v) { tables.set(p, e.v); tablesVer++; }
  }
}

// The derbies everyone knows, by ESPN team names (both orders match).
const DERBIES = [
  ['Arsenal', 'Tottenham Hotspur', 'North London derby'], ['Manchester United', 'Manchester City', 'Manchester derby'],
  ['Liverpool', 'Everton', 'Merseyside derby'], ['Liverpool', 'Manchester United', 'North-west derby'],
  ['Real Madrid', 'Barcelona', 'El Clásico'], ['Real Madrid', 'Atlético Madrid', 'Madrid derby'],
  ['Internazionale', 'AC Milan', 'Milan derby'], ['AS Roma', 'Lazio', 'Rome derby'], ['Juventus', 'Internazionale', "Derby d'Italia"],
  ['Bayern Munich', 'Borussia Dortmund', 'Der Klassiker'], ['Celtic', 'Rangers', 'Old Firm derby'],
  ['Paris Saint-Germain', 'Marseille', 'Le Classique'], ['Ajax Amsterdam', 'Feyenoord Rotterdam', 'De Klassieker'],
];
const derby = (g) => DERBIES.find(([a, b]) => [g.home.name, g.away.name].sort().join() === [a, b].sort().join())?.[2];

// Each team's place inside its own table (conference for NFL and NBA), once a few games are played.
function places(g) {
  const st = tables.get(g.path);
  for (const grp of st?.groups || []) {
    const at = (id) => grp.rows.findIndex((r) => r.team.id === id);
    const h = at(g.home.id), a = at(g.away.id);
    if (h < 0 || a < 0) continue;
    const played = (r) => +r.gp || (+r.w || 0) + (+r.l || 0);
    if (Math.min(played(grp.rows[h]), played(grp.rows[a])) < 3) return null; // too early for the table to mean much
    return { grp, h, a, top: Math.ceil(grp.rows.length * 0.3) };
  }
  return null;
}

function tableReasons(g) {
  const out = [];
  const p = places(g);
  if (settings.rules.big) {
    const d = g.sport === 'soccer' && derby(g);
    if (d) out.push(d);
    else if (p && p.h < p.top && p.a < p.top) out.push(g.sport === 'soccer' ? 'Top-of-table clash' : 'Top of the conference');
  }
  if (settings.rules.near && p) {
    // Two teams close to one you follow, in the same table: the result moves your team's position.
    const mine = picks.teams.filter((t) => sportOf(t.path) === g.sport && t.id !== g.home.id && t.id !== g.away.id);
    for (const t of mine) {
      const f = p.grp.rows.findIndex((r) => r.team.id === t.id);
      if (f >= 0 && Math.abs(p.h - f) <= 3 && Math.abs(p.a - f) <= 3) { out.push(`Near ${p.grp.rows[f].team.short || t.name} in the table`); break; }
    }
  }
  return out;
}

export const freeHour = (g) => freeHourWith(g, settings);
export const reasons = (g) => [...reasonsWith(g, settings), ...tableReasons(g)];
