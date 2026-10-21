// Team and competition identity: colour pairs, the kit clash rule, sport order, crests.
import { esc } from './util.js';
import { awayKit } from './kits.js';

export const NEUTRAL = '#3a3d45';
export const hex = (c) => (c && /^#?[0-9a-f]{6}$/i.test(c) ? '#' + c.replace('#', '').toLowerCase() : null);

// ---------- Colour maths (WCAG contrast; CIEDE2000 for "looks too close")
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
export function lum(h) { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

function lab(h) {
  const [r, g, b] = rgb(h).map(lin);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
export function de2000(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2);
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (deg(Math.atan2(b1, a1p)) + 360) % 360, h2p = (deg(Math.atan2(b2, a2p)) + 360) % 360;
  let dh = h2p - h1p; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dLp = L2 - L1, dCp = C2p - C1p, dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2, hs = h1p + h2p;
  const hbp = C1p * C2p === 0 ? hs : Math.abs(h1p - h2p) <= 180 ? hs / 2 : hs < 360 ? (hs + 360) / 2 : (hs - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp)) + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63));
  const dth = 30 * Math.exp(-(((hbp - 275) / 25) ** 2)), RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T, RT = -Math.sin(rad(2 * dth)) * RC;
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}
// Tuned on real pairs (21 Oct 2026): Bayern v Arsenal 3.6, Chelsea v Everton 17.9, Patriots v Bears 6.5 clash;
// Chelsea v Man City 37 and Thunder v Nuggets 31.5 don't.
export const clash = (a, b) => de2000(a, b) < 20;

// Number colour on a shirt: the team's other colour if it reads at 4.5:1, else white, else ink.
export function inkOn(bg, alt) {
  for (const c of [alt, '#ffffff', '#121318']) if (c && contrast(bg, c) >= 4.5) return c;
  return contrast(bg, '#ffffff') > contrast(bg, '#121318') ? '#ffffff' : '#121318';
}

// A few brand colours sit where neither white nor ink text reaches 4.5:1 (Chargers blue 4.33,
// Sunderland red 4.48). Darken those a touch until white text passes; the eye barely sees it.
function mixBlack(h, t) { return '#' + rgb(h).map((v) => Math.round(v * (1 - t)).toString(16).padStart(2, '0')).join(''); }
export function readable(bg) {
  let b = bg;
  for (let i = 0; i < 10 && Math.max(contrast(b, '#ffffff'), contrast(b, '#121318')) < 4.5; i++) b = mixBlack(b, 0.04);
  return b;
}

export function colourName(h) {
  const [r, g, b] = rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.08) return l > 0.85 ? 'white' : l < 0.18 ? 'black' : 'grey';
  let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360;
  if (hue < 15 || hue >= 340) return l < 0.3 ? 'claret' : 'red';
  if (hue < 40) return 'orange'; if (hue < 65) return l < 0.45 ? 'gold' : 'yellow'; if (hue < 160) return 'green';
  if (hue < 190) return 'teal'; if (hue < 215) return l > 0.55 ? 'sky blue' : 'blue';
  if (hue < 255) return l < 0.3 ? 'navy' : 'blue'; if (hue < 300) return 'purple'; return l < 0.35 ? 'claret' : 'pink';
}

// ---------- Sport order: football home on the left ("v"); NFL and NBA away left, home right ("@").
export const order = (g) => (g.sport === 'soccer' ? [g.home, g.away, 'v'] : [g.away, g.home, '@']);

// The kit clash rule. Home never changes. Away tries: away kit, third kit (Wikipedia, football only),
// second brand colour, then white for NFL and NBA.
let teamHook = null;
export const setTeamHook = (fn) => { teamHook = fn; };
export function kitsFor(g) {
  teamHook?.(g);
  const hb = g.home.color || NEUTRAL;
  let ab = g.away.color || NEUTRAL, worn = null;
  if (g.home.color && g.away.color && clash(hb, ab)) {
    const tries = [];
    if (g.sport === 'soccer') {
      const k = awayKit(g.away);
      if (k?.away) tries.push(['away', k.away]);
      if (k?.third) tries.push(['third', k.third]);
    }
    tries.push(['second', g.away.alt]);
    if (g.sport !== 'soccer') tries.push(['white', '#ffffff']);
    for (const [kind, c] of tries) if (c && !clash(hb, c)) { ab = c; worn = kind; break; }
  }
  const pair = (t, kit) => { const bg = readable(kit); return { team: t, bg, ink: inkOn(bg, kit === t.color ? t.alt : t.color), light: lum(bg) > 0.7, dark: lum(bg) < 0.02 }; };
  const home = pair(g.home, hb), away = { ...pair(g.away, ab), worn };
  return g.sport === 'soccer' ? { left: home, right: away, sep: 'v', home, away } : { left: away, right: home, sep: '@', home, away };
}
// Near-white kits get a hairline on white rows; near-black kits get one on dark rows (dark mode only).
export const kitEdge = (k) => (k.light ? ' lightkit' : k.dark ? ' darkkit' : '');
export function clashNote(g, k) {
  if (!k.away.worn) return '';
  const what = { away: 'away kit', third: 'third kit', second: 'second colour', white: 'white' }[k.away.worn];
  const same = colourName(k.home.bg), now = colourName(k.away.bg);
  return `Both teams play in ${same}, so ${g.away.short} is shown in ${k.away.worn === 'white' ? 'white' : `its ${now} ${what}`}.`;
}

