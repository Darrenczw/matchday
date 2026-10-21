// The Matchday calendar feed (iCalendar, RFC 5545). Shared by the calendar helper (Worker) and the app.
// Times are written in UTC, so the iPhone always shows local time wherever Darren is.
import { sg } from './util.js';

const CRLF = '\r\n';
const EMOJI = { soccer: '⚽', football: '🏈', basketball: '🏀' };
const LENGTH_MIN = { soccer: 120, basketball: 150, football: 210 };
const APP = 'https://darrenczw.github.io/matchday/';

export const escapeText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 bytes continue on the next line after a space. Never split a character.
const enc = new TextEncoder();
export function fold(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > 75) { out.push(cur); cur = ' '; len = 1; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join(CRLF);
}

export const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateStamp = (key) => key.replaceAll('-', '');
const nextDay = (key) => { const d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// "⚽ Arsenal v Chelsea", "🏈 Patriots @ Bears"; POSTPONED first, "(time TBC)" last.
export function title(g) {
  const teams = g.sport === 'soccer' ? `${g.home} v ${g.away}` : `${g.away} @ ${g.home}`;
  let t = `${EMOJI[g.sport] || ''} ${teams}`.trim();
  if (g.status === 'postponed') t = `POSTPONED: ${t}`;
  else if (g.status === 'canceled') t = `CANCELLED: ${t}`;
  else if (!g.time_valid) t += ' (time TBC)';
  return t;
}

const when = (ms) => { const s = sg(ms); return `${s.wd} ${s.hm}`; };
const day = (ms) => { const s = sg(ms); return `${s.d} ${s.mo}`; };

export function description(g) {
  const lines = [g.comp];
  if (g.status === 'postponed') lines.push('POSTPONED. A new date will replace this when it is set.');
  if (g.prev_start && g.moved_at) lines.push(`Moved from ${when(g.prev_start)} (changed ${day(g.moved_at)})`);
  if (g.unconfirmed) {
    lines.push(g.second_start ? `Time unconfirmed: TheSportsDB says ${when(g.second_start)}. Showing ESPN's time until they agree.`
      : g.second_note === 'postponed' ? "Time unconfirmed: TheSportsDB lists this game as postponed. Showing ESPN's time."
        : 'Time unconfirmed: two sources disagree. Showing the ESPN time.');
  }
  if (g.tv?.length) lines.push(...g.tv);
  if (g.why) lines.push(`Good for you: ${g.why}`);
  if (g.checked_at) lines.push(`Time checked ${sg(g.checked_at).hm} SGT`);
  return lines.filter(Boolean).join('\n');
}

export function vevent(g, now) {
  const p = [
    'BEGIN:VEVENT',
    `UID:${g.id}@matchday`,
    `DTSTAMP:${utcStamp(g.updated_at || now)}`,
    `SEQUENCE:${g.seq || 0}`,
  ];
  if (g.time_valid && g.status !== 'postponed') {
    p.push(`DTSTART:${utcStamp(g.start_utc)}`, `DTEND:${utcStamp(g.start_utc + (LENGTH_MIN[g.sport] || 120) * 60e3)}`);
  } else {
    const key = sg(g.start_utc).key; // the day it's listed on, in Singapore
    p.push(`DTSTART;VALUE=DATE:${dateStamp(key)}`, `DTEND;VALUE=DATE:${dateStamp(nextDay(key))}`);
  }
  p.push(`SUMMARY:${escapeText(title(g))}`);
  if (g.venue) p.push(`LOCATION:${escapeText(g.venue)}`);
  p.push(`DESCRIPTION:${escapeText(description(g))}`);
  if (g.path) p.push(`URL:${APP}#/m/${g.path}/${g.id}`);
  p.push(`STATUS:${g.status === 'canceled' ? 'CANCELLED' : g.status === 'postponed' ? 'TENTATIVE' : 'CONFIRMED'}`);
  p.push('TRANSP:TRANSPARENT'); // a game shouldn't make Darren look busy to others
  p.push('END:VEVENT');
  return p;
}

// games: rows from the helper's database (see TECH-DESIGN section 5). Kept, never dropped, when postponed.
export function calendar(games, { now = Date.now(), name = 'Matchday' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Matchday//Calendar 1//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`, 'X-WR-CALDESC:Your games\\, kept up to date by Matchday.',
    'REFRESH-INTERVAL;VALUE=DURATION:PT5M', 'X-PUBLISHED-TTL:PT5M',
  ];
  for (const g of [...games].sort((a, b) => a.start_utc - b.start_utc)) lines.push(...vevent(g, now));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}
