import { useState, useCallback, useEffect } from 'react'
import { getTasks, createTask, updateTask, deleteTask, addChildTask, addDependency, removeDependency } from './store'
import type { Task, ViewMode } from './types'
import { TaskList } from './TaskList'
import { TimelineView } from './TimelineView'
import { GanttView } from './GanttView'
import { CreateTaskForm } from './CreateTaskForm'
import './App.css'

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<ViewMode>('list')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await getTasks()
      setTasks(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    }
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const handleCreateTask = async (title: string, startDate: string, duration: number, parentId: string | null) => {
    try {
      await createTask(title, startDate, duration, parentId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create task')
    }
  }

  const handleUpdateTask = async (
    id: string,
    updates: Partial<Pick<Task, 'title' | 'startDate' | 'duration'>>
  ) => {
    try {
      await updateTask(id, updates)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update task')
    }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteTask(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete task')
    }
  }

  const handleAddChild = async (parentId: string, title: string, startDate: string, duration: number) => {
    try {
      await addChildTask(parentId, title, startDate, duration)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add child task')
    }
  }

  const handleAddDependency = async (taskId: string, dependsOnTaskId: string) => {
    try {
      await addDependency(taskId, dependsOnTaskId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add dependency')
    }
  }

  const handleRemoveDependency = async (taskId: string, dependsOnTaskId: string) => {
    try {
      await removeDependency(taskId, dependsOnTaskId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove dependency')
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">TEU</h1>
        <p className="app-subtitle">Project management</p>
        <nav className="app-nav">
          <button
            className={view === 'list' ? 'active' : ''}
            onClick={() => setView('list')}
          >
            List
          </button>
          <button
            className={view === 'timeline' ? 'active' : ''}
            onClick={() => setView('timeline')}
          >
            Timeline
          </button>
          <button
            className={view === 'gantt' ? 'active' : ''}
            onClick={() => setView('gantt')}
          >
            Gantt
          </button>
        </nav>
      </header>

      <main className="app-main">
        {error && (
          <div className="app-error" role="alert">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">×</button>
          </div>
        )}
        {loading ? (
          <p className="app-loading">Loading tasks…</p>
        ) : view === 'list' ? (
          <>
            <CreateTaskForm onCreate={handleCreateTask} tasks={tasks} />
            <TaskList
              tasks={tasks}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onAddChild={handleAddChild}
              onAddDependency={handleAddDependency}
              onRemoveDependency={handleRemoveDependency}
            />
          </>
        ) : view === 'timeline' ? (
          <TimelineView tasks={tasks} />
        ) : (
          <GanttView tasks={tasks} onUpdateTask={handleUpdateTask} />
        )}
      </main>
    </div>
  )
}
