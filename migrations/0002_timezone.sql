-- Send at the user's local time; 12 slots (10:00..10:55) instead of 13.
ALTER TABLE users ADD COLUMN tz TEXT NOT NULL DEFAULT 'Europe/Moscow';
UPDATE users SET slot = slot % 12;
