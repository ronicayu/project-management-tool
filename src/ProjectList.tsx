import { useState } from 'react'
import { Modal, Input, Spin, Popconfirm } from 'antd'
import { format } from 'date-fns'
import type { Project, ProjectStats } from './types'
import { Sidebar } from './Sidebar'
import './ProjectList.css'

interface ProjectListProps {
  projects: Project[]
  projectStats: Record<string, ProjectStats>
  loading: boolean
  onCreateProject: (name: string) => void | Promise<void>
  onDeleteProject: (id: string) => void | Promise<void>
  onEnterProject: (project: Project) => void
}

function getProjectStatus(stats: ProjectStats | undefined) {
  if (!stats || stats.totalTasks === 0) return 'new'
  if (stats.done === stats.totalTasks) return 'completed'
  if (stats.inProgress > 0 || stats.done > 0) return 'active'
  return 'planning'
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  active: 'Active',
  planning: 'Planning',
  completed: 'Completed',
}

function formatCreatedDate(iso: string) {
  try {
    return 'Created ' + format(new Date(iso), 'MMM d, yyyy')
  } catch {
    return ''
  }
}

function formatDueDate(dateStr: string | null) {
  if (!dateStr) return null
  try {
    return format(new Date(dateStr), 'MMM d')
  } catch {
    return null
  }
}

function ProjectCard({
  project,
  stats,
  onEnter,
  onDelete,
}: {
  project: Project
  stats: ProjectStats | undefined
  onEnter: () => void
  onDelete: () => void
}) {
  const status = getProjectStatus(stats)
  const total = stats?.totalTasks ?? 0
  const inProgress = stats?.inProgress ?? 0
  const done = stats?.done ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const isComplete = pct === 100 && total > 0
  const dueFormatted = formatDueDate(stats?.latestDue ?? null)

  let progressText = `${pct}% complete`
  if (isComplete && dueFormatted) {
    progressText = `100% complete \u00b7 Completed ${dueFormatted}`
  } else if (dueFormatted) {
    progressText = `${pct}% complete \u00b7 Due ${dueFormatted}`
  }

  return (
    <div className="project-card" onClick={onEnter}>
      <Popconfirm
        title="Delete this project?"
        description="All tasks will be deleted. This cannot be undone."
        onConfirm={(e) => {
          e?.stopPropagation()
          onDelete()
        }}
        onCancel={(e) => e?.stopPropagation()}
        okText="Delete"
        okButtonProps={{ danger: true }}
      >
        <button
          className="card-delete-btn"
          onClick={(e) => e.stopPropagation()}
          title="Delete project"
        >
          <span className="material-symbols-rounded">delete</span>
        </button>
      </Popconfirm>

      {/* Header */}
      <div className="card-header">
        <div className="card-title-group">
          <h3 className="card-title">{project.name}</h3>
          <span className="card-date">{formatCreatedDate(project.createdAt)}</span>
        </div>
        <span className={`card-badge ${status}`}>{STATUS_LABELS[status]}</span>
      </div>

      {/* Stats */}
      <div className="card-stats">
        <div className="card-stat">
          <span className="card-stat-value">{total}</span>
          <span className="card-stat-label">Tasks</span>
        </div>
        <div className="card-stat">
          <span className={`card-stat-value ${inProgress > 0 ? 'blue' : 'muted'}`}>
            {inProgress}
          </span>
          <span className="card-stat-label">In Progress</span>
        </div>
        <div className="card-stat">
          <span className={`card-stat-value ${done > 0 ? 'green' : 'muted'}`}>
            {done}
          </span>
          <span className="card-stat-label">Done</span>
        </div>
      </div>

      {/* Progress */}
      <div className="card-progress">
        <div className="card-progress-bar">
          <div
            className={`card-progress-fill${isComplete ? ' complete' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="card-progress-text">{progressText}</span>
      </div>
    </div>
  )
}

export function ProjectList({
  projects,
  projectStats,
  loading,
  onCreateProject,
  onDeleteProject,
  onEnterProject,
}: ProjectListProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      await onCreateProject(trimmed)
      setName('')
      setModalOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="project-page">
      <Sidebar activeItem="projects" />

      {/* Main Content */}
      <main className="project-main">
        {/* Page Header */}
        <header className="project-header">
          <h1>Projects</h1>
          <button className="new-project-btn" onClick={() => setModalOpen(true)}>
            <span className="material-symbols-rounded">add</span>
            New Project
          </button>
        </header>

        {/* Project Grid */}
        {loading ? (
          <div className="project-loading">
            <Spin size="large" />
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                stats={projectStats[project.id]}
                onEnter={() => onEnterProject(project)}
                onDelete={() => onDeleteProject(project.id)}
              />
            ))}
            <button className="add-project-card" onClick={() => setModalOpen(true)}>
              <div className="add-card-icon">
                <span className="material-symbols-rounded">add</span>
              </div>
              <span className="add-card-text">Create New Project</span>
            </button>
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      <Modal
        title="Create New Project"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false)
          setName('')
        }}
        okText="Create"
        confirmLoading={creating}
        className="create-project-modal"
        destroyOnHidden
      >
        <Input
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={handleCreate}
          autoFocus
          size="large"
          style={{ marginTop: 16 }}
        />
      </Modal>
    </div>
  )
}
