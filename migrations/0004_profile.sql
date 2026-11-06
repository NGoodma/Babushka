-- Telegram profile, refreshed on every message or button press (people change usernames).
ALTER TABLE users ADD COLUMN username TEXT;   -- without "@", NULL if the user has none
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
