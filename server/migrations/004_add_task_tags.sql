-- Add tags (array of strings) to tasks for categorization.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
