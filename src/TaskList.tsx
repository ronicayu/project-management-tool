import { useState, useMemo, useCallback } from 'react'
import { Modal, Space, Button } from 'antd'
import type { Task } from './types'
import { format, parseISO } from 'date-fns'
import './TaskList.css'

// ── Utilities ───────────────────────────────────────────────

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

function getParentStatus(
  task: Task,
  tasks: Task[]
): 'done' | 'in_progress' | 'active' | 'not_started' {
  const children = tasks.filter((t) => t.parentId === task.id)
  if (children.length === 0) {
    const s = getTaskStatus(task)
    return s === 'in_progress' ? 'active' : s
  }
  const statuses = children.map((c) => getTaskStatus(c))
  if (statuses.every((s) => s === 'done')) return 'done'
  if (statuses.some((s) => s === 'in_progress' || s === 'done')) return 'active'
  return 'not_started'
}

function getDependencyOrder(tasks: Task[]): string[] {
  const remaining = new Set(tasks.map((t) => t.id))
  const order: string[] = []
  while (remaining.size > 0) {
    const ready = tasks.filter(
      (t) => remaining.has(t.id) && t.dependencyIds.every((d) => !remaining.has(d))
    )
    if (ready.length === 0) {
      remaining.forEach((id) => order.push(id))
      break
    }
    ready.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    ready.forEach((t) => {
      order.push(t.id)
      remaining.delete(t.id)
    })
  }
  return order
}

function getChildren(tasks: Task[], parentId: string | null, depOrder: string[]): Task[] {
  const children = tasks.filter((t) => t.parentId === parentId)
  const indexOf = (id: string) => {
    const i = depOrder.indexOf(id)
    return i === -1 ? depOrder.length : i
  }
  return children.sort((a, b) => indexOf(a.id) - indexOf(b.id))
}

function isDescendant(tasks: Task[], ancestorId: string, nodeId: string): boolean {
  const children = tasks.filter((t) => t.parentId === ancestorId)
  for (const c of children) {
    if (c.id === nodeId) return true
    if (isDescendant(tasks, c.id, nodeId)) return true
  }
  return false
}

function dependsOnTransitive(tasks: Task[], taskId: string, targetId: string): boolean {
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return false
  if (task.dependencyIds.includes(targetId)) return true
  return task.dependencyIds.some((d) => dependsOnTransitive(tasks, d, targetId))
}

// ── Status labels/classes ────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  in_progress: 'In Progress',
  active: 'Active',
  not_started: 'Planned',
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  done: 'tl-badge-done',
  in_progress: 'tl-badge-in-progress',
  active: 'tl-badge-active',
  not_started: 'tl-badge-not-started',
}

const STATUS_DOT_CLASS: Record<string, string> = {
  done: 'tl-dot-done',
  in_progress: 'tl-dot-in-progress',
  active: 'tl-dot-active',
  not_started: 'tl-dot-not-started',
}

// ── Types ────────────────────────────────────────────────────

interface TaskListProps {
  tasks: Task[]
  selectedTaskId: string | null
  onSelectTask: (taskId: string) => void
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
}

interface FlatRow {
  task: Task
  isParent: boolean
  depth: number
  status: string
}

type PendingDrop = {
  dragKey: string
  dropKey: string
  dragTitle: string
  dropTitle: string
}

// ── Component ────────────────────────────────────────────────

