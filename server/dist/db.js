import pg from 'pg';
const { Pool } = pg;
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? 'postgresql://teu:teu@localhost:5435/teu';
const pool = new Pool({
    connectionString,
});
const TASK_SELECT = 'id, project_id, title, start_date, duration, parent_id, COALESCE(dependency_ids, ARRAY[]::uuid[]) AS dependency_ids, COALESCE(details, \'\') AS details, created_at';
function rowToTask(row) {
    return {
        id: row.id,
        title: row.title,
        startDate: row.start_date ?? null,
        duration: row.duration,
        parentId: row.parent_id,
        dependencyIds: row.dependency_ids ?? [],
        details: row.details ?? '',
        createdAt: new Date(row.created_at).toISOString(),
    };
}
function rowToProject(row) {
    return {
        id: row.id,
        name: row.name,
        createdAt: new Date(row.created_at).toISOString(),
    };
}
export async function getProjects() {
    const res = await pool.query('SELECT id, name, created_at FROM projects ORDER BY created_at');
    return res.rows.map(rowToProject);
}
export async function createProject(name) {
    const res = await pool.query('INSERT INTO projects (name) VALUES ($1) RETURNING id, name, created_at', [name]);
    return rowToProject(res.rows[0]);
}
export async function getProjectById(id) {
    const res = await pool.query('SELECT id, name, created_at FROM projects WHERE id = $1', [id]);
    return res.rows[0] ? rowToProject(res.rows[0]) : null;
}
export async function deleteProject(id) {
    const res = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id]);
    return (res.rowCount ?? 0) > 0;
}
export async function getTasksByProjectId(projectId) {
    const res = await pool.query(`SELECT ${TASK_SELECT} FROM tasks WHERE project_id = $1 ORDER BY created_at`, [projectId]);
    return res.rows.map(rowToTask);
}
export async function createTaskInProject(projectId, title, startDate, duration, parentId = null, dependencyIds = [], details = '') {
    const res = await pool.query(`INSERT INTO tasks (project_id, title, start_date, duration, parent_id, dependency_ids, details)
     VALUES ($1, $2, $3::date, $4, $5, $6::uuid[], $7)
     RETURNING ${TASK_SELECT}`, [projectId, title, startDate || null, duration, parentId, dependencyIds, details ?? '']);
    return rowToTask(res.rows[0]);
}
export async function updateTask(id, updates) {
    const fields = [];
    const values = [];
    let i = 1;
    if (updates.title !== undefined) {
        fields.push(`title = $${i++}`);
        values.push(updates.title);
    }
    if (updates.startDate !== undefined) {
        fields.push(`start_date = $${i++}::date`);
        values.push(updates.startDate === null || updates.startDate === '' ? null : updates.startDate);
    }
    if (updates.duration !== undefined) {
        fields.push(`duration = $${i++}`);
        values.push(updates.duration);
    }
    if (updates.parentId !== undefined) {
        fields.push(`parent_id = $${i++}::uuid`);
        values.push(updates.parentId === null || updates.parentId === '' ? null : updates.parentId);
    }
    if (updates.dependencyIds !== undefined) {
        fields.push(`dependency_ids = $${i++}::uuid[]`);
        values.push(updates.dependencyIds);
    }
    if (updates.details !== undefined) {
        fields.push(`details = $${i++}`);
        values.push(updates.details);
    }
    if (fields.length === 0)
        return null;
    values.push(id);
    const res = await pool.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${TASK_SELECT}`, values);
    return res.rows[0] ? rowToTask(res.rows[0]) : null;
}
export async function deleteTask(id) {
    const res = await pool.query('DELETE FROM tasks WHERE id = $1 OR parent_id = $1 RETURNING id', [id]);
    if (res.rowCount === 0)
        return false;
    await pool.query(`UPDATE tasks SET dependency_ids = array_remove(dependency_ids, $1::uuid) WHERE $1::uuid = ANY(dependency_ids)`, [id]);
    return true;
}
export async function addDependency(taskId, dependsOnTaskId) {
    if (taskId === dependsOnTaskId)
        return true;
    const res = await pool.query(`UPDATE tasks SET dependency_ids = array_append(COALESCE(dependency_ids, ARRAY[]::uuid[]), $2::uuid)
     WHERE id = $1::uuid AND NOT ($2::uuid = ANY(COALESCE(dependency_ids, ARRAY[]::uuid[])))
     RETURNING id`, [taskId, dependsOnTaskId]);
    return (res.rowCount ?? 0) > 0;
}
export async function removeDependency(taskId, dependsOnTaskId) {
    const res = await pool.query(`UPDATE tasks SET dependency_ids = array_remove(COALESCE(dependency_ids, ARRAY[]::uuid[]), $2::uuid)
     WHERE id = $1::uuid RETURNING id`, [taskId, dependsOnTaskId]);
    return (res.rowCount ?? 0) > 0;
}
export async function getTaskById(id) {
    const res = await pool.query(`SELECT ${TASK_SELECT} FROM tasks WHERE id = $1`, [id]);
    return res.rows[0] ? rowToTask(res.rows[0]) : null;
}
