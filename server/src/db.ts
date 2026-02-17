import pg from 'pg'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? 'postgresql://teu:teu@localhost:5435/teu'

const pool = new Pool({
  connectionString,
})

const TASK_SELECT =
  'id, project_id, title, start_date, duration, parent_id, COALESCE(dependency_ids, ARRAY[]::uuid[]) AS dependency_ids, COALESCE(details, \'\') AS details, COALESCE(tags, ARRAY[]::text[]) AS tags, canvas_x, canvas_y, canvas_color, created_at'

export interface ProjectRow {
  id: string
  name: string
  created_at: Date
}

export interface TaskRow {
  id: string
  project_id: string
  title: string
  start_date: string | null
  duration: number
  parent_id: string | null
  dependency_ids: string[]
  details: string
  tags: string[]
  canvas_x: number | null
  canvas_y: number | null
  canvas_color: string | null
  created_at: Date
}

function rowToTask(row: TaskRow) {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date ?? null,
    duration: row.duration,
    parentId: row.parent_id,
    dependencyIds: row.dependency_ids ?? [],
    details: row.details ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    canvasX: row.canvas_x ?? null,
    canvasY: row.canvas_y ?? null,
    canvasColor: row.canvas_color ?? null,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function rowToProject(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export async function getProjects() {
  const res = await pool.query<ProjectRow>(
    'SELECT id, name, created_at FROM projects ORDER BY created_at'
  )
  return res.rows.map(rowToProject)
}

export async function createProject(name: string) {
  const res = await pool.query<ProjectRow>(
    'INSERT INTO projects (name) VALUES ($1) RETURNING id, name, created_at',
    [name]
  )
  return rowToProject(res.rows[0])
}

export async function getProjectById(id: string) {
  const res = await pool.query<ProjectRow>(
    'SELECT id, name, created_at FROM projects WHERE id = $1',
    [id]
  )
  return res.rows[0] ? rowToProject(res.rows[0]) : null
}

export async function deleteProject(id: string): Promise<boolean> {
  const res = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id])
  return (res.rowCount ?? 0) > 0
}

export async function getTasksByProjectId(projectId: string) {
  const res = await pool.query<TaskRow>(
    `SELECT ${TASK_SELECT} FROM tasks WHERE project_id = $1 ORDER BY created_at`,
    [projectId]
  )
  return res.rows.map(rowToTask)
}

export async function createTaskInProject(
  projectId: string,
  title: string,
  startDate: string | null,
  duration: number,
  parentId: string | null = null,
  dependencyIds: string[] = [],
  details: string = '',
  tags: string[] = []
) {
  const res = await pool.query<TaskRow>(
    `INSERT INTO tasks (project_id, title, start_date, duration, parent_id, dependency_ids, details, tags)
     VALUES ($1, $2, $3::date, $4, $5, $6::uuid[], $7, $8::text[])
     RETURNING ${TASK_SELECT}`,
    [projectId, title, startDate || null, duration, parentId, dependencyIds, details ?? '', tags ?? []]
  )
  return rowToTask(res.rows[0])
}

