-- FTLTG fan feeds (reddit.js): each Reddit feed's items, and the subreddits and threads apps asked for.
CREATE TABLE IF NOT EXISTS rfeeds (key TEXT PRIMARY KEY, at INTEGER, next_at INTEGER, body TEXT, err TEXT);
CREATE TABLE IF NOT EXISTS rwant (key TEXT PRIMARY KEY, kind TEXT NOT NULL, seen_at INTEGER NOT NULL);
