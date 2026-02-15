import './env.js'
import express from 'express'
import cors from 'cors'
import * as db from './db.js'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT ?? 3001

app.get('/api/tasks', async (_req, res) => {
  try {
    const tasks = await db.getTasks()
    res.json(tasks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load tasks' })
  }
})

app.post('/api/tasks', async (req, res) => {
  try {
    const { title, startDate, duration, parentId = null, dependencyIds = [] } = req.body
    if (!title || !startDate || duration == null) {
      return res.status(400).json({ error: 'title, startDate, and duration are required' })
    }
    const task = await db.createTask(
      String(title),
      String(startDate),
      Number(duration),
      parentId ?? null,
      Array.isArray(dependencyIds) ? dependencyIds : []
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
      dependencyIds: updates.dependencyIds,
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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})
