-- 21 Oct 2026: second-source check (TheSportsDB). Run once per database.
ALTER TABLE games ADD COLUMN home_full TEXT;
ALTER TABLE games ADD COLUMN away_full TEXT;
ALTER TABLE games ADD COLUMN tsdb_id TEXT;
ALTER TABLE games ADD COLUMN second_start INTEGER;
ALTER TABLE games ADD COLUMN second_note TEXT;
