-- 21 Oct 2026: R3-1, the helper as the app's backup (TECH-DESIGN section 14). Run once per database.
ALTER TABLE games ADD COLUMN home_abbr TEXT;
ALTER TABLE games ADD COLUMN away_abbr TEXT;
ALTER TABLE games ADD COLUMN home_score TEXT;
ALTER TABLE games ADD COLUMN away_score TEXT;
ALTER TABLE games ADD COLUMN clock TEXT;
ALTER TABLE games ADD COLUMN period INTEGER;
ALTER TABLE games ADD COLUMN status_name TEXT;
ALTER TABLE games ADD COLUMN detail TEXT;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