// ---------- Crests: resized through ESPN's image service; initials if a logo is missing or broken.
// Two shared sizes, so a logo downloads once and is reused everywhere (rows, match header, tables, chips): every
// crest up to 46px uses the 96px file, team and competition badges the 160px one. Kept by the service worker.
export function logoSrc(url, px) {
  if (!url) return '';
  const m = url.match(/^https:\/\/a\.espncdn\.com(\/i\/.+\.png)$/);
  const w = px <= 140 ? 96 : 160;
  return m ? `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${w}&h=${w}` : url;
}
export function initials(name = '') {
  const w = String(name).replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w.slice(0, 3).map((x) => x[0]).join('') : (w[0] || '?').slice(0, 3)).toUpperCase();
}
export const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

// ESPN keeps a dark-background version of most logos at ".../500-dark/...". Used on dark neutral
// surfaces only; if one is missing, the light logo is used instead.
export const themed = (url) => (url && isDark() ? url.replace(/\/i\/(teamlogos\/[\w]+|leaguelogos\/soccer)\/500\//, '/i/$1/500-dark/') : url);

// patch: the white round badge used on team colours, so a red crest never vanishes on a red shirt.
export function crest(t, size, patch = false) {
  const ini = esc(t.abbr || initials(t.short || t.name));
  const url = patch ? t.logo : (isDark() && (t.logoDark || themed(t.logo))) || t.logo;
  const cls = patch ? 'pt' : 'crest';
  if (!url) return `<span class="ini${patch ? '' : ' flat'}" style="width:${size}px;height:${size}px">${ini}</span>`;
  return `<img class="${cls}" src="${esc(logoSrc(url, size * 3))}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async" data-ini="${ini}" data-flat="${patch ? '' : '1'}" data-light="${esc(logoSrc(t.logo, size * 3))}">`;
}
// A team-colour mark (badge, bar, chip) that would melt into the card behind it gets a hairline edge.
export function edge(bg) {
  const dark = isDark();
  return contrast(bg, dark ? '#1c1d22' : '#ffffff') < 1.6 ? `box-shadow:inset 0 0 0 1px ${dark ? 'rgba(255,255,255,.32)' : 'rgba(18,19,24,.25)'}` : '';
}
// A competition logo on a neutral surface.
export const compImg = (logo, size, name = '') => (logo ? crest({ logo, name, abbr: initials(name) }, size) : '');
// One listener swaps any broken logo for an initials crest.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.ini) return;
  if (img.dataset.light && img.getAttribute('src') !== img.dataset.light) { img.src = img.dataset.light; return; }
  const s = document.createElement('span');
  s.className = 'ini' + (img.dataset.flat ? ' flat' : '');
  s.style.width = s.style.height = img.getAttribute('width') + 'px';
  s.textContent = img.dataset.ini;
  img.replaceWith(s);
}, true);

// ---------- Competitions as brands. Curated colours; anything else gets a calm neutral.
const BRAND = {
  'soccer/eng.1': '#37003c', 'soccer/uefa.champions': '#0a1f5c', 'soccer/uefa.europa': '#e65c00', 'soccer/uefa.europa.conf': '#00a651',
  'soccer/esp.1': '#e8392f', 'soccer/ita.1': '#0a3a8c', 'soccer/ger.1': '#d20515', 'soccer/fra.1': '#0e1e3e', 'soccer/eng.fa': '#0b2a5b',
  'soccer/eng.league_cup': '#007a3d', 'soccer/eng.2': '#1b3b7a', 'soccer/sco.1': '#2a1a5e', 'soccer/usa.1': '#1a2b4c', 'soccer/sgp.1': '#c8102e',
  'soccer/fifa.world': '#326295', 'soccer/afc.asian.cup': '#00573f', 'soccer/uefa.nations': '#0d2c54', 'soccer/ned.1': '#ff4c00', 'soccer/por.1': '#0f2a52',
  'football/nfl': '#013369', 'basketball/nba': '#1d428a',
};
export const brand = (path) => BRAND[path] || '#2b2d33';
export function compLogo(path, id) {
  if (path === 'football/nfl') return 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png';
  if (path === 'basketball/nba') return 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png';
  return id ? `https://a.espncdn.com/i/leaguelogos/soccer/500/${id}.png` : '';
}

// Group the 220 football competitions by country or region, from the slug prefix.
const REGION = {
  eng: 'England', sco: 'Scotland', esp: 'Spain', ita: 'Italy', ger: 'Germany', fra: 'France', ned: 'Netherlands', por: 'Portugal', bel: 'Belgium',
  tur: 'Turkey', gre: 'Greece', aut: 'Austria', den: 'Denmark', swe: 'Sweden', nor: 'Norway', rus: 'Russia', uefa: 'Europe',
  usa: 'USA', can: 'Canada', mex: 'Mexico', concacaf: 'North and Central America', hon: 'North and Central America', crc: 'North and Central America',
  gua: 'North and Central America', slv: 'North and Central America', bra: 'Brazil', arg: 'Argentina', conmebol: 'South America', chi: 'South America',
  col: 'South America', bol: 'South America', uru: 'South America', par: 'South America', per: 'South America', ecu: 'South America', ven: 'South America',
  afc: 'Asia', aff: 'Asia', jpn: 'Asia', chn: 'Asia', ind: 'Asia', ksa: 'Asia', sgp: 'Asia', aus: 'Australia', caf: 'Africa', rsa: 'Africa',
  fifa: 'International', global: 'International', nonfifa: 'International', friendly: 'International', club: 'International', campeones: 'International',
};
export const REGION_ORDER = ['England', 'Europe', 'Spain', 'Italy', 'Germany', 'France', 'Scotland', 'Netherlands', 'Portugal', 'International', 'Asia', 'Australia', 'USA', 'Canada', 'Mexico', 'North and Central America', 'Brazil', 'Argentina', 'South America', 'Africa'];
export const regionOf = (slug) => REGION[slug.split('.')[0]] || 'Other';
