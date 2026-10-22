// A match thread, read inside FTLTG: the game's row at the top, the post, then the top comments in Reddit's
// order (Darren, 22 Oct 2026: "top comments"). Reddit's free feed gives no votes or reply chains, so it is one
// flat list. "Open in Reddit" for replying or reading more.
import { esc, icon, ago } from '../util.js';
import { gameRow, backBtn, skel, errorCard } from '../ui.js';
import { snapshot, threadById, feedGames } from '../feed.js';
import { kindName } from './fans.js';

const when = (iso) => ago(new Date(iso).getTime());

export default function thread([rid], ctx) {
  const back = backBtn(ctx.back?.href || '#/fans', ctx.back?.label || 'Fans');
  const s = ctx.use('feed:snap', snapshot, 10 * 60e3);
  if (!s.v) return `<nav class="nav">${back}</nav>` + (s.err ? errorCard('Couldn’t load this thread.') : skel(4));
  const t = threadById(rid);
  if (!t) return `<nav class="nav">${back}</nav><div class="banner info"><span>This thread isn’t in the feed any more.</span></div>`;
  const e = ctx.use('feed:games', feedGames, 5 * 60e3);
  const g = e.v?.find((x) => x.g.id === t.game)?.g;
  ctx.title = t.title;
  const open = `<a class="btn sm ghost" href="${esc(t.url)}" target="_blank" rel="noopener">Open in Reddit</a>`;
  let html = `<nav class="nav">${back}${open}</nav>`;
  if (g) html += gameRow(g, { why: false, tv: false, badge: false });
  html += `<header class="thd"><h1>${esc(t.title)}</h1><small>${esc(t.sub)} · ${esc(kindName(t, g))} · ${when(t.at)}</small></header>`;
  const cs = t.comments || [];
  html += `<div class="sect"><h2 class="cap">Top comments</h2><span>${cs.length} shown</span></div>`;
  html += cs.length
    ? `<ol class="card cmts">${cs.map((c) => `<li><span class="by">${esc(c.by)}<i>${when(c.at)}</i></span><p>${esc(c.text)}</p></li>`).join('')}</ol>`
    : '<div class="banner info"><span>No comments yet.</span></div>';
  html += `<div class="more">${open.replace('btn sm ghost', 'btn ghost')}</div>`;
  return html;
}
