-- Run with: psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  duration INTEGER NOT NULL CHECK (duration >= 1),
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
