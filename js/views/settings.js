// Settings: TV markets and their order, free hours, suggestion rules, calendar, look (PRD 7.10).
import { esc, icon } from '../util.js';
import { settings, set, MARKETS, clearPicks, followingAny, DEMO } from '../store.js';
import { FREE_WINDOWS } from '../suggest.js';
import { rightsChecked } from '../tv.js';
import { toast } from '../ui.js';

const sw = (path, on, label) => `<button class="switch" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-act="toggle" data-path="${path}"></button>`;

export default function settingsView() {
  const ms = settings.markets;
  let html = `<header class="top"><h1>Settings</h1>${DEMO ? '<span class="sub">Practice copy</span>' : ''}</header>`;

  html += `<div class="card"><h2>Calendar</h2><div class="li">${icon('cal')}<span class="grow"><span class="t">Not set up yet</span><small class="wrap">Your followed games will go into a “Matchday” calendar on your iPhone that updates itself. It needs the small calendar helper, which comes in build step A5.</small></span></div></div>`;

  html += `<div class="card"><div class="h">TV markets<span>Top one is your main market</span></div><div id="markets">`;
  html += ms.map((m, i) => `<div class="mrow" data-m="${m}"><span class="grip" data-drag="${i}" aria-hidden="true">${icon('grip')}</span><span class="grow">${esc(MARKETS[m])}${i === 0 ? ' <span class="tag exact" style="margin-left:6px">Main</span>' : ''}</span>
<button class="mv" data-act="mv" data-i="${i}" data-d="-1" aria-label="Move ${esc(MARKETS[m])} up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="mv" data-act="mv" data-i="${i}" data-d="1" aria-label="Move ${esc(MARKETS[m])} down" ${i === ms.length - 1 ? 'disabled' : ''}>${icon('down')}</button></div>`).join('');
  html += `</div><p class="note">Drag, or use the arrows. Rights table checked ${esc(rightsChecked() || '…')}, with a source for every entry.</p></div>`;

  html += `<div class="card"><h2>My free hours</h2>${FREE_WINDOWS.map((w) => `<div class="li"><span class="grow"><span class="t">${w.label}</span><small>${w.sub}</small></span>${sw(`free.${w.key}`, settings.free[w.key], w.label)}</div>`).join('')}<p class="note">All times are Singapore time. Games in these hours get a “Good for you” tag.</p></div>`;

  const rules = [['rules.overseas', 'Played overseas', 'NFL and NBA games outside the US and Canada'], ['rules.streaming', 'On a streamer', 'Netflix, Prime Video, YouTube, Disney+'], ['rules.playoffs', 'Playoffs and finals', 'All three sports']];
  html += `<div class="card"><h2>Also suggest</h2>${rules.map(([p, l, s]) => `<div class="li"><span class="grow"><span class="t">${l}</span><small>${s}</small></span>${sw(p, p.split('.').reduce((o, k) => o[k], settings), l)}</div>`).join('')}
<div class="li"><span class="grow"><span class="t">Suggest from</span><small>Which sports appear in This week</small></span></div>
${[['suggest.nfl', 'NFL'], ['suggest.nba', 'NBA'], ['suggest.soccer', 'Football']].map(([p, l]) => `<div class="li" style="min-height:48px"><span class="grow"><span class="t">${l}</span></span>${sw(p, p.split('.').reduce((o, k) => o[k], settings), `Suggest ${l}`)}</div>`).join('')}</div>`;

  html += `<div class="sect"><h2 class="cap">Look</h2></div><div class="seg" role="group" aria-label="Look">${[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']].map(([k, l]) => `<button data-act="theme" data-v="${k}" aria-pressed="${settings.theme === k}">${l}</button>`).join('')}</div>`;

  html += `<div class="card"><h2>About</h2><p class="note" style="padding-top:0">Scores, fixtures, tables, logos and US TV come from ESPN’s public feed. Away kit colours come from each club’s Wikipedia page. Free, with no account and no tracking. Your picks stay on this phone.</p>
${followingAny() ? `<div class="li"><span class="grow"><span class="t">Clear all picks</span><small>Start again from nothing</small></span><button class="btn sm warn" data-act="clear">Clear</button></div>` : ''}</div>`;
  return html;
}

settingsView.actions = {
  toggle(d) { set(d.path, !d.path.split('.').reduce((o, k) => o[k], settings)); },
  mv(d) {
    const a = [...settings.markets], i = +d.i, j = i + +d.d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set('markets', a);
  },
  clear() {
    if (!confirm('Clear everything you follow? This can’t be undone.')) return;
    clearPicks(); toast('All picks cleared');
  },
};

// Drag to reorder markets (pointer events, works with touch).
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const g = e.target.closest('[data-drag]');
  if (!g) return;
  const row = g.closest('.mrow'), box = document.getElementById('markets');
  drag = { row, box, y0: e.clientY, h: row.offsetHeight, from: +g.dataset.drag, to: +g.dataset.drag };
  row.classList.add('drag'); g.setPointerCapture(e.pointerId); e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dy = e.clientY - drag.y0, n = drag.box.children.length;
  drag.to = Math.max(0, Math.min(n - 1, drag.from + Math.round(dy / drag.h)));
  drag.row.style.transform = `translateY(${dy}px)`;
});
const end = () => {
  if (!drag) return;
  const { row, from, to } = drag; drag = null;
  row.classList.remove('drag'); row.style.transform = '';
  if (from !== to) { const a = [...settings.markets]; const [m] = a.splice(from, 1); a.splice(to, 0, m); set('markets', a); }
};
document.addEventListener('pointerup', end);
document.addEventListener('pointercancel', end);
