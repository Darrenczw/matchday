// Home ground (R4): when a screen is about one sport, the page sits on a faint drawing of where
// that sport is played. Pitch lines, yard lines, a wooden court. No new colours: lines use --art.
const W = 390, H = 760;

function pitch() {
  return `<g stroke="var(--art)" stroke-width="2.5">
    <path d="M14 0V${H}M376 0V${H}"/>
    <rect x="92" y="-4" width="206" height="150"/><rect x="148" y="-4" width="94" height="52"/>
    <path d="M147 146a60 60 0 0 0 96 0"/><circle cx="195" cy="108" r="2.5" fill="var(--art)"/>
    <path d="M14 560H376"/><circle cx="195" cy="560" r="72"/><circle cx="195" cy="560" r="3" fill="var(--art)"/>
    <path d="M14 18a18 18 0 0 0 18-18M376 18a18 18 0 0 1-18-18"/></g>`;
}

function gridiron() {
  let s = '<g stroke="var(--art)" stroke-width="2.5">';
  for (let i = 0; i < 12; i++) s += `<path d="M0 ${38 + i * 66}H${W}"/>`;
  s += '</g><g stroke="var(--art2)" stroke-width="2">';
  for (let y = 38; y < H; y += 13.2) s += `<path d="M150 ${y}h10M230 ${y}h10M76 ${y}h8M306 ${y}h8"/>`;
  return s + '</g>';
}

function court() {
  const seams = [120, 300, 60, 420, 210, 520, 160, 360, 90, 470, 250, 30, 400, 180, 330];
  let s = '<g stroke="var(--art2)" stroke-width="1.5">';
  seams.forEach((y, i) => { const x = 13 + i * 26; s += `<path d="M${x} 0V${H}M${x - 26} ${y}h26M${x - 26} ${y + 380}h26"/>`; });
  return s + `</g><g stroke="var(--art)" stroke-width="2.5">
    <rect x="130" y="-4" width="130" height="196"/><circle cx="195" cy="192" r="62"/>
    <path d="M38 0V120A170 170 0 0 0 352 120V0"/><path d="M14 0V${H}M376 0V${H}M14 640H376"/><circle cx="195" cy="640" r="62"/></g>`;
}

const ART = { soccer: pitch, football: gridiron, basketball: court };
let shown = null;

// Called after every draw. sport = 'soccer' | 'football' | 'basketball', or '' for a mixed screen.
export function ground(sport) {
  const s = ART[sport] ? sport : '';
  if (s === shown) return;
  shown = s;
  const el = document.getElementById('ground');
  if (s) document.documentElement.dataset.sport = s; else delete document.documentElement.dataset.sport;
  if (el) el.innerHTML = s ? `<svg viewBox="0 0 ${W} ${H}" fill="none" aria-hidden="true">${ART[s]()}</svg>` : '';
}
