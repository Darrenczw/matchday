-- Football player faces (faces.js, TECH-DESIGN 15): one row per ESPN football player; squads read per league and team.
CREATE TABLE IF NOT EXISTS faces (id TEXT PRIMARY KEY, name TEXT NOT NULL, team TEXT NOT NULL DEFAULT '', born INTEGER, cut TEXT, wiki TEXT, wiki_at INTEGER, tsdb_at INTEGER, want_at INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS faces_due ON faces (tsdb_at, want_at);
CREATE TABLE IF NOT EXISTS fsquads (key TEXT PRIMARY KEY, at INTEGER NOT NULL, body TEXT);
