// The live bar (FTLTG 7.1): while a game you follow is live, a slim white pill sits at the top of Clips, Fans and
// Follow, so the score stays in view while you scroll clips or threads. Tap it for the match. Games has the full
// live hero instead.
import { esc, addDays, todayKey } from './util.js';
import { picks, followingAny } from './store.js';
import { gamesFor, isLive, liveLabel } from './espn.js';
import { kitsFor } from './identity.js';
import { href, spoken } from './ui.js';

let wasLive = false;
export function liveBar(ctx) {
  if (!followingAny()) return '';
  const e = ctx.use('livebar', () => gamesFor(picks, { k0: addDays(todayKey(), -1), k1: todayKey(), live: wasLive }), wasLive ? 10e3 : 60e3);
  const live = (e.v?.games || []).filter(isLive);
  wasLive = live.length > 0;
  if (!live.length) return '';
  ctx.live = true;
  const g = live[0], k = kitsFor(g);
  const tm = (x) => `<span class="lk" style="background:${x.bg};color:${x.ink}">${esc(x.team.abbr)}</span>`;
  return `<a class="livebar" href="${href.match(g)}" aria-label="${esc(spoken(g, k))}${live.length > 1 ? ` ${live.length - 1} more live.` : ''}"><i class="dot"></i><span class="lc">${esc(liveLabel(g))}</span>${tm(k.left)}<b>${esc(k.left.team.score ?? 0)}–${esc(k.right.team.score ?? 0)}</b>${tm(k.right)}${live.length > 1 ? `<span class="lm">+${live.length - 1} live</span>` : ''}</a>`;
}
