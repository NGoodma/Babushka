-- Ids of the last questions this user got (newest last), so they are not repeated too soon.
ALTER TABLE users ADD COLUMN recent TEXT NOT NULL DEFAULT '[]';
