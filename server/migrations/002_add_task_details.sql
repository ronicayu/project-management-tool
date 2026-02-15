-- Add details (description/notes) to tasks.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS details TEXT NOT NULL DEFAULT '';
