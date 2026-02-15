-- Run once on existing DBs that have tasks without project_id.
-- Creates projects table, adds a default project, migrates existing tasks to it, adds NOT NULL project_id.

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- If tasks table exists without project_id, add column and migrate
DO $$
DECLARE proj_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'project_id') THEN
      INSERT INTO projects (name) VALUES ('Default') RETURNING id INTO proj_id;
      ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
      UPDATE tasks SET project_id = proj_id;
      ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    END IF;
  END IF;
END $$;
