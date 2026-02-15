import { useState, useCallback, useEffect } from 'react'
import { Layout, Alert, Button, Space, Segmented, Spin } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  getProjects,
  getProjectStats,
  createProject,
  deleteProject,
  getTasksByProjectId,
  createTask,
  updateTask,
  deleteTask,
  addChildTask,
  addDependency,
  removeDependency,
} from './store'
import type { Task, Project, ProjectStats, ViewMode, TimeUnit } from './types'
import { TaskList } from './TaskList'
import { TimelineView } from './TimelineView'
import { GanttView } from './GanttView'
import { DependencyView } from './DependencyView'
import { CreateTaskForm } from './CreateTaskForm'
import { ProjectList } from './ProjectList'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import './App.css'

const { Header, Content } = Layout

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectStatsMap, setProjectStatsMap] = useState<Record<string, ProjectStats>>({})
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<ViewMode>('list')
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('week')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const refreshProjects = useCallback(async () => {
    try {
      const [data, stats] = await Promise.all([getProjects(), getProjectStats()])
      setProjects(data)
      const map: Record<string, ProjectStats> = {}
      for (const s of stats) map[s.projectId] = s
      setProjectStatsMap(map)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects')
    }
  }, [])

  const refreshTasks = useCallback(async () => {
    if (!currentProject) return
    try {
      const data = await getTasksByProjectId(currentProject.id)
      setTasks(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    }
  }, [currentProject])

  useEffect(() => {
    refreshProjects().finally(() => setLoading(false))
  }, [refreshProjects])

  useEffect(() => {
    if (!currentProject) {
      setTasks([])
      return
    }
    setLoading(true)
    refreshTasks().finally(() => setLoading(false))
  }, [currentProject, refreshTasks])

  const handleCreateProject = async (name: string) => {
    try {
      await createProject(name)
      await refreshProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project')
    }
  }

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProject(id)
      if (currentProject?.id === id) setCurrentProject(null)
      await refreshProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete project')
    }
  }

  const handleCreateTask = async (
    title: string,
    startDate: string | null,
    duration: number,
    parentId: string | null,
    details: string,
    tags: string[] = []
  ) => {
    if (!currentProject) return
    try {
      await createTask(currentProject.id, title, startDate, duration, parentId, [], details, tags)
      await refreshTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create task')
    }
  }

  const handleUpdateTask = async (
    id: string,
    updates: Partial<Pick<Task, 'title' | 'startDate' | 'duration' | 'parentId' | 'details' | 'tags'>>
  ) => {
    try {
      await updateTask(id, updates)
      await refreshTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update task')
    }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteTask(id)
      await refreshTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete task')
    }
  }

  const handleAddChild = async (
    parentId: string,
    title: string,
    startDate: string | null,
    duration: number
  ) => {
    if (!currentProject) return
    try {
      await addChildTask(currentProject.id, parentId, title, startDate, duration)
      await refreshTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add child task')
    }
  }

  const handleAddDependency = async (taskId: string, dependsOnTaskId: string) => {
    try {
      await addDependency(taskId, dependsOnTaskId)
      await refreshTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add dependency')
    }
  }

  const handleCreateTaskAndAddDependency = async (
    taskId: string,
    title: string,
    startDate: string | null,
    duration: number,
    parentId: string | null,
    details: string,
    tags: string[] = []
  ) => {
    if (!currentProject) return
    try {
      const newTask = await createTask(currentProject.id, title, startDate, duration, parentId, [], details, tags)
      await addDependency(taskId, newTask.id)
      await refreshTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create task or add dependency')
    }
  }

  const handleRemoveDependency = async (taskId: string, dependsOnTaskId: string) => {
    try {
      await removeDependency(taskId, dependsOnTaskId)
      await refreshTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove dependency')
    }
  }

  const showProjectList = currentProject === null

  // ── Project List Page (full-page layout, no header) ──
  if (showProjectList) {
    return (
      <>
        {error && (
          <Alert
            message={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, maxWidth: 400 }}
          />
        )}
        <ProjectList
          projects={projects}
          projectStats={projectStatsMap}
          loading={loading}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onEnterProject={(p) => setCurrentProject(p)}
        />
      </>
    )
  }

  // ── Task Views (existing layout with header) ──
  return (
    <Layout className="app">
      <Header className="app-header">
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => setCurrentProject(null)}
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              Projects
            </Button>
            <span className="app-title">TEU</span>
            <span className="app-subtitle">{currentProject.name}</span>
          </Space>
          <Segmented
            value={view}
            onChange={(v) => setView(v as ViewMode)}
            options={[
              { label: 'List', value: 'list' },
              { label: 'Timeline', value: 'timeline' },
              { label: 'Gantt', value: 'gantt' },
              { label: 'Dependencies', value: 'dependencies' },
            ]}
          />
        </Space>
      </Header>

      <Content className="app-main">
        {error && (
          <Alert
            message={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 16 }}
          />
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" tip="Loading tasks…" />
          </div>
        ) : view === 'list' ? (
          <section className="task-view">
            <CreateTaskForm onCreate={handleCreateTask} tasks={tasks} />
            <TaskList
              tasks={tasks}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onAddChild={handleAddChild}
              onAddDependency={handleAddDependency}
              onCreateTaskAndAddDependency={handleCreateTaskAndAddDependency}
              onRemoveDependency={handleRemoveDependency}
              onOpenTask={setSelectedTaskId}
            />
          </section>
        ) : view === 'timeline' ? (
          <>
            <div className="view-toolbar">
              <Space>
                <span className="view-toolbar-label">Time unit:</span>
                <Segmented
                  value={timeUnit}
                  onChange={(v) => setTimeUnit(v as TimeUnit)}
                  options={(['day', 'week', 'month', 'quarter'] as const).map((u) => ({
                    label: u.charAt(0).toUpperCase() + u.slice(1),
                    value: u,
                  }))}
                />
              </Space>
            </div>
            <TimelineView tasks={tasks} timeUnit={timeUnit} onUpdateTask={handleUpdateTask} />
          </>
        ) : view === 'dependencies' ? (
          <DependencyView tasks={tasks} onOpenTask={setSelectedTaskId} />
        ) : (
          <>
            <div className="view-toolbar">
              <Space>
                <span className="view-toolbar-label">Time unit:</span>
                <Segmented
                  value={timeUnit}
                  onChange={(v) => setTimeUnit(v as TimeUnit)}
                  options={(['day', 'week', 'month', 'quarter'] as const).map((u) => ({
                    label: u.charAt(0).toUpperCase() + u.slice(1),
                    value: u,
                  }))}
                />
              </Space>
            </div>
            <GanttView
              tasks={tasks}
              timeUnit={timeUnit}
              onUpdateTask={handleUpdateTask}
              onOpenTask={setSelectedTaskId}
              onSwitchToView={setView}
            />
          </>
        )}
      </Content>
      <TaskDetailDrawer
        taskId={selectedTaskId}
        tasks={tasks}
        onClose={() => setSelectedTaskId(null)}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
        onAddChild={handleAddChild}
        onAddDependency={handleAddDependency}
        onCreateTaskAndAddDependency={handleCreateTaskAndAddDependency}
        onRemoveDependency={handleRemoveDependency}
        onOpenTask={setSelectedTaskId}
      />
    </Layout>
  )
}
