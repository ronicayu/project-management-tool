import { useState } from 'react'
import { Form, Input, InputNumber, Select, DatePicker, Button, Space } from 'antd'
import dayjs from 'dayjs'
import type { Task, DurationUnit } from './types'
import { durationToDays } from './utils/dateUtils'

const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
]

interface CreateTaskFormProps {
  onCreate: (title: string, startDate: string | null, duration: number, parentId: string | null, details: string) => void
  tasks: Task[]
}

export function CreateTaskForm({ onCreate, tasks }: CreateTaskFormProps) {
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [duration, setDuration] = useState(1)
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('day')
  const [parentId, setParentId] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [expanded, setExpanded] = useState(false)

  const handleSubmit = () => {
    const t = title.trim()
    if (!t) return
    const durationDays = durationToDays(duration, durationUnit)
    onCreate(t, startDate || null, durationDays, parentId, details)
    setTitle('')
    setStartDate('')
    setDuration(1)
    setDurationUnit('day')
    setParentId(null)
    setDetails('')
    setExpanded(false)
  }

  const topLevel = tasks.filter((t) => !t.parentId)

  return (
    <Form layout="inline" onFinish={() => handleSubmit()} style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
      <Space.Compact style={{ flex: 1, minWidth: 200 }}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          aria-label="Task title"
        />
        <InputNumber
          min={1}
          value={duration}
          onChange={(v) => setDuration(v ?? 1)}
          style={{ width: 72 }}
        />
        <Select
          value={durationUnit}
          onChange={(v) => setDurationUnit(v as DurationUnit)}
          options={DURATION_UNITS}
          style={{ width: 96 }}
        />
      </Space.Compact>
      <Button type="default" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Less' : 'More'}
      </Button>
      <Button type="primary" htmlType="submit" disabled={!title.trim()}>
        Add
      </Button>
      {expanded && (
        <div style={{ width: '100%', marginTop: 12 }}>
          <Space wrap align="start">
            <Form.Item label="Start date" style={{ marginBottom: 0 }}>
              <DatePicker
                format="YYYY-MM-DD"
                value={startDate ? dayjs(startDate) : null}
                onChange={(date) => setStartDate(date ? date.format('YYYY-MM-DD') : '')}
              />
            </Form.Item>
            <Form.Item label="Parent" style={{ marginBottom: 0 }}>
              <Select
                value={parentId ?? undefined}
                onChange={(v) => setParentId(v ?? null)}
                placeholder="None"
                allowClear
                style={{ width: 180 }}
                options={topLevel.map((t) => ({ value: t.id, label: t.title }))}
              />
            </Form.Item>
          </Space>
          <Form.Item label="Details" style={{ marginBottom: 0, marginTop: 8 }}>
            <Input.TextArea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Notes…"
              rows={2}
              style={{ width: 360 }}
            />
          </Form.Item>
        </div>
      )}
    </Form>
  )
}
