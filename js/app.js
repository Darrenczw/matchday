// App shell: routing, drawing, data loading, live polling, actions.
import { on, follow, unfollow, set, settings, picks, DEMO } from './store.js';
import { rightsReady } from './tv.js';
import { compInfo } from './espn.js';
import { toast } from './ui.js';
import home from './views/home.js';
import followView from './views/follow.js';
import comp from './views/comp.js';
import team from './views/team.js';
import match from './views/match.js';
import week from './views/week.js';
import settingsView from './views/settings.js';

const ROUTES = [
  [/^#?\/?$/, home, 'home'],
  [/^#\/follow(?:\/(soccer|nfl|nba))?$/, followView, 'follow'],
  [/^#\/c\/(\w+)\/([\w.]+)$/, comp, 'follow'],
  [/^#\/t\/(\w+)\/([\w.]+)\/(\d+)$/, team, 'follow'],
  [/^#\/m\/(\w+)\/([\w.]+)\/(\d+)$/, match, null],
  [/^#\/week$/, week, 'week'],
  [/^#\/settings$/, settingsView, 'settings'],
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
let raf = 0;
export function draw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }
function paint() {
  if (!route) return;
  ctx.live = false;
  let html;
  try { html = route.view(route.params, ctx); } catch (err) { console.error(err); html = `<div class="banner red">Something broke on this screen: ${err.message}</div>`; }
  if (html === lastHtml) return;
  lastHtml = html;
  const t = document.createElement('template');
  t.innerHTML = html;
  morphChildren(main, t.content);
}
function morph(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return; }
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.data !== b.data) a.data = b.data; return; }
  if (a.nodeType !== 1) return;
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
const scrolls = {};
let prevHash = location.hash;
function go() {
  scrolls[prevHash] = scrollY;
  const h = location.hash || '#/';
  for (const [re, view, tab] of ROUTES) {
    const m = h.match(re);
    if (!m) continue;
    route = { view, params: m.slice(1), hash: h };
    ctx.back = stack.length > 1 ? { href: stack[stack.length - 2], label: labelFor(stack[stack.length - 2]) } : null;
    if (tab) lastTab = tab;
    document.querySelectorAll('.tabs a').forEach((a) => (a.dataset.tab === lastTab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    lastHtml = '';
    main.innerHTML = '';
    paint();
    requestAnimationFrame(() => scrollTo(0, scrolls[h] || 0));
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
  if (h === '#/settings') return 'Settings';
  let m = h.match(/^#\/c\/(\w+)\/([\w.]+)$/);
  if (m) return compInfo(`${m[1]}/${m[2]}`).name;
  m = h.match(/^#\/t\/(\w+)\/[\w.]+\/(\d+)$/);
  if (m) return data.get(`team:${m[1]}:${m[2]}`)?.v?.short || 'Team';
  return 'Back';
}
const stack = [];
addEventListener('hashchange', () => {
  const h = location.hash || '#/';
  if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop(); else stack.push(h);
  go();
});
stack.push(location.hash || '#/');

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
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (DEMO) document.title = 'Matchday (sample picks)';
export { picks };
