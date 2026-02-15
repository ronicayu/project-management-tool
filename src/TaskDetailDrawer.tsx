import { useState, useEffect } from 'react'
import {
  Drawer,
  Button,
  Input,
  InputNumber,
  DatePicker,
  Select,
  Space,
  Typography,
  Popconfirm,
  List,
} from 'antd'
import { PlusOutlined, LinkOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Task, DurationUnit } from './types'
import { format, parseISO } from 'date-fns'
import { durationToDays } from './utils/dateUtils'
import './TaskDetailDrawer.css'

const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
]

interface TaskDetailDrawerProps {
  taskId: string | null
  tasks: Task[]
  onClose: () => void
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

  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState<string | null>(null)
  const [duration, setDuration] = useState(1)
  const [details, setDetails] = useState('')
  const [showAddChild, setShowAddChild] = useState(false)
  const [addChildTitle, setAddChildTitle] = useState('')
  const [addChildStart, setAddChildStart] = useState('')
  const [addChildDuration, setAddChildDuration] = useState(1)
  const [addChildUnit, setAddChildUnit] = useState<DurationUnit>('day')
  const [showAddDep, setShowAddDep] = useState(false)
  const [addDepTaskId, setAddDepTaskId] = useState<string | null>(null)
  const [addDepNewTitle, setAddDepNewTitle] = useState('')
  const [addDepNewStart, setAddDepNewStart] = useState('')
  const [addDepNewDuration, setAddDepNewDuration] = useState(1)
  const [addDepNewUnit, setAddDepNewUnit] = useState<DurationUnit>('day')
  const [addDepNewDetails, setAddDepNewDetails] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setStartDate(task.startDate)
      setDuration(task.duration)
      setDetails(task.details ?? '')
      setShowAddChild(false)
      setShowAddDep(false)
    }
  }, [task])

  if (!task) return null

  const children = tasks.filter((t) => t.parentId === task.id)
  const depTasks = task.dependencyIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[]
  const canDependOn = tasks.filter(
    (t) => t.id !== task.id && !task.dependencyIds.includes(t.id)
  )
  const canAddAsChild = tasks.filter(
    (t) => t.id !== task.id && t.parentId !== task.id
  )

  const handleSave = () => {
    onUpdate(task.id, {
      title: title.trim() || task.title,
      startDate: startDate?.trim() || null,
      duration,
      details: details.trim(),
    })
  }

  const handleAddChild = () => {
    if (!addChildTitle.trim()) return
    onAddChild(
      task.id,
      addChildTitle.trim(),
      addChildStart.trim() || null,
      durationToDays(addChildDuration, addChildUnit)
    )
    setAddChildTitle('')
    setAddChildStart('')
    setAddChildDuration(1)
    setAddChildUnit('day')
    setShowAddChild(false)
  }

  const handleAddDepExisting = (depId: string) => {
    onAddDependency(task.id, depId)
    setAddDepTaskId(null)
    setShowAddDep(false)
  }

  const handleAddDepNew = () => {
    if (!addDepNewTitle.trim()) return
    onCreateTaskAndAddDependency(
      task.id,
      addDepNewTitle.trim(),
      addDepNewStart.trim() || null,
      durationToDays(addDepNewDuration, addDepNewUnit),
      null,
      addDepNewDetails
    )
    setAddDepNewTitle('')
    setAddDepNewStart('')
    setAddDepNewDuration(1)
    setAddDepNewUnit('day')
    setAddDepNewDetails('')
    setShowAddDep(false)
  }

  return (
    <Drawer
      title={task.title}
      placement="right"
      width={480}
      open={!!taskId}
      onClose={onClose}
      className="task-detail-drawer"
      footer={
        <Space>
          <Popconfirm
            title="Delete this task?"
            description="Sub-tasks will be deleted too. This cannot be undone."
            onConfirm={() => {
              onDelete(task.id)
              onClose()
            }}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              Delete task
            </Button>
          </Popconfirm>
          <Button type="primary" onClick={handleSave}>
            Save changes
          </Button>
          <Button onClick={onClose}>Close</Button>
        </Space>
      }
    >
      <div className="task-detail-body">
        <div className="task-detail-section">
          <Typography.Text strong>Title</Typography.Text>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            style={{ marginTop: 4 }}
          />
        </div>

        <div className="task-detail-section">
          <Typography.Text strong>Start date</Typography.Text>
          <DatePicker
            format="YYYY-MM-DD"
            value={startDate ? dayjs(startDate) : null}
            onChange={(date) => setStartDate(date ? date.format('YYYY-MM-DD') : '')}
            style={{ width: '100%', marginTop: 4 }}
          />
        </div>

        <div className="task-detail-section">
          <Typography.Text strong>Duration (days)</Typography.Text>
          <InputNumber
            min={1}
            value={duration}
            onChange={(v) => setDuration(v ?? 1)}
            style={{ width: '100%', marginTop: 4 }}
          />
        </div>

        <div className="task-detail-section">
          <Typography.Text strong>Details</Typography.Text>
          <Input.TextArea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Notes…"
            rows={4}
            style={{ marginTop: 4 }}
          />
        </div>

        <div className="task-detail-section">
          <div className="task-detail-section-header">
            <Typography.Text strong>Dependencies</Typography.Text>
            <Button
              type="text"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => setShowAddDep(!showAddDep)}
            >
              Add
            </Button>
          </div>
          {depTasks.length > 0 && (
            <List
              size="small"
              dataSource={depTasks}
              renderItem={(t) => (
                <List.Item
                  actions={[
                    <Button
                      type="text"
                      size="small"
                      onClick={() => onOpenTask(t.id)}
                    >
                      Open
                    </Button>,
                    <Popconfirm
                      key="remove"
                      title="Remove dependency?"
                      onConfirm={() => onRemoveDependency(task.id, t.id)}
                    >
                      <Button type="text" size="small" danger>
                        Remove
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={t.title}
                    description={
                      (t.startDate ? format(parseISO(t.startDate), 'MMM d') : 'No date') + ` · ${t.duration}d`
                    }
                  />
                </List.Item>
              )}
            />
          )}
          {showAddDep && (
            <div className="task-detail-add-form">
              <Select
                placeholder="Select existing task…"
                style={{ width: '100%', marginBottom: 8 }}
                value={addDepTaskId}
                onChange={(id) => {
                  if (id) handleAddDepExisting(id)
                }}
                options={canDependOn.map((t) => ({ value: t.id, label: t.title }))}
              />
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                Or create new:
              </Typography.Text>
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Input
                  placeholder="New task title"
                  value={addDepNewTitle}
                  onChange={(e) => setAddDepNewTitle(e.target.value)}
                />
                <DatePicker
                  format="YYYY-MM-DD"
                  value={addDepNewStart ? dayjs(addDepNewStart) : null}
                  onChange={(date) => setAddDepNewStart(date ? date.format('YYYY-MM-DD') : '')}
                  style={{ width: '100%' }}
                />
                <Space>
                  <InputNumber
                    min={1}
                    value={addDepNewDuration}
                    onChange={(v) => setAddDepNewDuration(v ?? 1)}
                    style={{ width: 80 }}
                  />
                  <Select
                    value={addDepNewUnit}
                    onChange={(v) => setAddDepNewUnit(v as DurationUnit)}
                    options={DURATION_UNITS}
                    style={{ width: 90 }}
                  />
                </Space>
                <Input.TextArea
                  placeholder="Details"
                  value={addDepNewDetails}
                  onChange={(e) => setAddDepNewDetails(e.target.value)}
                  rows={2}
                />
                <Button type="primary" size="small" onClick={handleAddDepNew} disabled={!addDepNewTitle.trim()}>
                  Create & add as dependency
                </Button>
                <Button size="small" onClick={() => setShowAddDep(false)}>Cancel</Button>
              </Space>
            </div>
          )}
        </div>

        <div className="task-detail-section">
          <div className="task-detail-section-header">
            <Typography.Text strong>Child tasks</Typography.Text>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setShowAddChild(!showAddChild)}
            >
              Add
            </Button>
          </div>
          {children.length > 0 && (
            <List
              size="small"
              dataSource={children}
              renderItem={(t) => (
                <List.Item
                  actions={[
                    <Button
                      type="text"
                      size="small"
                      onClick={() => onOpenTask(t.id)}
                    >
                      Open
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={t.title}
                    description={
                      (t.startDate ? format(parseISO(t.startDate), 'MMM d') : 'No date')
                      + ` · ${t.duration}d`
                    }
                  />
                </List.Item>
              )}
            />
          )}
          {showAddChild && (
            <div className="task-detail-add-form">
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Input
                  placeholder="Child task title"
                  value={addChildTitle}
                  onChange={(e) => setAddChildTitle(e.target.value)}
                />
                <DatePicker
                  format="YYYY-MM-DD"
                  value={addChildStart ? dayjs(addChildStart) : null}
                  onChange={(date) => setAddChildStart(date ? date.format('YYYY-MM-DD') : '')}
                  style={{ width: '100%' }}
                />
                <Space>
                  <InputNumber
                    min={1}
                    value={addChildDuration}
                    onChange={(v) => setAddChildDuration(v ?? 1)}
                    style={{ width: 80 }}
                  />
                  <Select
                    value={addChildUnit}
                    onChange={(v) => setAddChildUnit(v as DurationUnit)}
                    options={DURATION_UNITS}
                    style={{ width: 90 }}
                  />
                </Space>
                <Button type="primary" size="small" onClick={handleAddChild} disabled={!addChildTitle.trim()}>
                  Add child
                </Button>
                <Button size="small" onClick={() => setShowAddChild(false)}>Cancel</Button>
              </Space>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}
