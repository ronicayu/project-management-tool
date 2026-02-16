import { useState, useEffect, useRef } from 'react'
import { Popconfirm } from 'antd'
import type { Task } from './types'
import { format, parseISO } from 'date-fns'
import './TaskDetailDrawer.css'

function getTaskStatus(task: Task): 'done' | 'in_progress' | 'not_started' {
  if (!task.startDate) return 'not_started'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(task.startDate)
  const end = new Date(task.startDate)
  end.setDate(end.getDate() + task.duration)
  if (end <= today) return 'done'
  if (start <= today) return 'in_progress'
  return 'not_started'
}

const STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  in_progress: 'In Progress',
  not_started: 'Planned',
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  done: 'td-badge-done',
  in_progress: 'td-badge-in-progress',
  not_started: 'td-badge-not-started',
}

const STATUS_DOT_COLOR: Record<string, string> = {
  done: '#22c55e',
  in_progress: '#3b82f6',
  not_started: '#666680',
}

interface TaskDetailDrawerProps {
  taskId: string | null
  tasks: Task[]
  onClose: () => void
  onUpdate: (
    id: string,
    updates: Partial<Pick<Task, 'title' | 'startDate' | 'duration' | 'parentId' | 'details' | 'tags'>>
  ) => void
  onDelete: (id: string) => void
  onAddChild: (parentId: string, title: string, startDate: string | null, duration: number) => void
  onAddDependency: (taskId: string, dependsOnTaskId: string) => void
  onCreateTaskAndAddDependency: (
    taskId: string,
    title: string,
    startDate: string | null,
    duration: number,
    parentId: string | null,
    details: string,
    tags?: string[]
  ) => void
  onRemoveDependency: (taskId: string, dependsOnTaskId: string) => void
  onOpenTask: (id: string) => void
}

export function TaskDetailDrawer({
  taskId,
  tasks,
  onClose,
  onUpdate,
  onDelete,
  onRemoveDependency,
  onOpenTask,
}: TaskDetailDrawerProps) {
  const task = tasks.find((t) => t.id === taskId) ?? null
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const notesInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (task) {
      setEditingTitle(false)
      setEditingNotes(false)
      setTitleDraft(task.title)
      setNotesDraft(task.details ?? '')
    }
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingTitle])

  useEffect(() => {
    if (editingNotes && notesInputRef.current) {
      notesInputRef.current.focus()
    }
  }, [editingNotes])

  if (!task) return null

  const status = getTaskStatus(task)
  const parent = task.parentId ? tasks.find((t) => t.id === task.parentId) : null
  const depTasks = task.dependencyIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[]
  const tags = task.tags ?? []

  const handleSaveTitle = () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdate(task.id, { title: trimmed })
    }
    setEditingTitle(false)
  }

  const handleSaveNotes = () => {
    const trimmed = notesDraft.trim()
    if (trimmed !== (task.details ?? '')) {
      onUpdate(task.id, { details: trimmed })
    }
    setEditingNotes(false)
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    try {
      return format(parseISO(d), 'MMM d, yyyy')
    } catch {
      return '—'
    }
  }

  return (
    <div className="td-panel">
      {/* Header */}
      <div className="td-header">
        <span className="td-title">Task Details</span>
        <button className="td-close-btn" onClick={onClose}>
          <span className="material-symbols-rounded">close</span>
        </button>
      </div>

      <div style={{ height: 16, flexShrink: 0 }} />
      <div className="td-divider" />
      <div style={{ height: 20, flexShrink: 0 }} />

      {/* Body */}
      <div className="td-body">
        {/* Title */}
        <div className="td-section">
          <span className="td-label">Title</span>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="td-edit-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
            />
          ) : (
            <span
              className="td-value"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                setTitleDraft(task.title)
                setEditingTitle(true)
              }}
            >
              {task.title}
            </span>
          )}
        </div>

        {/* Start Date & Duration */}
        <div className="td-details-row">
          <div className="td-detail-col">
            <span className="td-label">Start Date</span>
            <span className="td-detail-val">{formatDate(task.startDate)}</span>
          </div>
          <div className="td-detail-col">
            <span className="td-label">Duration</span>
            <span className="td-detail-val">{task.duration} day{task.duration !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Status */}
        <div className="td-section">
          <span className="td-label">Status</span>
          <span className={`td-status-badge ${STATUS_BADGE_CLASS[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="td-section">
            <span className="td-label">Tags</span>
            <div className="td-tags-row">
              {tags.map((tag) => (
                <span key={tag} className="td-tag">{tag}</span>
              ))}
            </div>
          </div>
        )}

        <div className="td-divider" style={{ margin: 0 }} />

        {/* Dependencies */}
        <div className="td-section">
          <span className="td-label">Dependencies</span>
          {depTasks.length > 0 ? (
            depTasks.map((dep) => {
              const depStatus = getTaskStatus(dep)
              return (
                <div
                  key={dep.id}
                  className="td-item-row"
                  onClick={() => onOpenTask(dep.id)}
                >
                  <div
                    className="td-item-dot"
                    style={{ background: STATUS_DOT_COLOR[depStatus] }}
                  />
                  <span className="td-item-name">{dep.title}</span>
                  <Popconfirm
                    title="Remove dependency?"
                    onConfirm={(e) => {
                      e?.stopPropagation()
                      onRemoveDependency(task.id, dep.id)
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <button
                      className="td-item-arrow"
                      onClick={(e) => e.stopPropagation()}
                      title="Remove dependency"
                    >
                      <span className="material-symbols-rounded">close</span>
                    </button>
                  </Popconfirm>
                  <span className="td-item-arrow">
                    <span className="material-symbols-rounded">chevron_right</span>
                  </span>
                </div>
              )
            })
          ) : (
            <span className="td-notes-empty">No dependencies</span>
          )}
        </div>

        <div className="td-divider" style={{ margin: 0 }} />

        {/* Notes */}
        <div className="td-section">
          <span className="td-label">Notes</span>
          {editingNotes ? (
            <textarea
              ref={notesInputRef}
              className="td-edit-textarea"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={handleSaveNotes}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingNotes(false)
              }}
            />
          ) : task.details ? (
            <span
              className="td-notes-text"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                setNotesDraft(task.details ?? '')
                setEditingNotes(true)
              }}
            >
              {task.details}
            </span>
          ) : (
            <span
              className="td-notes-empty"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                setNotesDraft('')
                setEditingNotes(true)
              }}
            >
              Click to add notes…
            </span>
          )}
        </div>

        {/* Parent Task */}
        {parent && (
          <>
            <div className="td-divider" style={{ margin: 0 }} />
            <div className="td-section">
              <span className="td-label">Parent Task</span>
              <div
                className="td-item-row"
                onClick={() => onOpenTask(parent.id)}
              >
                <div
                  className="td-item-dot"
                  style={{ background: STATUS_DOT_COLOR[getTaskStatus(parent)] }}
                />
                <span className="td-item-name">{parent.title}</span>
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="td-divider" style={{ margin: 0 }} />
        <div className="td-actions">
          <Popconfirm
            title="Delete this task?"
            description="Sub-tasks will be deleted too."
            onConfirm={() => {
              onDelete(task.id)
              onClose()
            }}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <button className="td-action-btn danger">
              <span className="material-symbols-rounded">delete</span>
              Delete
            </button>
          </Popconfirm>
        </div>
      </div>
    </div>
  )
}
