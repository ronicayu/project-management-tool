import { useState, useMemo, useCallback } from 'react'
import {
  Button,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
  Popconfirm,
  Tree,
} from 'antd'
import type { DataNode } from 'antd/es/tree'
import { EditOutlined, PlusOutlined, LinkOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Task, DurationUnit } from './types'
import { format, parseISO } from 'date-fns'
import { durationToDays } from './utils/dateUtils'
import './TaskList.css'

const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
]

interface TaskListProps {
  tasks: Task[]
  onUpdate: (
    id: string,
    updates: Partial<Pick<Task, 'title' | 'startDate' | 'duration' | 'parentId' | 'details'>>
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
    details: string
  ) => void
  onRemoveDependency: (taskId: string, dependsOnTaskId: string) => void
  onOpenTask?: (taskId: string) => void
}

/** Topological order: prerequisites before dependents (if B depends on A, A comes before B). */
function getDependencyOrder(tasks: Task[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const remaining = new Set(tasks.map((t) => t.id))
  const order: string[] = []
  while (remaining.size > 0) {
    const ready = tasks.filter(
      (t) =>
        remaining.has(t.id) &&
        t.dependencyIds.every((depId) => !remaining.has(depId))
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

function getChildren(tasks: Task[], parentId: string | null, depOrder?: string[]): Task[] {
  const children = tasks.filter((t) => t.parentId === parentId)
  const order = depOrder ?? getDependencyOrder(tasks)
  const indexOf = (id: string) => {
    const i = order.indexOf(id)
    return i === -1 ? order.length : i
  }
  return children.sort((a, b) => indexOf(a.id) - indexOf(b.id))
}

function isDescendant(
  tasks: Task[],
  getChildren: (tasks: Task[], parentId: string | null) => Task[],
  ancestorId: string,
  nodeId: string
): boolean {
  const children = getChildren(tasks, ancestorId)
  for (const c of children) {
    if (c.id === nodeId) return true
    if (isDescendant(tasks, getChildren, c.id, nodeId)) return true
  }
  return false
}

/** Whether taskId depends on targetId (directly or transitively). */
function dependsOnTransitive(tasks: Task[], taskId: string, targetId: string): boolean {
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return false
  if (task.dependencyIds.includes(targetId)) return true
  return task.dependencyIds.some((depId) => dependsOnTransitive(tasks, depId, targetId))
}

const ADD_DEP_NEW = '__new__'
const ADD_CHILD_NEW = '__new__'
const DEP_DRAG_TYPE = 'application/x-teu-dep-task-id'

type TreeNodeData = DataNode & { task: Task }

interface TaskNodeContentProps {
  task: Task
  tasks: Task[]
  getChildren: (tasks: Task[], parentId: string | null) => Task[]
  onUpdate: TaskListProps['onUpdate']
  onDelete: TaskListProps['onDelete']
  onAddChild: TaskListProps['onAddChild']
  onAddDependency: TaskListProps['onAddDependency']
  onCreateTaskAndAddDependency: TaskListProps['onCreateTaskAndAddDependency']
  onRemoveDependency: TaskListProps['onRemoveDependency']
  onOpenTask?: (taskId: string) => void
}

function TaskNodeContent({
  task,
  tasks,
  getChildren,
  onUpdate,
  onDelete,
  onAddChild,
  onAddDependency,
  onCreateTaskAndAddDependency,
  onRemoveDependency,
  onOpenTask,
}: TaskNodeContentProps) {
  const [editing, setEditing] = useState(false)
  const [showAddChild, setShowAddChild] = useState(false)
  const [addChildChoice, setAddChildChoice] = useState<string>('')
  const [showAddDep, setShowAddDep] = useState(false)
  const [addDepChoice, setAddDepChoice] = useState<string>('')
  const [newDepTitle, setNewDepTitle] = useState('')
  const [newDepStart, setNewDepStart] = useState('')
  const [newDepDuration, setNewDepDuration] = useState(1)
  const [newDepDurationUnit, setNewDepDurationUnit] = useState<DurationUnit>('day')
  const [newDepParentId, setNewDepParentId] = useState<string | null>(null)
  const [newDepDetails, setNewDepDetails] = useState('')
  const [editTitle, setEditTitle] = useState(task.title)
  const [editStart, setEditStart] = useState(task.startDate ?? '')
  const [editDuration, setEditDuration] = useState(task.duration)
  const [editDetails, setEditDetails] = useState(task.details ?? '')
  const [depDropOver, setDepDropOver] = useState(false)

  const canDependOn = tasks.filter((t) => t.id !== task.id && !task.dependencyIds.includes(t.id))
  const canAddAsChild = tasks.filter((t) => t.id !== task.id && t.parentId !== task.id)
  const deps = task.dependencyIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[]

  const saveEdit = () => {
    onUpdate(task.id, {
      title: editTitle.trim() || task.title,
      startDate: editStart.trim() || null,
      duration: editDuration,
      details: editDetails,
    })
    setEditing(false)
  }

  const handleDepDragStart = (e: React.DragEvent) => {
    e.stopPropagation()
    e.dataTransfer.setData(DEP_DRAG_TYPE, task.id)
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'link'
  }

  const handleDepDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDepDropOver(false)
    const draggedId = e.dataTransfer.getData(DEP_DRAG_TYPE) || e.dataTransfer.getData('text/plain')
    if (!draggedId || draggedId === task.id) return
    const draggedTask = tasks.find((t) => t.id === draggedId)
    if (draggedTask?.dependencyIds.includes(task.id)) return
    if (isDescendant(tasks, getChildren, draggedId, task.id)) return
    onAddDependency(draggedId, task.id)
  }

  return (
    <div className="task-node-content" onClick={(e) => e.stopPropagation()}>
      <div className="task-row">
        <div className="task-main">
          {editing ? (
            <div className="task-edit-inline">
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Space wrap>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => e.key === ' ' && e.stopPropagation()}
                    onPressEnter={saveEdit}
                    placeholder="Title"
                    style={{ minWidth: 160 }}
                  />
                  <DatePicker
                    format="YYYY-MM-DD"
                    value={editStart ? dayjs(editStart) : null}
                    onChange={(date) => setEditStart(date ? date.format('YYYY-MM-DD') : '')}
                    style={{ width: 140 }}
                  />
                  <InputNumber min={1} value={editDuration} onChange={(v) => setEditDuration(v ?? 1)} style={{ width: 72 }} />
                </Space>
                <Input.TextArea
                  value={editDetails}
                  onChange={(e) => setEditDetails(e.target.value)}
                  placeholder="Details…"
                  rows={2}
                  style={{ width: '100%', maxWidth: 400 }}
                />
                <Space>
                  <Button type="primary" size="small" onClick={saveEdit}>Save</Button>
                  <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>
                </Space>
              </Space>
            </div>
          ) : (
            <>
              {onOpenTask ? (
                <button
                  type="button"
                  className="task-title-link"
                  onClick={() => onOpenTask(task.id)}
                >
                  <Typography.Text strong className="task-title">{task.title}</Typography.Text>
                </button>
              ) : (
                <Typography.Text strong className="task-title">{task.title}</Typography.Text>
              )}
              <span className="task-meta task-meta-inline">
                {task.startDate ? format(parseISO(task.startDate), 'MMM d') : 'No date'}
                · {task.duration}d
                {deps.length > 0 && (
                  <span className="task-deps"> · ← {deps.map((d) => d.title).join(', ')}</span>
                )}
              </span>
              {(task.details ?? '').trim() ? (
                <Typography.Text type="secondary" className="task-details" style={{ display: 'block', marginTop: 4 }}>
                  {task.details}
                </Typography.Text>
              ) : null}
            </>
          )}
        </div>
        {!editing && (
          <Space size="small" className="task-actions">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditTitle(task.title)
                setEditStart(task.startDate ?? '')
                setEditDuration(task.duration)
                setEditDetails(task.details ?? '')
                setEditing(true)
              }}
              title="Edit"
            >
              Edit
            </Button>
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setShowAddChild(true)} title="Add child">
              Child
            </Button>
            <Button type="text" size="small" icon={<LinkOutlined />} onClick={() => setShowAddDep(true)} title="Add dependency">
              Dep
            </Button>
            <span
              className="task-dep-drag-handle"
              draggable
              onMouseDown={(e) => e.stopPropagation()}
              onDragStart={handleDepDragStart}
              title="Drag to another task to depend on it"
              aria-label={`Drag to make this task depend on another`}
            >
              <LinkOutlined style={{ marginLeft: 2 }} />
            </span>
            <Popconfirm
              title="Delete this task?"
              description="Sub-tasks will be deleted too. This cannot be undone."
              onConfirm={() => onDelete(task.id)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} title="Delete">
                Delete
              </Button>
            </Popconfirm>
            <div
              className={`task-dep-drop-zone ${depDropOver ? 'task-dep-drop-zone--over' : ''}`}
              onDragOverCapture={(e) => {
                if (!e.dataTransfer.types.includes(DEP_DRAG_TYPE)) return
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'link'
                setDepDropOver(true)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDepDropOver(false)
              }}
              onDropCapture={(e) => {
                if (!e.dataTransfer.types.includes(DEP_DRAG_TYPE)) return
                e.preventDefault()
                e.stopPropagation()
                handleDepDrop(e)
              }}
              title="Drop a task here to make it depend on this task"
            >
              {depDropOver ? '← drop' : '⊕'}
            </div>
          </Space>
        )}
      </div>

      {showAddChild && (
        <div className="add-child-form add-child-form--choice">
          {addChildChoice !== ADD_CHILD_NEW ? (
            <Space wrap align="center">
              <span className="add-child-label">Add child to "{task.title}":</span>
              <Select
                placeholder="Select existing task…"
                style={{ minWidth: 180 }}
                options={canAddAsChild.map((t) => ({ value: t.id, label: t.title }))}
                onChange={(id) => {
                  if (id) {
                    onUpdate(id, { parentId: task.id })
                    setShowAddChild(false)
                    setAddChildChoice('')
                  }
                }}
              />
              <Button type="primary" size="small" onClick={() => setAddChildChoice(ADD_CHILD_NEW)}>
                Create new
              </Button>
              <Button size="small" onClick={() => { setShowAddChild(false); setAddChildChoice('') }}>Close</Button>
            </Space>
          ) : (
            <AddChildForm
              parentTitle={task.title}
              onAdd={(title, startDate, duration) => {
                onAddChild(task.id, title, startDate ?? null, duration)
                setShowAddChild(false)
                setAddChildChoice('')
              }}
              onCancel={() => setAddChildChoice('')}
            />
          )}
        </div>
      )}

      {showAddDep && (
        <div className="add-dep-form">
          {addDepChoice !== ADD_DEP_NEW ? (
            <Space wrap align="center">
              <span>Depends on:</span>
              <Select
                placeholder="Select task…"
                style={{ minWidth: 160 }}
                value={addDepChoice || undefined}
                options={[
                  ...canDependOn.map((t) => ({ value: t.id, label: t.title })),
                  { value: ADD_DEP_NEW, label: '— Create new task —' },
                ]}
                onChange={(id) => {
                  if (id === ADD_DEP_NEW) setAddDepChoice(ADD_DEP_NEW)
                  else if (id) {
                    onAddDependency(task.id, id)
                    setShowAddDep(false)
                    setAddDepChoice('')
                  }
                }}
              />
              <Button size="small" onClick={() => { setShowAddDep(false); setAddDepChoice('') }}>Close</Button>
            </Space>
          ) : (
            <div className="add-dep-create">
              <Space wrap align="center">
                <Input
                placeholder="New task title"
                value={newDepTitle}
                onChange={(e) => setNewDepTitle(e.target.value)}
                onKeyDown={(e) => e.key === ' ' && e.stopPropagation()}
                style={{ minWidth: 140 }}
              />
                <InputNumber min={1} value={newDepDuration} onChange={(v) => setNewDepDuration(v ?? 1)} style={{ width: 64 }} />
                <Select value={newDepDurationUnit} onChange={(v) => setNewDepDurationUnit(v as DurationUnit)} options={DURATION_UNITS} style={{ width: 90 }} />
                <DatePicker
                  format="YYYY-MM-DD"
                  value={newDepStart ? dayjs(newDepStart) : null}
                  onChange={(date) => setNewDepStart(date ? date.format('YYYY-MM-DD') : '')}
                  style={{ width: 140 }}
                />
                <Select
                  placeholder="Parent"
                  allowClear
                  value={newDepParentId ?? undefined}
                  onChange={(v) => setNewDepParentId(v ?? null)}
                  style={{ width: 140 }}
                  options={getChildren(tasks, null).filter((t) => t.id !== task.id).map((t) => ({ value: t.id, label: t.title }))}
                />
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    if (newDepTitle.trim()) {
                      onCreateTaskAndAddDependency(
                        task.id,
                        newDepTitle.trim(),
                        newDepStart.trim() || null,
                        durationToDays(newDepDuration, newDepDurationUnit),
                        newDepParentId,
                        newDepDetails
                      )
                      setShowAddDep(false)
                      setAddDepChoice('')
                      setNewDepTitle('')
                      setNewDepStart('')
                      setNewDepDuration(1)
                      setNewDepDurationUnit('day')
                      setNewDepParentId(null)
                      setNewDepDetails('')
                    }
                  }}
                >
                  Create & add dependency
                </Button>
                <Button size="small" onClick={() => { setAddDepChoice(''); setNewDepTitle(''); setNewDepStart(''); setNewDepDuration(1); setNewDepDurationUnit('day'); setNewDepParentId(null); setNewDepDetails('') }}>Back</Button>
              </Space>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function buildTreeData(
  tasks: Task[],
  parentId: string | null,
  getChildren: (tasks: Task[], parentId: string | null) => Task[],
  callbacks: Omit<TaskNodeContentProps, 'task' | 'tasks' | 'getChildren'>
): TreeNodeData[] {
  const list = getChildren(tasks, parentId)
  return list.map((task) => ({
    key: task.id,
    task,
    title: (
      <TaskNodeContent
        key={task.id}
        task={task}
        tasks={tasks}
        getChildren={getChildren}
        {...callbacks}
      />
    ),
    children: buildTreeData(tasks, task.id, getChildren, callbacks),
  }))
}

function AddChildForm({
  parentTitle,
  onAdd,
  onCancel,
}: {
  parentTitle: string
  onAdd: (title: string, startDate: string | null, duration: number) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [duration, setDuration] = useState(1)
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('day')

  return (
    <div className="add-child-form">
      <Space wrap align="center">
        <span className="add-child-label">Child of "{parentTitle}":</span>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === ' ' && e.stopPropagation()}
          placeholder="Child task title"
          style={{ minWidth: 140 }}
        />
        <DatePicker
        format="YYYY-MM-DD"
        value={startDate ? dayjs(startDate) : null}
        onChange={(date) => setStartDate(date ? date.format('YYYY-MM-DD') : '')}
        style={{ width: 140 }}
      />
        <InputNumber min={1} value={duration} onChange={(v) => setDuration(v ?? 1)} style={{ width: 64 }} />
        <Select value={durationUnit} onChange={(v) => setDurationUnit(v as DurationUnit)} options={DURATION_UNITS} style={{ width: 90 }} />
        <Button type="primary" size="small" onClick={() => title.trim() && onAdd(title.trim(), startDate.trim() || null, durationToDays(duration, durationUnit))}>Add</Button>
        <Button size="small" onClick={onCancel}>Cancel</Button>
      </Space>
    </div>
  )
}

type PendingDrop = { dragKey: string; dropKey: string; dragTitle: string; dropTitle: string }

export function TaskList({
  tasks,
  onUpdate,
  onDelete,
  onAddChild,
  onAddDependency,
  onCreateTaskAndAddDependency,
  onRemoveDependency,
  onOpenTask,
}: TaskListProps) {
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const depOrder = useMemo(() => getDependencyOrder(tasks), [tasks])
  const getChildrenOrdered = useCallback(
    (tasksList: Task[], parentId: string | null) => getChildren(tasksList, parentId, depOrder),
    [depOrder]
  )
  const topLevel = getChildrenOrdered(tasks, null)

  const handleDrop = (info: Parameters<NonNullable<React.ComponentProps<typeof Tree>['onDrop']>>[0]) => {
    const dragKey = String(info.dragNode?.key ?? '')
    const dropKey = String(info.node?.key ?? '')
    const dropToGap = info.dropToGap ?? false
    const dropTask = tasks.find((t) => t.id === dropKey)
    const dragTask = tasks.find((t) => t.id === dragKey)

    if (dropToGap) {
      const newParentId = dropTask?.parentId ?? null
      if (dragKey === newParentId) return
      if (newParentId && isDescendant(tasks, getChildrenOrdered, dragKey, newParentId)) return
      onUpdate(dragKey, { parentId: newParentId })
      return
    }

    if (dragKey === dropKey) return
    setPendingDrop({
      dragKey,
      dropKey,
      dragTitle: dragTask?.title ?? dragKey,
      dropTitle: dropTask?.title ?? dropKey,
    })
  }

  const applyDropAsChild = () => {
    if (!pendingDrop) return
    const { dragKey, dropKey } = pendingDrop
    if (dropKey && isDescendant(tasks, getChildrenOrdered, dragKey, dropKey)) {
      setPendingDrop(null)
      return
    }
    onUpdate(dragKey, { parentId: dropKey })
    setPendingDrop(null)
  }

  const applyDropAsDependency = () => {
    if (!pendingDrop) return
    const { dragKey, dropKey } = pendingDrop
    if (dependsOnTransitive(tasks, dropKey, dragKey)) {
      setPendingDrop(null)
      return
    }
    onAddDependency(dragKey, dropKey)
    setPendingDrop(null)
  }

  const canDropAsDependency = pendingDrop
    ? !dependsOnTransitive(tasks, pendingDrop.dropKey, pendingDrop.dragKey) &&
      !tasks.find((t) => t.id === pendingDrop.dragKey)?.dependencyIds.includes(pendingDrop.dropKey)
    : false

  const treeData = buildTreeData(
    tasks,
    null,
    getChildrenOrdered,
    { onUpdate, onDelete, onAddChild, onAddDependency, onCreateTaskAndAddDependency, onRemoveDependency, onOpenTask }
  )

  return (
    <div className="task-list">
      <Modal
        open={!!pendingDrop}
        title={pendingDrop ? `"${pendingDrop.dragTitle}" → "${pendingDrop.dropTitle}"` : ''}
        onCancel={() => setPendingDrop(null)}
        footer={null}
        destroyOnClose
      >
        {pendingDrop && (
          <Space wrap>
            <Button type="primary" onClick={applyDropAsChild}>
              Add as child
            </Button>
            <Button
              type="default"
              onClick={applyDropAsDependency}
              disabled={!canDropAsDependency}
              title={
                canDropAsDependency
                  ? undefined
                  : 'Would create a cycle or dependency already exists'
              }
            >
              Add as dependency
            </Button>
            <Button onClick={() => setPendingDrop(null)}>Cancel</Button>
          </Space>
        )}
      </Modal>
      <div className="task-list__header">
        <Typography.Title level={5} style={{ margin: 0 }}>Tasks</Typography.Title>
      </div>
      {topLevel.length === 0 ? (
        <p className="task-list-empty">No tasks yet. Add one above.</p>
      ) : (
        <Tree
          className="task-tree-antd"
          treeData={treeData}
          draggable
          blockNode
          defaultExpandAll
          onDrop={handleDrop}
          showLine
        />
      )}
    </div>
  )
}
