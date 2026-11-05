-- One row per subscriber.
CREATE TABLE users (
  chat_id    INTEGER PRIMARY KEY,
  slot       INTEGER NOT NULL,            -- 0..12: send time = 10:00 + 5 min * slot (Moscow)
  every      INTEGER NOT NULL DEFAULT 1,  -- days between messages, 1..7
  last_sent  TEXT,                        -- Moscow date (YYYY-MM-DD) of the last scheduled message
  sent_count INTEGER NOT NULL DEFAULT 0,  -- drives question rotation
  excluded   TEXT NOT NULL DEFAULT '[]',  -- JSON array of question ids the user turned off
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX users_slot ON users (slot);
