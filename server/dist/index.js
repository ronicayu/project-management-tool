import './env.js';
import express from 'express';
import cors from 'cors';
import * as db from './db.js';
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT ?? 3001;
app.get('/api/projects', async (_req, res) => {
    try {
        const projects = await db.getProjects();
        res.json(projects);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});
app.post('/api/projects', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || String(name).trim() === '') {
            return res.status(400).json({ error: 'name is required' });
        }
        const project = await db.createProject(String(name).trim());
        res.status(201).json(project);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create project' });
    }
});
app.get('/api/projects/:id', async (req, res) => {
    try {
        const project = await db.getProjectById(req.params.id);
        if (!project)
            return res.status(404).json({ error: 'Project not found' });
        res.json(project);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load project' });
    }
});
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const deleted = await db.deleteProject(req.params.id);
        if (!deleted)
            return res.status(404).json({ error: 'Project not found' });
        res.status(204).send();
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});
app.get('/api/projects/:projectId/tasks', async (req, res) => {
    try {
        const tasks = await db.getTasksByProjectId(req.params.projectId);
        res.json(tasks);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load tasks' });
    }
});
app.post('/api/projects/:projectId/tasks', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { title, startDate, duration, parentId = null, dependencyIds = [], details = '' } = req.body;
        if (!title || duration == null) {
            return res.status(400).json({ error: 'title and duration are required' });
        }
        const task = await db.createTaskInProject(projectId, String(title), startDate != null && String(startDate).trim() !== '' ? String(startDate) : null, Number(duration), parentId ?? null, Array.isArray(dependencyIds) ? dependencyIds : [], String(details ?? ''));
        res.status(201).json(task);
    }
    catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'Failed to create task';
        res.status(500).json({ error: 'Failed to create task', detail: message });
    }
});
app.patch('/api/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const task = await db.updateTask(id, {
            title: updates.title,
            startDate: updates.startDate,
            duration: updates.duration,
            parentId: updates.parentId,
            dependencyIds: updates.dependencyIds,
            details: updates.details,
        });
        if (!task)
            return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update task' });
    }
});
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const deleted = await db.deleteTask(req.params.id);
        if (!deleted)
            return res.status(404).json({ error: 'Task not found' });
        res.status(204).send();
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});
app.post('/api/tasks/:id/dependencies', async (req, res) => {
    try {
        const { id } = req.params;
        const { dependsOnTaskId } = req.body;
        if (!dependsOnTaskId)
            return res.status(400).json({ error: 'dependsOnTaskId is required' });
        const task = await db.getTaskById(id);
        if (!task)
            return res.status(404).json({ error: 'Task not found' });
        if (task.dependencyIds.includes(dependsOnTaskId))
            return res.json(task);
        const ok = await db.addDependency(id, dependsOnTaskId);
        if (!ok)
            return res.status(404).json({ error: 'Dependency task not found' });
        const updated = await db.getTaskById(id);
        if (!updated)
            return res.status(500).json({ error: 'Failed to load updated task' });
        res.json(updated);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add dependency' });
    }
});
app.delete('/api/tasks/:id/dependencies/:depId', async (req, res) => {
    try {
        const { id, depId } = req.params;
        const ok = await db.removeDependency(id, depId);
        if (!ok)
            return res.status(404).json({ error: 'Task not found' });
        const task = await db.getTaskById(id);
        if (!task)
            return res.status(500).json({ error: 'Failed to load updated task' });
        res.json(task);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove dependency' });
    }
});
export default app;
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server listening on http://localhost:${PORT}`);
    });
}
