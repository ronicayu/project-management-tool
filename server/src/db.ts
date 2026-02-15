import pg from 'pg'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://teu:teu@localhost:5435/teu'

const pool = new Pool({
  connectionString,
})

export interface TaskRow {
  id: string
  title: string
  start_date: string
  duration: number
  parent_id: string | null
  dependency_ids: string[]
  created_at: Date
}

function rowToTask(row: TaskRow) {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    duration: row.duration,
    parentId: row.parent_id,
    dependencyIds: row.dependency_ids ?? [],
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export async function getTasks() {
  const res = await pool.query<TaskRow>(
    'SELECT id, title, start_date, duration, parent_id, COALESCE(dependency_ids, ARRAY[]::uuid[]) AS dependency_ids, created_at FROM tasks ORDER BY created_at'
  )
  return res.rows.map(rowToTask)
}

export async function createTask(
  title: string,
  startDate: string,
  duration: number,
  parentId: string | null = null,
  dependencyIds: string[] = []
) {
  const res = await pool.query<TaskRow>(
    `INSERT INTO tasks (title, start_date, duration, parent_id, dependency_ids)
     VALUES ($1, $2, $3, $4, $5::uuid[])
     RETURNING id, title, start_date, duration, parent_id, COALESCE(dependency_ids, ARRAY[]::uuid[]) AS dependency_ids, created_at`,
    [title, startDate, duration, parentId, dependencyIds]
  )
  return rowToTask(res.rows[0])
}

export async function updateTask(
  id: string,
  updates: { title?: string; startDate?: string; duration?: number; dependencyIds?: string[] }
) {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1
  if (updates.title !== undefined) {
    fields.push(`title = $${i++}`)
    values.push(updates.title)
  }
  if (updates.startDate !== undefined) {
    fields.push(`start_date = $${i++}`)
    values.push(updates.startDate)
  }
  if (updates.duration !== undefined) {
    fields.push(`duration = $${i++}`)
    values.push(updates.duration)
  }
  if (updates.dependencyIds !== undefined) {
    fields.push(`dependency_ids = $${i++}::uuid[]`)
    values.push(updates.dependencyIds)
  }
  if (fields.length === 0) return null
  values.push(id)
  const res = await pool.query<TaskRow>(
    `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, title, start_date, duration, parent_id, COALESCE(dependency_ids, ARRAY[]::uuid[]) AS dependency_ids, created_at`,
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

export async function getTaskById(id: string) {
  const res = await pool.query<TaskRow>(
    'SELECT id, title, start_date, duration, parent_id, COALESCE(dependency_ids, ARRAY[]::uuid[]) AS dependency_ids, created_at FROM tasks WHERE id = $1',
    [id]
  )
  return res.rows[0] ? rowToTask(res.rows[0]) : null
}