export async function updateTask(
  id: string,
  updates: { title?: string; startDate?: string; duration?: number; parentId?: string | null; dependencyIds?: string[]; details?: string; tags?: string[]; canvasX?: number | null; canvasY?: number | null; canvasColor?: string | null }
) {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1
  if (updates.title !== undefined) {
    fields.push(`title = $${i++}`)
    values.push(updates.title)
  }
  if (updates.startDate !== undefined) {
    fields.push(`start_date = $${i++}::date`)
    values.push(updates.startDate === null || updates.startDate === '' ? null : updates.startDate)
  }
  if (updates.duration !== undefined) {
    fields.push(`duration = $${i++}`)
    values.push(updates.duration)
  }
  if (updates.parentId !== undefined) {
    fields.push(`parent_id = $${i++}::uuid`)
    values.push(updates.parentId === null || updates.parentId === '' ? null : updates.parentId)
  }
  if (updates.dependencyIds !== undefined) {
    fields.push(`dependency_ids = $${i++}::uuid[]`)
    values.push(updates.dependencyIds)
  }
  if (updates.details !== undefined) {
    fields.push(`details = $${i++}`)
    values.push(updates.details)
  }
  if (updates.tags !== undefined) {
    fields.push(`tags = $${i++}::text[]`)
    values.push(Array.isArray(updates.tags) ? updates.tags : [])
  }
  if (updates.canvasX !== undefined) {
    fields.push(`canvas_x = $${i++}`)
    values.push(updates.canvasX)
  }
  if (updates.canvasY !== undefined) {
    fields.push(`canvas_y = $${i++}`)
    values.push(updates.canvasY)
  }
  if (updates.canvasColor !== undefined) {
    fields.push(`canvas_color = $${i++}`)
    values.push(updates.canvasColor)
  }
  if (fields.length === 0) return null
  values.push(id)
  const res = await pool.query<TaskRow>(
    `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${TASK_SELECT}`,
    values
  )
  return res.rows[0] ? rowToTask(res.rows[0]) : null
}

export async function deleteTask(id: string): Promise<boolean> {
  const res = await pool.query(
    'DELETE FROM tasks WHERE id = $1 OR parent_id = $1 RETURNING id',
    [id]
  )
  if (res.rowCount === 0) return false
  await pool.query(
    `UPDATE tasks SET dependency_ids = array_remove(dependency_ids, $1::uuid) WHERE $1::uuid = ANY(dependency_ids)`,
    [id]
  )
  return true
}

export async function addDependency(taskId: string, dependsOnTaskId: string): Promise<boolean> {
  if (taskId === dependsOnTaskId) return true
  const res = await pool.query(
    `UPDATE tasks SET dependency_ids = array_append(COALESCE(dependency_ids, ARRAY[]::uuid[]), $2::uuid)
     WHERE id = $1::uuid AND NOT ($2::uuid = ANY(COALESCE(dependency_ids, ARRAY[]::uuid[])))
     RETURNING id`,
    [taskId, dependsOnTaskId]
  )
  return (res.rowCount ?? 0) > 0
}

export async function removeDependency(taskId: string, dependsOnTaskId: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE tasks SET dependency_ids = array_remove(COALESCE(dependency_ids, ARRAY[]::uuid[]), $2::uuid)
     WHERE id = $1::uuid RETURNING id`,
    [taskId, dependsOnTaskId]
  )
  return (res.rowCount ?? 0) > 0
}

export async function getProjectStats() {
  const res = await pool.query(`
    SELECT
      p.id as project_id,
      COALESCE(s.total_tasks, 0)::int as total_tasks,
      COALESCE(s.in_progress, 0)::int as in_progress,
      COALESCE(s.done, 0)::int as done,
      s.latest_due
    FROM projects p
    LEFT JOIN (
      SELECT
        project_id,
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE start_date IS NOT NULL AND start_date <= CURRENT_DATE AND (start_date + duration) > CURRENT_DATE) as in_progress,
        COUNT(*) FILTER (WHERE start_date IS NOT NULL AND (start_date + duration) <= CURRENT_DATE) as done,
        MAX(start_date + duration) as latest_due
      FROM tasks
      GROUP BY project_id
    ) s ON s.project_id = p.id
  `)
  return res.rows.map((row: { project_id: string; total_tasks: number; in_progress: number; done: number; latest_due: Date | null }) => ({
    projectId: row.project_id,
    totalTasks: Number(row.total_tasks),
    inProgress: Number(row.in_progress),
    done: Number(row.done),
    latestDue: row.latest_due ? new Date(row.latest_due).toISOString().split('T')[0] : null,
  }))
}

export async function getTaskById(id: string) {
  const res = await pool.query<TaskRow>(
    `SELECT ${TASK_SELECT} FROM tasks WHERE id = $1`,
    [id]
  )
  return res.rows[0] ? rowToTask(res.rows[0]) : null
}