export function TaskList({
  tasks,
  selectedTaskId,
  onSelectTask,
  onUpdate,
  onAddDependency,
}: TaskListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)

  const depOrder = useMemo(() => getDependencyOrder(tasks), [tasks])

  const getChildrenOrdered = useCallback(
    (parentId: string | null) => getChildren(tasks, parentId, depOrder),
    [tasks, depOrder]
  )

  // Build flat row list with expand/collapse
  const flatRows = useMemo(() => {
    const rows: FlatRow[] = []
    function walk(parentId: string | null, depth: number) {
      const children = getChildrenOrdered(parentId)
      for (const task of children) {
        const hasChildren = tasks.some((t) => t.parentId === task.id)
        const isParent = hasChildren || depth === 0
        const status = isParent
          ? getParentStatus(task, tasks)
          : getTaskStatus(task)
        rows.push({ task, isParent: isParent && hasChildren, depth, status })
        if (hasChildren && !collapsed.has(task.id)) {
          walk(task.id, depth + 1)
        }
      }
    }
    walk(null, 0)
    return rows
  }, [tasks, depOrder, collapsed, getChildrenOrdered])

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatStart = (d: string | null) => {
    if (!d) return '—'
    try {
      return format(parseISO(d), 'MMM d')
    } catch {
      return '—'
    }
  }

  const formatDuration = (d: number) => `${d} day${d !== 1 ? 's' : ''}`

  const getDeps = (task: Task) => {
    return task.dependencyIds
      .map((id) => tasks.find((t) => t.id === id))
      .filter(Boolean) as Task[]
  }

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = (e: React.DragEvent, dropTaskId: string) => {
    e.preventDefault()
    const dragId = e.dataTransfer.getData('text/plain')
    if (!dragId || dragId === dropTaskId) return
    const dragTask = tasks.find((t) => t.id === dragId)
    const dropTask = tasks.find((t) => t.id === dropTaskId)
    if (!dragTask || !dropTask) return
    setPendingDrop({
      dragKey: dragId,
      dropKey: dropTaskId,
      dragTitle: dragTask.title,
      dropTitle: dropTask.title,
    })
  }

  const applyDropAsChild = () => {
    if (!pendingDrop) return
    if (isDescendant(tasks, pendingDrop.dragKey, pendingDrop.dropKey)) {
      setPendingDrop(null)
      return
    }
    onUpdate(pendingDrop.dragKey, { parentId: pendingDrop.dropKey })
    setPendingDrop(null)
  }

  const applyDropAsDependency = () => {
    if (!pendingDrop) return
    if (dependsOnTransitive(tasks, pendingDrop.dropKey, pendingDrop.dragKey)) {
      setPendingDrop(null)
      return
    }
    onAddDependency(pendingDrop.dragKey, pendingDrop.dropKey)
    setPendingDrop(null)
  }

  const canDropAsDep = pendingDrop
    ? !dependsOnTransitive(tasks, pendingDrop.dropKey, pendingDrop.dragKey) &&
      !tasks.find((t) => t.id === pendingDrop.dragKey)?.dependencyIds.includes(pendingDrop.dropKey)
    : false

  if (tasks.length === 0) {
    return (
      <div className="tl-panel">
        <div className="tl-empty">
          <span className="material-symbols-rounded" style={{ fontSize: 40, color: '#3a3a4a' }}>
            task_alt
          </span>
          <span className="tl-empty-text">No tasks yet. Click "New Task" to add one.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="tl-panel">
      {/* Column header */}
      <div className="tl-header-row">
        <div className="tl-col tl-col-task">
          <span className="tl-col-label">Task Name</span>
        </div>
        <div className="tl-col tl-col-status">
          <span className="tl-col-label">Status</span>
        </div>
        <div className="tl-col tl-col-start">
          <span className="tl-col-label">Start Date</span>
        </div>
        <div className="tl-col tl-col-dur">
          <span className="tl-col-label">Duration</span>
        </div>
        <div className="tl-col tl-col-deps">
          <span className="tl-col-label">Dependencies</span>
        </div>
      </div>

      {/* Task rows */}
      <div className="tl-body">
        {flatRows.map(({ task, isParent, depth, status }) => {
          const isChild = depth > 0
          const isSelected = task.id === selectedTaskId
          const hasChildren = tasks.some((t) => t.parentId === task.id)
          const deps = getDeps(task)
          const firstTag = (task.tags ?? [])[0]

          return (
            <div
              key={task.id}
              role="button"
              tabIndex={0}
              className={`tl-row ${isParent && !isChild ? 'parent' : 'child'} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectTask(task.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectTask(task.id) } }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(e) => handleDrop(e, task.id)}
            >
              {/* Task Name Column */}
              <div className={`tl-task-col ${isChild ? 'indented' : ''}`}>
                <span
                  className="tl-drag-handle"
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation()
                    handleDragStart(e, task.id)
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="material-symbols-rounded">drag_indicator</span>
                </span>

                {hasChildren && (
                  <button
                    className={`tl-expand-btn ${collapsed.has(task.id) ? 'collapsed' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCollapse(task.id)
                    }}
                  >
                    <span className="material-symbols-rounded">expand_more</span>
                  </button>
                )}

                <div
                  className={`tl-status-dot ${hasChildren ? 'parent-dot' : 'child-dot'} ${STATUS_DOT_CLASS[status]}`}
                />

                <span
                  className={`tl-task-name ${
                    hasChildren ? 'parent-name' : isSelected ? 'selected-name' : 'child-name'
                  }`}
                >
                  {task.title}
                </span>

                {firstTag && hasChildren && (
                  <span className="tl-row-tag tag-accent">{firstTag}</span>
                )}
                {firstTag && !hasChildren && status === 'in_progress' && (
                  <span className="tl-row-tag tag-warning">{firstTag}</span>
                )}
              </div>

              {/* Status Badge Column */}
              <div className="tl-status-col">
                <span className={`tl-status-badge ${STATUS_BADGE_CLASS[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
              </div>

              {/* Start Date Column */}
              <div className="tl-start-col">
                <span className="tl-cell-text">{formatStart(task.startDate)}</span>
              </div>

              {/* Duration Column */}
              <div className="tl-dur-col">
                <span className="tl-cell-text">{formatDuration(task.duration)}</span>
              </div>

              {/* Dependencies Column */}
              <div className="tl-deps-col">
                {deps.length > 0 ? (
                  <span className="tl-dep-link">
                    {deps.map((d) => d.title).join(', ')}
                  </span>
                ) : (
                  <span className="tl-dep-none">—</span>
                )}
              </div>
            </div>
          )
        })}

        {/* Drag hint */}
        <div className="tl-dnd-hint">
          <span className="material-symbols-rounded">drag_indicator</span>
          <span className="tl-dnd-hint-text">
            Drag tasks to reparent (nest under another task) or hold Shift+drag to create dependencies
          </span>
        </div>
      </div>

      {/* Drop action modal */}
      <Modal
        open={!!pendingDrop}
        title={pendingDrop ? `"${pendingDrop.dragTitle}" → "${pendingDrop.dropTitle}"` : ''}
        onCancel={() => setPendingDrop(null)}
        footer={null}
        destroyOnHidden
      >
        {pendingDrop && (
          <Space wrap>
            <Button type="primary" onClick={applyDropAsChild}>
              Add as child
            </Button>
            <Button
              onClick={applyDropAsDependency}
              disabled={!canDropAsDep}
              title={canDropAsDep ? undefined : 'Would create a cycle or already exists'}
            >
              Add as dependency
            </Button>
            <Button onClick={() => setPendingDrop(null)}>Cancel</Button>
          </Space>
        )}
      </Modal>
    </div>
  )
}
