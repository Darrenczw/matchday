// A whole-season feed from live ESPN data must parse cleanly with Mozilla's iCalendar parser (ical.js).
// Run: deno test --allow-net tests/
import { assert, assertEquals } from 'jsr:@std/assert@1';
import ICAL from 'npm:ical.js@2';
import { calendar } from '../js/ics.js';

Deno.test({ name: 'live sample: Arsenal and Bears full seasons parse, one event per game', sanitizeResources: false, async fn() {
  const rows = [];
  for (const [path, url] of [['soccer/eng.1', 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/359/schedule?fixture=true'],
    ['football/nfl', 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/3/schedule']]) {
    const d = await (await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Matchday personal app)" } })).json();
    for (const e of d.events) {
      const c = e.competitions[0], h = c.competitors.find((x) => x.homeAway === 'home'), a = c.competitors.find((x) => x.homeAway === 'away');
      rows.push({ id: e.id, path, sport: path.split('/')[0], start_utc: Date.parse(e.date), time_valid: e.timeValid !== false && c.timeValid !== false ? 1 : 0,
        status: /POSTPONED/.test(c.status?.type?.name || '') ? 'postponed' : 'scheduled', home: h.team.displayName, away: a.team.displayName,
        venue: c.venue?.fullName || '', comp: e.league?.name || 'NFL', tv: [], seq: 0, checked_at: Date.now(), updated_at: Date.now() });
    }
  }
  const ics = calendar(rows);
  const comp = new ICAL.Component(ICAL.parse(ics));
  const events = comp.getAllSubcomponents('vevent');
  assertEquals(events.length, rows.length);
  for (const ev of events) {
    const e = new ICAL.Event(ev);
    assert(e.uid.endsWith('@matchday'));
    assert(e.startDate, 'start missing');
    assert(e.summary.length > 3);
  }
  console.log(`  ${rows.length} events, ${(ics.length / 1024).toFixed(1)} KB, ${rows.filter((r) => !r.time_valid).length} with time TBC`);
} });
