// App shell: routing, drawing, data loading, live polling, actions.
import { on, follow, unfollow, set, settings, picks, DEMO } from './store.js';
import { addCal, removeCal } from './cal.js';
import { rightsReady } from './tv.js';
import { compInfo, known } from './espn.js';
import { toast } from './ui.js';
import { esc } from './util.js';
import { ground } from './ground.js';
import { swipe } from './swipe.js';
import './prefetch.js';
import home from './views/home.js';
import followView from './views/follow.js';
import comp from './views/comp.js';
import team from './views/team.js';
import match from './views/match.js';
import player from './views/player.js';
import week from './views/week.js';
import settingsView from './views/settings.js';
import clipsTab from './views/clipstab.js';
import fans from './views/fans.js';
import thread from './views/thread.js';

const ROUTES = [
  [/^#?\/?$/, home, 'home'],
  [/^#\/follow(?:\/(soccer|nfl|nba))?$/, followView, 'follow'],
  // Team and competition pages keep the tab you came from lit (My games, Follow or This week).
  [/^#\/c\/(\w+)\/([\w.]+)$/, comp, null],
  [/^#\/t\/(\w+)\/([\w.]+)\/(\d+)$/, team, null],
  [/^#\/m\/(\w+)\/([\w.]+)\/(\d+)$/, match, null],
  [/^#\/p\/(\w+)\/([\w.]+)\/(\d+)$/, player, null],
  [/^#\/clips$/, clipsTab, 'clips'],
  [/^#\/fans$/, fans, 'fans'],
  [/^#\/fans\/t\/(\w+)$/, thread, null],
  // This week and Settings left the tab bar (FTLTG tabs: Games, Clips, Fans, Follow); they keep the tab you came from lit.
  [/^#\/week$/, week, null],
  [/^#\/settings$/, settingsView, null],
];
const main = document.getElementById('view');
let route = null, lastTab = 'home', lastHtml = '';

// ---------- Data: views ask for data by key; it loads in the background and the screen redraws.
const data = new Map();
const ctx = {
  live: false,
  use(key, fn, maxAge = 60e3) {
    let e = data.get(key);
    if (!e) { e = {}; data.set(key, e); }
    e.maxAge = maxAge; e.fn = fn;
    if (!e.p && (!e.t || Date.now() - e.t > maxAge)) load(key, e);
    return e;
  },
  redraw: () => draw(),
  forget(prefix) { for (const k of data.keys()) if (k.startsWith(prefix)) data.delete(k); },
};
function load(key, e) {
  e.p = Promise.resolve().then(e.fn)
    .then((v) => { e.v = v; e.err = null; })
    .catch((err) => { e.err = err; console.warn(key, err); })
    .finally(() => { e.p = null; e.t = Date.now(); draw(); });
}

// ---------- Drawing: render to a string, then update only what changed, so a focused input
// keeps its keyboard and logos don't flicker.
let raf = 0, lastFloat = null;
export function draw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }
function paint() {
  if (!route) return;
  ctx.live = false;
  ctx.sport = '';
  ctx.title = '';
  let html;
  try { html = route.view(route.params, ctx); } catch (err) {
    console.error(err);
    html = `<div class="banner red"><span>Something broke on this screen. Go back or switch tabs, then try again.<small style="display:block;margin-top:4px;font-weight:500">${esc(err.message)}</small></span></div>`;
  }
  if (html !== lastHtml) {
    lastHtml = html;
    const t = document.createElement('template');
    t.innerHTML = html;
    morphChildren(main, t.content);
  }
  ground(ctx.sport);
  // Floating controls (the game pager) live outside the page, so a swipe slides the page and not them.
  const fl = main.querySelector(':scope > .pagerbar'), bar = document.getElementById('bar');
  if (fl) { bar.replaceChildren(fl); } else if (!main.querySelector('.pagerbar') && route.view !== lastFloat) bar.replaceChildren();
  lastFloat = route.view;
  // The tab title says where you are (VoiceOver reads it too): "Arsenal v Everton · Matchday".
  const where = ctx.title || main.querySelector('h1')?.textContent || '';
  const title = `${where && where !== 'My games' ? `${where} · ` : ''}Matchday${DEMO ? ' (sample picks)' : ''}`;
  if (document.title !== title) document.title = title;
  settleScroll();
}
// Where a screen opens: back where you left it, or at the top.
function settleScroll() {
  const sc = route?.scroll;
  if (sc == null) return;
  scrollTo(0, sc);
  route.scroll = null;
}
function morph(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return; }
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.data !== b.data) a.data = b.data; return; }
  if (a.nodeType !== 1) return;
  // A part that runs itself (the clip player) is drawn once, then left alone while its key stays the same.
  if (a.dataset.keep && a.dataset.keep === b.dataset?.keep) return;
  // Most of a long list is the same as last time: the browser's own deep compare skips it in one call.
  if (a.isEqualNode(b)) return;
  // A logo that changes gets a new element: patching src keeps showing the old logo until the new one loads.
  if (a.tagName === 'IMG' && a.getAttribute('src') !== b.getAttribute('src')) { a.replaceWith(b); return; }
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of [...b.attributes]) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  if (a.tagName === 'INPUT') { if (document.activeElement !== a && a.value !== (b.getAttribute('value') ?? '')) a.value = b.getAttribute('value') ?? ''; return; }
  morphChildren(a, b);
}
function morphChildren(a, b) {
  const x = [...a.childNodes], y = [...b.childNodes];
  y.forEach((n, i) => (i < x.length ? morph(x[i], n) : a.appendChild(n)));
  for (let i = y.length; i < x.length; i++) x[i].remove();
}

// ---------- Routing
// The app decides where each screen opens; stop the browser restoring an old position over it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const scrolls = {};
let prevHash = location.hash;
let tabReset = false;
let started = false;
function go() {
  if (route) scrolls[prevHash] = scrollY; // remember where we left the previous screen
  const h = location.hash || '#/';
  for (const [re, view, tab] of ROUTES) {
    const m = h.match(re);
    if (!m) continue;
    route = { view, params: m.slice(1), hash: h };
    ctx.back = stack.length > 1 ? { href: stack[stack.length - 2], label: labelFor(stack[stack.length - 2]) } : null;
    if (tab) lastTab = tab;
    document.querySelectorAll('.tabs a').forEach((a) => (a.dataset.tab === lastTab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    route.scroll = tabReset || scrolls[h] == null ? 0 : scrolls[h];
    tabReset = false;
    lastHtml = '';
    main.innerHTML = '';
    paint();
    // A new screen: VoiceOver starts reading from its top, not from the button that was tapped.
    if (started) main.focus({ preventScroll: true });
    started = true;
    prevHash = h;
    return;
  }
  location.replace('#/');
}
// "Back" names the screen it returns to.
function labelFor(h) {
  if (!h || h === '#/' || h === '#') return 'My games';
  if (h.startsWith('#/follow')) return 'Follow';
  if (h === '#/week') return 'This week';
  if (h === '#/clips') return 'Clips';
  if (h.startsWith('#/fans')) return 'Fans';
  if (h === '#/settings') return 'Settings';
  let m = h.match(/^#\/c\/(\w+)\/([\w.]+)$/);
  if (m) return compInfo(`${m[1]}/${m[2]}`).name;
  m = h.match(/^#\/t\/(\w+)\/[\w.]+\/(\d+)$/);
  if (m) return data.get(`team:${m[1]}:${m[2]}`)?.v?.short || 'Team';
  m = h.match(/^#\/m\/(\w+)\/[\w.]+\/(\d+)$/);
  const pm = h.match(/^#\/p\/(\w+)\/([\w.]+)\/(\d+)$/);
  if (pm) return data.get(`player:${pm[1]}:${pm[3]}`)?.v?.a?.shortName || 'Player';
  const g = m && known.get(m[2]);
  if (g) return g.sport === 'soccer' ? `${g.home.abbr} v ${g.away.abbr}` : `${g.away.abbr} @ ${g.home.abbr}`;
  return 'Back';
}
const stack = [];
addEventListener('hashchange', () => {
  const h = location.hash || '#/';
  // A swipe to the next game replaces this screen, so Back still returns to the list it came from.
  let dir = 'fwd';
  if (swipe.replacing) { swipe.replacing = false; stack[stack.length - 1] = h; dir = 'none'; }
  else if (stack.length > 1 && stack[stack.length - 2] === h) { stack.pop(); dir = 'back'; } else stack.push(h);
  if (tabReset) dir = 'tab';
  turn(dir);
});
// ---------- Page turns (Darren, 22 Oct 2026: "smoother, more polished"). Deeper screens slide in from the right
// like iOS, Back slides them away, tabs cross-fade. The tab bar and the game pager stay put. A swipe between
// games keeps its own slide (swipe.js); reduced motion gets no animation.
const htmlEl = document.documentElement;
function turn(dir) {
  if (!document.startViewTransition || dir === 'none' || !started || matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
  htmlEl.dataset.turn = dir;
  // The screen must always change, animation or not: if the browser hasn't started the turn within a
  // quarter second (a page drawn in the background, a busy phone), skip it and change the screen at once.
  let done = false;
  const step = () => { if (!done) { done = true; go(); } };
  const t = document.startViewTransition(step);
  const late = setTimeout(() => { if (!done) { t.skipTransition(); step(); } }, 250);
  t.finished.finally(() => { clearTimeout(late); if (htmlEl.dataset.turn === dir) delete htmlEl.dataset.turn; });
}
stack.push(location.hash || '#/');
// A screen changed its own link without a new step (Follow's sport tabs): adopt it, so Back and scroll memory match.
addEventListener('md:replaced', () => { const h = location.hash || '#/'; stack[stack.length - 1] = h; prevHash = h; if (route) route.hash = h; });

// ---------- Tab bar, as on iOS: a tab opens its main screen at the top; tapping the tab you're on
// scrolls it to the top.
document.querySelector('.tabs').addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  e.preventDefault();
  const root = a.getAttribute('href'), cur = location.hash || '#/';
  if (cur === root || (root === '#/' && (cur === '#' || cur === '#/'))) {
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  tabReset = true;
  location.hash = root;
});

// ---------- Actions (one listener for every button)
const ACT = {
  follow(d) {
    const item = JSON.parse(d.item);
    follow(d.kind, item);
    toast(`Following ${item.name}`);
  },
  unfollow(d) {
    const undo = unfollow(d.kind, d.key);
    if (undo) toast(`Unfollowed ${undo.item.name}`, undo);
  },
  cal(d) {
    const item = JSON.parse(d.item);
    addCal(d.kind, item);
    toast(`${item.name} added to your calendar`);
  },
  uncal(d) {
    const undo = removeCal(d.kind, d.key);
    if (undo) toast(`${undo.item.name} removed from your calendar`, undo);
  },
  back(d, el, e) {
    if (stack.length > 1) { e.preventDefault(); history.back(); }
  },
  theme(d) { set('theme', d.v); applyTheme(); },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act] || route?.view.actions?.[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'BUTTON') e.preventDefault();
  fn(el.dataset, el, e, ctx);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  const fn = el && route?.view.actions?.[el.dataset.input];
  if (fn) fn(el.value, el, ctx);
});

// ---------- Look
function applyTheme() {
  const t = settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  draw();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

// ---------- Redraw on any change; poll while something is live and the app is on screen.
on((why) => { if (why === 'picks') ctx.forget('mine'); draw(); });
setInterval(() => {
  if (document.hidden) return;
  if (ctx.live) for (const [k, e] of data) if (!e.p && e.t && Date.now() - e.t > e.maxAge) load(k, e);
  draw(); // countdowns and "updated" times
}, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  for (const [k, e] of data) if (!e.p && e.t && Date.now() - e.t > e.maxAge) load(k, e);
});
addEventListener('online', () => { for (const [k, e] of data) if (!e.p) load(k, e); });

rightsReady.then(draw);
go();

// Offline support on the live site; locally only with "?sw", so edits show straight away while building.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || /[?&]sw\b/.test(location.search))) {
  // New versions: check whenever the app comes back to the screen (iOS resumes the Home Screen app
  // rather than restarting it) and when it leaves. Reload into the new version only when it can't get
  // in the way: in the first moments on screen before a touch, or while the app is in the background.
  // Otherwise it waits until you leave, so a screen never reloads under your finger (Darren, 22 Oct 2026).
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false, waiting = false, shownAt = Date.now(), touched = false;
  const reload = () => { if (!reloading) { reloading = true; location.reload(); } };
  document.addEventListener('pointerdown', () => { touched = true; }, { capture: true, passive: true });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (document.hidden || (!touched && Date.now() - shownAt < 4000)) reload(); else waiting = true;
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && waiting) { reload(); return; }
      if (!document.hidden) { shownAt = Date.now(); touched = false; }
      reg.update().catch(() => {});
    });
  }).catch(() => {});
}
export { picks };
