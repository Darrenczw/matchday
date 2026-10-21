-- Matchday calendar helper database (Cloudflare D1). See TECH-DESIGN.md section 5.
CREATE TABLE IF NOT EXISTS owner (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  edit_key_hash TEXT NOT NULL,
  feed_token TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- Calendar picks (what goes in the feed), Follow picks (tracked for the app's backup, never in the feed),
-- TV market order and "Good for you" prefs.
CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  sport TEXT NOT NULL,
  start_utc INTEGER NOT NULL,
  time_valid INTEGER NOT NULL,
  status TEXT NOT NULL,            -- scheduled | live | final | postponed | canceled
  home TEXT, away TEXT, home_id TEXT, away_id TEXT,
  venue TEXT, comp TEXT, country TEXT,
  us_tv TEXT,                      -- JSON list of US channels listed by ESPN
  postseason INTEGER DEFAULT 0, note TEXT,
  seq INTEGER NOT NULL DEFAULT 0,  -- raised on every change iOS should see
  prev_start INTEGER, moved_at INTEGER,
  unconfirmed INTEGER DEFAULT 0, second_checked_at INTEGER,
  home_full TEXT, away_full TEXT,  -- full team names, for matching the second source
  tsdb_id TEXT, second_start INTEGER,
  second_note TEXT,                -- agree | differ | postponed | notime | nomatch
  home_abbr TEXT, away_abbr TEXT,  -- for the app's backup (/api/games)
  home_score TEXT, away_score TEXT, -- null before kick-off
  clock TEXT, period INTEGER, status_name TEXT, detail TEXT,
  backup_at INTEGER,               -- last look-up in a backup source while ESPN was down
  checked_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,     -- last change iOS should see
  source TEXT DEFAULT 'espn'      -- where the row last came from: espn | nflverse | footballdata | tsdb
);
CREATE INDEX IF NOT EXISTS games_start ON games (start_utc);
-- When each calendar pick next needs its schedule refreshed, and where a league walk has got to.
CREATE TABLE IF NOT EXISTS jobs (
  key TEXT PRIMARY KEY,
  next_at INTEGER NOT NULL,
  cursor TEXT
);
CREATE TABLE IF NOT EXISTS fetches (at INTEGER NOT NULL, ua TEXT);
CREATE INDEX IF NOT EXISTS fetches_at ON fetches (at);
CREATE TABLE IF NOT EXISTS runs (at INTEGER NOT NULL, ok INTEGER NOT NULL, checked INTEGER, note TEXT);
CREATE INDEX IF NOT EXISTS runs_at ON runs (at);
-- Small values: espn_ok_at, espn_down_since (ESPN is down when this is later than espn_ok_at), nflverse_at (last good
-- read), nflverse_try_at, backup_at.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
