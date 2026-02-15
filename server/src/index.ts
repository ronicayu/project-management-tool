import './env.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import express from 'express'
import cors from 'cors'
import * as db from './db.js'

// #region agent log
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEBUG_LOG = path.join(path.resolve(__dirname, '..', '..'), '.cursor', 'debug.log')
function agentLog(payload: Record<string, unknown>) {
  const line = JSON.stringify({ ...payload, timestamp: Date.now() }) + '\n'
  try {
    fs.mkdirSync(path.dirname(DEBUG_LOG), { recursive: true })
    fs.appendFileSync(DEBUG_LOG, line)
  } catch (_) {}
  fetch('http://127.0.0.1:7243/ingest/f9550900-7055-4472-bd96-cec2f709fba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});
}
// #endregion

const app = express()
// #region agent log
app.use((req, _res, next) => {
  agentLog({location:'server/src/index.ts:middleware',message:'Express received',data:{url:req.url,method:req.method},hypothesisId:'H1,H2,H5'});
  next();
});
// #endregion
app.use(cors())
app.use(express.json())
// Prevent Vercel/CDN from caching API responses (avoids serving cached 404s)
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

const PORT = process.env.PORT ?? 3001

app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await db.getProjects()
    res.json(projects)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load projects' })
  }
})

app.get('/api/projects/stats', async (_req, res) => {
  try {
    const stats = await db.getProjectStats()
    res.json(stats)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load project stats' })
  }
})

app.post('/api/projects', async (req, res) => {
  try {
    const { name } = req.body
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'name is required' })
    }
    const project = await db.createProject(String(name).trim())
    res.status(201).json(project)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create project' })
  }
})

app.get('/api/projects/:id', async (req, res) => {
  // #region agent log
  agentLog({location:'server/src/index.ts:GET /api/projects/:id',message:'Route matched',data:{paramId:req.params.id},hypothesisId:'H1,H4'});
  // #endregion
  try {
    const project = await db.getProjectById(req.params.id)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    res.json(project)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load project' })
  }
})

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const deleted = await db.deleteProject(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Project not found' })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

app.get('/api/projects/:projectId/tasks', async (req, res) => {
  // #region agent log
  agentLog({location:'server/src/index.ts:GET /api/projects/:projectId/tasks',message:'Tasks route matched',data:{projectId:req.params.projectId},hypothesisId:'H2'});
  // #endregion
  try {
    const tasks = await db.getTasksByProjectId(req.params.projectId)
    res.json(tasks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load tasks' })
  }
})

app.post('/api/projects/:projectId/tasks', async (req, res) => {
  try {
    const { projectId } = req.params
    const { title, startDate, duration, parentId = null, dependencyIds = [], details = '', tags = [] } = req.body
    if (!title || duration == null) {
      return res.status(400).json({ error: 'title and duration are required' })
    }
    const task = await db.createTaskInProject(
      projectId,
      String(title),
      startDate != null && String(startDate).trim() !== '' ? String(startDate) : null,
      Number(duration),
      parentId ?? null,
      Array.isArray(dependencyIds) ? dependencyIds : [],
      String(details ?? ''),
      Array.isArray(tags) ? tags.map(String) : []
    )
    res.status(201).json(task)
  } catch (err) {
    console.error(err)
    const message = err instanceof Error ? err.message : 'Failed to create task'
    res.status(500).json({ error: 'Failed to create task', detail: message })
  }
})

app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    const task = await db.updateTask(id, {
      title: updates.title,
      startDate: updates.startDate,
      duration: updates.duration,
      parentId: updates.parentId,
      dependencyIds: updates.dependencyIds,
      details: updates.details,
      tags: updates.tags,
    })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const deleted = await db.deleteTask(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Task not found' })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

app.post('/api/tasks/:id/dependencies', async (req, res) => {
  try {
    const { id } = req.params
    const { dependsOnTaskId } = req.body
    if (!dependsOnTaskId) return res.status(400).json({ error: 'dependsOnTaskId is required' })
    const task = await db.getTaskById(id)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    if (task.dependencyIds.includes(dependsOnTaskId)) return res.json(task)
    const ok = await db.addDependency(id, dependsOnTaskId)
    if (!ok) return res.status(404).json({ error: 'Dependency task not found' })
    const updated = await db.getTaskById(id)
    if (!updated) return res.status(500).json({ error: 'Failed to load updated task' })
    res.json(updated)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to add dependency' })
  }
})

app.delete('/api/tasks/:id/dependencies/:depId', async (req, res) => {
  try {
    const { id, depId } = req.params
    const ok = await db.removeDependency(id, depId)
    if (!ok) return res.status(404).json({ error: 'Task not found' })
    const task = await db.getTaskById(id)
    if (!task) return res.status(500).json({ error: 'Failed to load updated task' })
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to remove dependency' })
  }
})

export default app

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`)
  })
}
