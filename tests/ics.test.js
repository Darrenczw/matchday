// Run: deno test tests/
import { assert, assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1';
import { calendar, fold, escapeText, title, description, utcStamp } from '../js/ics.js';

const base = {
  id: '401915312', path: 'soccer/uefa.champions', sport: 'soccer', start_utc: Date.UTC(2026, 9, 21, 19, 0), time_valid: 1,
  status: 'scheduled', home: 'Bayern Munich', away: 'Arsenal', venue: 'Allianz Arena, München', comp: 'Champions League',
  tv: ['UK: TNT Sports or Prime Video (Likely)', 'US: Paramount+ (Exact)'], why: '', seq: 0, checked_at: Date.UTC(2026, 9, 21, 5, 46),
  updated_at: Date.UTC(2026, 9, 21, 5, 46),
};
const NOW = Date.UTC(2026, 9, 21, 6, 0);
const unfold = (s) => s.replace(/\r\n /g, '');
const event = (ics, id) => unfold(ics).split('BEGIN:VEVENT').find((b) => b.includes(`UID:${id}@matchday`));

Deno.test('every line ends CRLF and is at most 75 bytes', () => {
  const ics = calendar([{ ...base, venue: 'A very long stadium name, with commas; and semicolons — and an em dash that is multibyte, repeated '.repeat(3) }], { now: NOW });
  assert(ics.endsWith('\r\n'));
  for (const line of ics.split('\r\n').slice(0, -1)) assert(new TextEncoder().encode(line).length <= 75, line);
  assert(!/[^\r]\n/.test(ics), 'bare LF found');
});

Deno.test('fold never splits a multibyte character', () => {
  const folded = fold('SUMMARY:' + '⚽'.repeat(40));
  for (const part of folded.split('\r\n')) assert(new TextEncoder().encode(part).length <= 75);
  assertEquals(folded.replace(/\r\n /g, ''), 'SUMMARY:' + '⚽'.repeat(40));
});

Deno.test('text is escaped', () => {
  assertEquals(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

Deno.test('times are UTC, end by sport', () => {
  const e = event(calendar([base], { now: NOW }), base.id);
  assertStringIncludes(e, 'DTSTART:20261021T190000Z');
  assertStringIncludes(e, 'DTEND:20261021T210000Z'); // football 2 h
  const nfl = event(calendar([{ ...base, id: 'n1', sport: 'football', home: 'Bears', away: 'Patriots' }], { now: NOW }), 'n1');
  assertStringIncludes(nfl, 'DTEND:20261021T223000Z'); // NFL 3 h 30
});

Deno.test('titles follow sport order and emoji', () => {
  assertEquals(title(base), '⚽ Bayern Munich v Arsenal');
  assertEquals(title({ ...base, sport: 'football', home: 'Bears', away: 'Patriots' }), '🏈 Patriots @ Bears');
  assertEquals(title({ ...base, sport: 'basketball', home: 'Spurs', away: 'Thunder' }), '🏀 Thunder @ Spurs');
});

Deno.test('time TBC becomes an all-day event on the Singapore date', () => {
  // 19:00Z on 21 Oct is 03:00 on 22 Oct in Singapore.
  const e = event(calendar([{ ...base, time_valid: 0 }], { now: NOW }), base.id);
  assertStringIncludes(e, 'DTSTART;VALUE=DATE:20261022');
  assertStringIncludes(e, 'DTEND;VALUE=DATE:20261023');
  assertStringIncludes(e, 'SUMMARY:⚽ Bayern Munich v Arsenal (time TBC)');
});

Deno.test('a moved game keeps its ID, raises SEQUENCE, and says where it moved from', () => {
  const moved = { ...base, start_utc: base.start_utc + 30 * 60e3, seq: 2, prev_start: base.start_utc, moved_at: NOW };
  const e = event(calendar([moved], { now: NOW }), base.id);
  assertStringIncludes(e, 'UID:401915312@matchday');
  assertStringIncludes(e, 'SEQUENCE:2');
  assertStringIncludes(e, 'DTSTART:20261021T193000Z');
  assertStringIncludes(e, 'Moved from Thu 03:00 (changed 21 Oct)');
});

Deno.test('postponed is marked, kept, never dropped', () => {
  const ics = calendar([{ ...base, status: 'postponed' }], { now: NOW });
  const e = event(ics, base.id);
  assert(e, 'event missing');
  assertStringIncludes(e, 'SUMMARY:POSTPONED: ⚽ Bayern Munich v Arsenal');
  assertStringIncludes(e, 'STATUS:TENTATIVE');
});

Deno.test('notes: competition, TV, unconfirmed, time checked', () => {
  const d = description({ ...base, unconfirmed: 1, why: 'Weekday morning' });
  assertMatch(d, /^Champions League/);
  assertStringIncludes(d, 'UK: TNT Sports or Prime Video (Likely)');
  assertStringIncludes(d, 'Time unconfirmed');
  assertStringIncludes(d, 'Good for you: Weekday morning');
  assertStringIncludes(d, 'Time checked 13:46 SGT');
});

Deno.test('calendar header asks for a 5-minute refresh', () => {
  const ics = calendar([], { now: NOW });
  assertStringIncludes(ics, 'X-WR-CALNAME:Matchday');
  assertStringIncludes(ics, 'REFRESH-INTERVAL;VALUE=DURATION:PT5M');
  assertStringIncludes(ics, 'X-PUBLISHED-TTL:PT5M');
  assertMatch(ics, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
  assertEquals(utcStamp(NOW), '20261021T060000Z');
});
