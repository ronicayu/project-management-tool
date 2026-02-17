import { useState, useEffect, useRef, useCallback } from 'react'
import { Popconfirm, Modal, Input, InputNumber, DatePicker, Button, Space } from 'antd'
import dayjs from 'dayjs'
import type { Task } from './types'
import { format, parseISO } from 'date-fns'
import './TaskDetailDrawer.css'

function dependsOnTransitive(tasks: Task[], taskId: string, targetId: string): boolean {
  const t = tasks.find((x) => x.id === taskId)
  if (!t) return false
  if (t.dependencyIds.includes(targetId)) return true
  return t.dependencyIds.some((d) => dependsOnTransitive(tasks, d, targetId))
}

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
  onAddChild,
  onAddDependency,
  onCreateTaskAndAddDependency,
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

  const [showAddChildModal, setShowAddChildModal] = useState(false)
  const [addChildTitle, setAddChildTitle] = useState('')
  const [addChildStart, setAddChildStart] = useState<string | null>(null)
  const [addChildDuration, setAddChildDuration] = useState(1)

  const [showAddExistingChildModal, setShowAddExistingChildModal] = useState(false)
  const [childSearchQuery, setChildSearchQuery] = useState('')
  const childSearchRef = useRef<HTMLInputElement>(null)

  const [showAddDepModal, setShowAddDepModal] = useState(false)
  const [showCreateAndAddDepModal, setShowCreateAndAddDepModal] = useState(false)
  const [createDepTitle, setCreateDepTitle] = useState('')
  const [createDepStart, setCreateDepStart] = useState<string | null>(null)
  const [createDepDuration, setCreateDepDuration] = useState(1)
  const [createDepDetails, setCreateDepDetails] = useState('')

  const [labelInput, setLabelInput] = useState('')
  const [showLabelInput, setShowLabelInput] = useState(false)
  const labelInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (showAddExistingChildModal && childSearchRef.current) {
      childSearchRef.current.focus()
    }
    if (!showAddExistingChildModal) setChildSearchQuery('')
  }, [showAddExistingChildModal])

  useEffect(() => {
    if (showLabelInput && labelInputRef.current) {
      labelInputRef.current.focus()
    }
  }, [showLabelInput])

  const handleAddLabel = useCallback(() => {
    if (!task) return
    const label = labelInput.trim().toLowerCase()
    if (!label) return
    const currentTags = task.tags ?? []
    if (currentTags.includes(label)) {
      setLabelInput('')
      return
    }
    onUpdate(task.id, { tags: [...currentTags, label] })
    setLabelInput('')
  }, [task, labelInput, onUpdate])

  const handleRemoveLabel = useCallback(
    (label: string) => {
      if (!task) return
      const currentTags = task.tags ?? []
      onUpdate(task.id, { tags: currentTags.filter((t) => t !== label) })
    },
    [task, onUpdate]
  )

  if (!task) return null

  const status = getTaskStatus(task)
  const parent = task.parentId ? tasks.find((t) => t.id === task.parentId) : null
  const children = tasks.filter((t) => t.parentId === task.id)
  const depTasks = task.dependencyIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[]
  const tags = task.tags ?? []
  // Tasks eligible to become children of this task
  const isAncestor = (ancestorId: string, descendantId: string): boolean => {
    const t = tasks.find((x) => x.id === descendantId)
    if (!t || !t.parentId) return false
    if (t.parentId === ancestorId) return true
    return isAncestor(ancestorId, t.parentId)
  }
  const canAddAsChild = tasks.filter(
    (t) =>
      t.id !== task.id &&
      t.parentId !== task.id &&
      !isAncestor(t.id, task.id)
  )

  const canAddAsDependency = tasks.filter(
    (t) =>
      t.id !== task.id &&
      !task.dependencyIds.includes(t.id) &&
      !dependsOnTransitive(tasks, t.id, task.id)
  )

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

  const openAddChildModal = () => {
    setAddChildTitle('')
    setAddChildStart(null)
    setAddChildDuration(1)
    setShowAddChildModal(true)
  }

  const submitAddChild = () => {
    const title = addChildTitle.trim()
    if (!title) return
    onAddChild(task.id, title, addChildStart, addChildDuration)
    setShowAddChildModal(false)
  }

  const openCreateAndAddDepModal = () => {
    setShowAddDepModal(false)
    setCreateDepTitle('')
    setCreateDepStart(null)
    setCreateDepDuration(1)
    setCreateDepDetails('')
    setShowCreateAndAddDepModal(true)
  }

  const submitCreateAndAddDep = () => {
    const title = createDepTitle.trim()
    if (!title) return
    onCreateTaskAndAddDependency(
      task.id,
      title,
      createDepStart,
      createDepDuration,
      null,
      createDepDetails
    )
    setShowCreateAndAddDepModal(false)
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

        {/* Children */}
        <div className="td-section">
          <span className="td-label">Sub-tasks</span>
          {children.length > 0 ? (
            <>
              {children.map((child) => (
                <div
                  key={child.id}
                  className="td-item-row"
                  onClick={() => onOpenTask(child.id)}
                >
                  <div
                    className="td-item-dot"
                    style={{ background: STATUS_DOT_COLOR[getTaskStatus(child)] }}
                  />
                  <span className="td-item-name">{child.title}</span>
                  <span className="td-item-arrow">
                    <span className="material-symbols-rounded">chevron_right</span>
                  </span>
                </div>
              ))}
            </>
          ) : (
            <span className="td-notes-empty">No sub-tasks</span>
          )}
          <Space style={{ marginTop: 4 }} wrap>
            <button
              type="button"
              className="td-action-btn secondary"
              onClick={openAddChildModal}
            >
              <span className="material-symbols-rounded">add</span>
              New child task
            </button>
            <button
              type="button"
              className="td-action-btn secondary"
              onClick={() => setShowAddExistingChildModal(true)}
            >
              <span className="material-symbols-rounded">subdirectory_arrow_right</span>
              Add existing task
            </button>
          </Space>
        </div>

        {/* Labels */}
        <div className="td-section">
          <span className="td-label">Labels</span>
          <div className="td-tags-row">
            {tags.map((tag) => (
              <span key={tag} className="td-tag">
                {tag}
                <button
                  className="td-tag-remove"
                  onClick={() => handleRemoveLabel(tag)}
                  title={`Remove "${tag}"`}
                >
                  <span className="material-symbols-rounded">close</span>
                </button>
              </span>
            ))}
            {showLabelInput ? (
              <input
                ref={labelInputRef}
                className="td-label-input"
                placeholder="Label name…"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddLabel()
                  if (e.key === 'Escape') {
                    setShowLabelInput(false)
                    setLabelInput('')
                  }
                }}
                onBlur={() => {
                  if (labelInput.trim()) handleAddLabel()
                  setShowLabelInput(false)
                  setLabelInput('')
                }}
              />
            ) : (
              <button
                className="td-tag td-tag-add"
                onClick={() => setShowLabelInput(true)}
              >
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>add</span>
                Add
              </button>
            )}
          </div>
          {tags.length === 0 && !showLabelInput && (
            <span className="td-notes-empty">No labels yet</span>
          )}
        </div>

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
          <Space style={{ marginTop: 8 }} wrap>
            <button
              type="button"
              className="td-action-btn secondary"
              onClick={() => setShowAddDepModal(true)}
            >
              <span className="material-symbols-rounded">link</span>
              Add dependency
            </button>
            <button
              type="button"
              className="td-action-btn secondary"
              onClick={openCreateAndAddDepModal}
            >
              <span className="material-symbols-rounded">add_link</span>
              Create & add as dependency
            </button>
          </Space>
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

      {/* Add child modal */}
      <Modal
        title="Add child task"
        open={showAddChildModal}
        onCancel={() => setShowAddChildModal(false)}
        onOk={submitAddChild}
        okText="Create"
        okButtonProps={{ disabled: !addChildTitle.trim() }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <label className="td-label" style={{ display: 'block', marginBottom: 6 }}>Title</label>
            <Input
              value={addChildTitle}
              onChange={(e) => setAddChildTitle(e.target.value)}
              placeholder="Child task title"
              onPressEnter={submitAddChild}
            />
          </div>
          <div>
            <label className="td-label" style={{ display: 'block', marginBottom: 6 }}>Start date (optional)</label>
            <DatePicker
              value={addChildStart ? dayjs(addChildStart) : null}
              onChange={(date) => setAddChildStart(date ? date.format('YYYY-MM-DD') : null)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="td-label" style={{ display: 'block', marginBottom: 6 }}>Duration (days)</label>
            <InputNumber
              min={1}
              value={addChildDuration}
              onChange={(v) => setAddChildDuration(v ?? 1)}
              style={{ width: '100%' }}
            />
          </div>
        </Space>
      </Modal>

      {/* Add existing task as child modal */}
      <Modal
        title="Add existing task as sub-task"
        open={showAddExistingChildModal}
        onCancel={() => setShowAddExistingChildModal(false)}
        footer={null}
        destroyOnClose
      >
        <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
          Choose a task to make it a sub-task of <strong>{task.title}</strong>.
        </p>
        {canAddAsChild.length === 0 ? (
          <span className="td-notes-empty">No tasks available to add as sub-task.</span>
        ) : (
          <>
            <input
              ref={childSearchRef}
              className="td-edit-input"
              placeholder="Search tasks…"
              value={childSearchQuery}
              onChange={(e) => setChildSearchQuery(e.target.value)}
              style={{ marginBottom: 10, width: '100%' }}
            />
            {(() => {
              const q = childSearchQuery.toLowerCase().trim()
              const filtered = q
                ? canAddAsChild.filter((t) => t.title.toLowerCase().includes(q))
                : canAddAsChild
              if (filtered.length === 0) {
                return <span className="td-notes-empty">No matching tasks.</span>
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {filtered.map((t) => (
                    <div
                      key={t.id}
                      className="td-item-row"
                      onClick={() => {
                        onUpdate(t.id, { parentId: task.id })
                        setShowAddExistingChildModal(false)
                      }}
                    >
                      <div
                        className="td-item-dot"
                        style={{ background: STATUS_DOT_COLOR[getTaskStatus(t)] }}
                      />
                      <span className="td-item-name">
                        {t.title}
                        {t.parentId && (
                          <span style={{ color: '#666', fontSize: 11, marginLeft: 6 }}>
                            (child of {tasks.find((p) => p.id === t.parentId)?.title ?? '…'})
                          </span>
                        )}
                      </span>
                      <span className="td-item-arrow">
                        <span className="material-symbols-rounded">add</span>
                      </span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </>
        )}
      </Modal>

      {/* Add existing task as dependency modal */}
      <Modal
        title="Add dependency"
        open={showAddDepModal}
        onCancel={() => setShowAddDepModal(false)}
        footer={null}
        destroyOnClose
      >
        <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
          Choose a task that this task depends on (must complete before this one can start).
        </p>
        {canAddAsDependency.length === 0 ? (
          <span className="td-notes-empty">No other tasks can be added (already added or would create a cycle).</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {canAddAsDependency.map((t) => (
              <div
                key={t.id}
                className="td-item-row"
                onClick={() => {
                  onAddDependency(task.id, t.id)
                  setShowAddDepModal(false)
                }}
              >
                <div
                  className="td-item-dot"
                  style={{ background: STATUS_DOT_COLOR[getTaskStatus(t)] }}
                />
                <span className="td-item-name">{t.title}</span>
                <span className="td-item-arrow">
                  <span className="material-symbols-rounded">add</span>
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <Button type="link" onClick={openCreateAndAddDepModal} style={{ padding: 0 }}>
            Create new task and add as dependency
          </Button>
        </div>
      </Modal>

      {/* Create task and add as dependency modal */}
      <Modal
        title="Create task and add as dependency"
        open={showCreateAndAddDepModal}
        onCancel={() => setShowCreateAndAddDepModal(false)}
        onOk={submitCreateAndAddDep}
        okText="Create & add"
        okButtonProps={{ disabled: !createDepTitle.trim() }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <label className="td-label" style={{ display: 'block', marginBottom: 6 }}>Title</label>
            <Input
              value={createDepTitle}
              onChange={(e) => setCreateDepTitle(e.target.value)}
              placeholder="New task title"
              onPressEnter={submitCreateAndAddDep}
            />
          </div>
          <div>
            <label className="td-label" style={{ display: 'block', marginBottom: 6 }}>Start date (optional)</label>
            <DatePicker
              value={createDepStart ? dayjs(createDepStart) : null}
              onChange={(date) => setCreateDepStart(date ? date.format('YYYY-MM-DD') : null)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="td-label" style={{ display: 'block', marginBottom: 6 }}>Duration (days)</label>
            <InputNumber
              min={1}
              value={createDepDuration}
              onChange={(v) => setCreateDepDuration(v ?? 1)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="td-label" style={{ display: 'block', marginBottom: 6 }}>Details (optional)</label>
            <Input.TextArea
              value={createDepDetails}
              onChange={(e) => setCreateDepDetails(e.target.value)}
              placeholder="Notes"
              rows={2}
            />
          </div>
        </Space>
      </Modal>
    </div>
  )
}
