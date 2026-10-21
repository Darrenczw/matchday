-- 21 Oct 2026: R3-3, backup sources while ESPN is down (TECH-DESIGN 14.9). Run once per database.
ALTER TABLE games ADD COLUMN backup_at INTEGER;
