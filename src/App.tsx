import { useState, useCallback, useEffect } from 'react'
import { Alert, Spin, Modal, Input, InputNumber, DatePicker, Select, Space, Segmented } from 'antd'
import dayjs from 'dayjs'
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
import type { Task, Project, ProjectStats, ViewMode, TimeUnit, DurationUnit } from './types'
import { durationToDays } from './utils/dateUtils'
import { Sidebar } from './Sidebar'
import { TaskList } from './TaskList'
import { TimelineView } from './TimelineView'
import { GanttView } from './GanttView'
import { DependencyView } from './DependencyView'
import { ProjectList } from './ProjectList'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import './App.css'

const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
]

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

  // New Task modal state
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskStart, setNewTaskStart] = useState('')
  const [newTaskDuration, setNewTaskDuration] = useState(1)
  const [newTaskDurationUnit, setNewTaskDurationUnit] = useState<DurationUnit>('day')
  const [newTaskParentId, setNewTaskParentId] = useState<string | null>(null)
  const [newTaskDetails, setNewTaskDetails] = useState('')
  const [newTaskTags, setNewTaskTags] = useState('')

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

  // ── Handlers ──────────────────────────────────────────────

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
      if (selectedTaskId === id) setSelectedTaskId(null)
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

  const handleNewTaskSubmit = () => {
    const t = newTaskTitle.trim()
    if (!t) return
    const dur = durationToDays(newTaskDuration, newTaskDurationUnit)
    const tags = newTaskTags.split(',').map((s) => s.trim()).filter(Boolean)
    handleCreateTask(t, newTaskStart || null, dur, newTaskParentId, newTaskDetails, tags)
    setShowNewTask(false)
    setNewTaskTitle('')
    setNewTaskStart('')
    setNewTaskDuration(1)
    setNewTaskDurationUnit('day')
    setNewTaskParentId(null)
    setNewTaskDetails('')
    setNewTaskTags('')
  }

  // ── Computed header info ──────────────────────────────────

  const taskCount = tasks.length
  const inProgressCount = tasks.filter((t) => {
    if (!t.startDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(t.startDate)
    const end = new Date(t.startDate)
    end.setDate(end.getDate() + t.duration)
    return start <= today && end > today
  }).length
  const latestDue = tasks.reduce<string | null>((max, t) => {
    if (!t.startDate) return max
    const d = new Date(t.startDate)
    d.setDate(d.getDate() + t.duration)
    const iso = d.toISOString().split('T')[0]
    return !max || iso > max ? iso : max
  }, null)

  const topLevel = tasks.filter((t) => !t.parentId)

  // ── Project List Page ─────────────────────────────────────
  if (!currentProject) {
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

  // ── Task Views Page ───────────────────────────────────────
  return (
    <div className="task-page">
      <Sidebar
        activeItem="tasks"
        onNavigateHome={() => {
          setCurrentProject(null)
          setSelectedTaskId(null)
        }}
      />

      <main className="task-main-content">
        {/* Header */}
        <header className="task-page-header">
          <div className="task-header-left">
            <h2 className="task-page-title">{currentProject.name}</h2>
            <span className="task-page-subtitle">
              {taskCount} task{taskCount !== 1 ? 's' : ''}
              {inProgressCount > 0 && ` · ${inProgressCount} in progress`}
              {latestDue && ` · Due ${new Date(latestDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </span>
          </div>
          <div className="task-header-right">
            <div className="view-switcher">
              {(['list', 'timeline', 'gantt', 'dependencies'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  className={`view-tab ${view === v ? 'active' : ''}`}
                  onClick={() => setView(v)}
                >
                  {v === 'dependencies' ? 'Deps' : v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <button className="new-task-btn" onClick={() => setShowNewTask(true)}>
              <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
              <span>New Task</span>
            </button>
          </div>
        </header>

        {error && (
          <Alert
            message={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ margin: '0 40px 16px 40px' }}
          />
        )}

        {/* Content */}
        <div className="task-content-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 64 }}>
              <Spin size="large" />
            </div>
          ) : view === 'list' ? (
            <TaskList
              tasks={tasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
              onAddChild={handleAddChild}
              onAddDependency={handleAddDependency}
              onCreateTaskAndAddDependency={handleCreateTaskAndAddDependency}
              onRemoveDependency={handleRemoveDependency}
            />
          ) : view === 'timeline' ? (
            <div style={{ padding: '0 40px' }}>
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
            </div>
          ) : view === 'dependencies' ? (
            <div style={{ padding: '0 40px' }}>
              <DependencyView tasks={tasks} onOpenTask={setSelectedTaskId} />
            </div>
          ) : (
            <div style={{ padding: '0 40px' }}>
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
            </div>
          )}
        </div>
      </main>

      {/* Task Detail Drawer */}
      {selectedTaskId && (
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
      )}

      {/* New Task Modal */}
      <Modal
        open={showNewTask}
        title="New Task"
        onCancel={() => setShowNewTask(false)}
        onOk={handleNewTaskSubmit}
        okText="Create"
        okButtonProps={{ disabled: !newTaskTitle.trim() }}
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Title</label>
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Task title"
              onPressEnter={handleNewTaskSubmit}
              autoFocus
            />
          </div>
          <Space wrap>
            <div>
              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Start Date</label>
              <DatePicker
                format="YYYY-MM-DD"
                value={newTaskStart ? dayjs(newTaskStart) : null}
                onChange={(d) => setNewTaskStart(d ? d.format('YYYY-MM-DD') : '')}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Duration</label>
              <Space.Compact>
                <InputNumber min={1} value={newTaskDuration} onChange={(v) => setNewTaskDuration(v ?? 1)} style={{ width: 72 }} />
                <Select
                  value={newTaskDurationUnit}
                  onChange={(v) => setNewTaskDurationUnit(v as DurationUnit)}
                  options={DURATION_UNITS}
                  style={{ width: 90 }}
                />
              </Space.Compact>
            </div>
          </Space>
          <div>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Parent Task</label>
            <Select
              value={newTaskParentId ?? undefined}
              onChange={(v) => setNewTaskParentId(v ?? null)}
              placeholder="None (top level)"
              allowClear
              style={{ width: '100%' }}
              options={topLevel.map((t) => ({ value: t.id, label: t.title }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Details</label>
            <Input.TextArea
              value={newTaskDetails}
              onChange={(e) => setNewTaskDetails(e.target.value)}
              placeholder="Notes…"
              rows={3}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Tags</label>
            <Input
              value={newTaskTags}
              onChange={(e) => setNewTaskTags(e.target.value)}
              placeholder="e.g. research, planning (comma-separated)"
            />
          </div>
        </Space>
      </Modal>
    </div>
  )
}
