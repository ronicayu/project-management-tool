import { useState, useRef, useCallback, useEffect } from 'react'
import { CaretRightOutlined, CaretDownOutlined } from '@ant-design/icons'
import { Modal, DatePicker, InputNumber } from 'antd'
import dayjs from 'dayjs'
import type { Task, TimeUnit } from './types'
import { parseISO, format, addDays } from 'date-fns'
import { getProjectBounds, getAxisTicks, dateToUnitOffset, durationInUnits, getTotalUnits, getDaysPerUnit, getEffectiveTaskBounds, getTaskEndDate } from './utils/dateUtils'
import './TimelineView.css'

interface TimelineViewProps {
  tasks: Task[]
  timeUnit: TimeUnit
  onUpdateTask?: (id: string, updates: Partial<Pick<Task, 'startDate' | 'duration'>>) => void
  onSelectTask?: (id: string) => void
}

/** Sort key for ordering tasks within the same level: use effective start date. Nulls last. */
function sortKey(tasks: Task[], task: Task): string {
  const bounds = getEffectiveTaskBounds(tasks, task.id)
  return bounds.startDate ?? '\uFFFF' // push null/empty to end
}

/** One row = parent + its direct children on the same line. Unrelated tasks are on different rows. */
function buildRows(
  tasks: Task[],
  parentId: string | null,
  collapsedIds?: Set<string>,
  depth = 0
): { parent: Task; children: Task[]; depth: number }[] {
  const result: { parent: Task; children: Task[]; depth: number }[] = []
  const siblings = tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => sortKey(tasks, a).localeCompare(sortKey(tasks, b)))
  for (const task of siblings) {
    const directChildren = tasks
      .filter((t) => t.parentId === task.id)
      .sort((a, b) => sortKey(tasks, a).localeCompare(sortKey(tasks, b)))
    const children = collapsedIds?.has(task.id) ? [] : directChildren
    result.push({ parent: task, children, depth })
    if (!collapsedIds?.has(task.id)) {
      for (const child of directChildren) {
        const grandChildren = tasks
          .filter((t) => t.parentId === child.id)
          .sort((a, b) => sortKey(tasks, a).localeCompare(sortKey(tasks, b)))
        const childChildren = collapsedIds?.has(child.id) ? [] : grandChildren
        result.push({ parent: child, children: childChildren, depth: depth + 1 })
        if (!collapsedIds?.has(child.id)) {
          result.push(...buildRows(tasks, child.id, collapsedIds, depth + 2))
        }
      }
    }
  }
  return result
}

export function TimelineView({ tasks, timeUnit, onUpdateTask, onSelectTask }: TimelineViewProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const rows = buildRows(tasks, null, collapsedIds)
  const visibleTasks = rows.flatMap((r) => [r.parent, ...r.children])
  const flatWithEffective = visibleTasks.map((t) => getEffectiveTaskBounds(tasks, t.id))
  const { min, max } = getProjectBounds(flatWithEffective)
  const totalUnits = Math.max(0.1, getTotalUnits(min, max, timeUnit)) + 0.5
  const ticks = getAxisTicks(min, max, timeUnit)

  const CLICK_DRAG_THRESHOLD_PX = 5
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragDeltaDays, setDragDeltaDays] = useState(0)
  const dragDeltaDaysRef = useRef(0)
  const dragStartX = useRef(0)
  const dragExceededThreshold = useRef(false)

  const [resizingId, setResizingId] = useState<string | null>(null)
  const [resizeDeltaDays, setResizeDeltaDays] = useState(0)
  const resizeStartX = useRef(0)
  const resizeStartDuration = useRef(0)

  const [editPopoverTaskId, setEditPopoverTaskId] = useState<string | null>(null)
  const [labelPanelWidth, setLabelPanelWidth] = useState(160)
  const [isResizingLabels, setIsResizingLabels] = useState(false)
  const labelResizeStartX = useRef(0)
  const labelResizeStartWidth = useRef(160)

  function leftPercent(task: Task): number {
    const bounds = getEffectiveTaskBounds(tasks, task.id)
    if (!bounds.startDate) return 0
    const start = parseISO(bounds.startDate)
    let offset = dateToUnitOffset(start, min, timeUnit)
    if (draggingId === task.id) {
      const daysPerUnit = getDaysPerUnit(timeUnit)
      offset += dragDeltaDays / daysPerUnit
    }
    return Math.max(0, (offset / totalUnits) * 100)
  }

  function widthPercent(task: Task): number {
    const bounds = getEffectiveTaskBounds(tasks, task.id)
    const duration = bounds.duration + (resizingId === task.id ? resizeDeltaDays : 0)
    const units = durationInUnits(Math.max(1, duration), timeUnit)
    return Math.max(0.5, (units / totalUnits) * 100)
  }

  const hasChildren = (tid: string) => tasks.some((t) => t.parentId === tid)

  const handleBarMouseDown = (e: React.MouseEvent, task: Task) => {
    if (!onUpdateTask || e.button !== 0 || hasChildren(task.id)) return
    e.preventDefault()
    e.stopPropagation()
    dragExceededThreshold.current = false
    setDraggingId(task.id)
    setDragDeltaDays(0)
    dragStartX.current = e.clientX
  }

  const handleResizeMouseDown = (e: React.MouseEvent, task: Task) => {
    if (!onUpdateTask || e.button !== 0 || hasChildren(task.id)) return
    e.preventDefault()
    e.stopPropagation()
    setResizingId(task.id)
    setResizeDeltaDays(0)
    resizeStartX.current = e.clientX
    resizeStartDuration.current = task.duration
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!trackRef.current || trackRef.current.getBoundingClientRect().width <= 0) return
      const trackWidth = trackRef.current.getBoundingClientRect().width
      const daysPerUnit = getDaysPerUnit(timeUnit)

      if (draggingId) {
        const deltaPx = e.clientX - dragStartX.current
        if (Math.abs(deltaPx) > CLICK_DRAG_THRESHOLD_PX) dragExceededThreshold.current = true
        const deltaDays = Math.round((deltaPx / trackWidth) * totalUnits * daysPerUnit)
        dragDeltaDaysRef.current = deltaDays
        setDragDeltaDays(deltaDays)
      }
      if (resizingId) {
        const deltaPx = e.clientX - resizeStartX.current
        const deltaDays = Math.round((deltaPx / trackWidth) * totalUnits * daysPerUnit)
        setResizeDeltaDays(deltaDays)
      }
    },
    [draggingId, resizingId, totalUnits, timeUnit]
  )

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return
      if (draggingId) {
        const task = visibleTasks.find((t) => t.id === draggingId)
        if (task && onUpdateTask && dragExceededThreshold.current) {
          const bounds = getEffectiveTaskBounds(tasks, task.id)
          const delta = dragDeltaDaysRef.current
          const baseDate = bounds.startDate ? parseISO(bounds.startDate) : min
          const newStart = addDays(baseDate, delta)
          const newStartStr = format(newStart, 'yyyy-MM-dd')
          onUpdateTask(draggingId, { startDate: newStartStr })
        }
        setDraggingId(null)
        setDragDeltaDays(0)
        dragDeltaDaysRef.current = 0
      }
      if (resizingId) {
        const task = visibleTasks.find((t) => t.id === resizingId)
        if (task && onUpdateTask) {
          const newDuration = Math.max(1, resizeStartDuration.current + resizeDeltaDays)
          onUpdateTask(resizingId, { duration: newDuration })
        }
        setResizingId(null)
        setResizeDeltaDays(0)
      }
    },
    [draggingId, resizingId, resizeDeltaDays, visibleTasks, tasks, onUpdateTask, min]
  )

  useEffect(() => {
    if (!draggingId && !resizingId) return
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingId, resizingId, handleMouseMove, handleMouseUp])

  const previewTask = draggingId ? visibleTasks.find((t) => t.id === draggingId) : resizingId ? visibleTasks.find((t) => t.id === resizingId) : null
  const previewStart = previewTask && (draggingId || resizingId)
    ? (() => {
        const bounds = getEffectiveTaskBounds(tasks, previewTask.id)
        if (!bounds.startDate) return null
        const base = parseISO(bounds.startDate)
        const delta = draggingId ? dragDeltaDays : 0
        return format(addDays(base, delta), 'MMM d, yyyy')
      })()
    : null
  const previewDuration = previewTask && resizingId ? Math.max(1, resizeStartDuration.current + resizeDeltaDays) : previewTask ? getEffectiveTaskBounds(tasks, previewTask.id).duration : null
  const previewEnd = previewTask && previewStart
    ? (() => {
        const bounds = getEffectiveTaskBounds(tasks, previewTask.id)
        if (!bounds.startDate) return null
        const start = addDays(parseISO(bounds.startDate), draggingId ? dragDeltaDays : 0)
        const dur = previewDuration ?? bounds.duration
        return format(addDays(start, Math.max(1, dur) - 1), 'MMM d, yyyy')
      })()
    : null

  const handleLabelsResizeStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setIsResizingLabels(true)
    labelResizeStartX.current = e.clientX
    labelResizeStartWidth.current = labelPanelWidth
  }, [labelPanelWidth])

  useEffect(() => {
    if (!isResizingLabels) return
    const handleMove = (e: MouseEvent) => {
      const delta = e.clientX - labelResizeStartX.current
      const next = Math.max(120, Math.min(400, labelResizeStartWidth.current + delta))
      setLabelPanelWidth(next)
    }
    const handleUp = () => {
      setIsResizingLabels(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizingLabels])

  const handleEditDates = (taskId: string, updates: Partial<Pick<Task, 'startDate' | 'duration'>>) => {
    if (!onUpdateTask || Object.keys(updates).length === 0) return
    onUpdateTask(taskId, updates)
  }

  return (
    <div className="timeline-view">
      <h2 className="timeline-heading">Project timeline</h2>
      <p className="timeline-hint">
        Drag bar to reschedule. Drag right edge to change duration. Click &quot;Edit dates&quot; for start/duration.
      </p>
      {rows.length === 0 ? (
        <p className="timeline-empty">No tasks. Add tasks in the List view.</p>
      ) : (
        <div className="timeline-container">
          <div
            className="timeline-labels-panel"
            style={{ width: labelPanelWidth }}
          >
            <div className="timeline-labels-spacer" />
            <div className="timeline-labels-spacer" />
            <div
              className="timeline-labels"
              style={{ height: Math.max(200, rows.length * 44) }}
            >
              {rows.map((row, i) => (
                <div
                  key={row.parent.id}
                  className="timeline-bar-label-row"
                  style={{ top: `${i * 44}px` }}
                >
                  <div
                    className="timeline-bar-label"
                    style={{ paddingLeft: 8 + row.depth * 20 }}
                  >
                    {hasChildren(row.parent.id) ? (
                      <span
                        className="timeline-bar-expand"
                        onClick={() => toggleCollapsed(row.parent.id)}
                        title={collapsedIds.has(row.parent.id) ? 'Expand' : 'Collapse'}
                        role="button"
                        aria-expanded={!collapsedIds.has(row.parent.id)}
                      >
                        {collapsedIds.has(row.parent.id) ? (
                          <CaretRightOutlined />
                        ) : (
                          <CaretDownOutlined />
                        )}
                      </span>
                    ) : (
                      <span className="timeline-bar-expand timeline-bar-expand-placeholder" />
                    )}
                    <span
                      className="timeline-bar-label-text"
                      title={`${row.parent.title}${row.children.length > 0 ? ` (+${row.children.length})` : ''} — Double-click to open details`}
                      onDoubleClick={() => onSelectTask?.(row.parent.id)}
                    >
                      {row.parent.title}
                      {row.children.length > 0 ? ` (+${row.children.length})` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            className="timeline-resize-handle"
            onMouseDown={handleLabelsResizeStart}
            title="Drag to resize"
          />
          <div className="timeline-scroll">
            <div
              className="timeline-chart"
              style={{ minWidth: Math.max(640, ticks.length * 48) }}
            >
            <div className="timeline-axis">
              {ticks.map((tick) => (
                <div
                  key={tick.date.getTime()}
                  className="timeline-axis-tick"
                  style={{
                    left: `${(tick.offsetUnits / totalUnits) * 100}%`,
                  }}
                >
                  {tick.labelLine1 != null && tick.labelLine2 != null ? (
                    <>
                      <span className="timeline-axis-tick-line1">{tick.labelLine1}</span>
                      <span className="timeline-axis-tick-line2">{tick.labelLine2}</span>
                    </>
                  ) : (
                    tick.label
                  )}
                </div>
              ))}
            </div>
            <div
              className="timeline-ruler"
              style={{ gridTemplateColumns: `repeat(${ticks.length}, 1fr)` }}
            >
              {ticks.map((tick) => (
                <div key={tick.date.getTime()} className="timeline-ruler-cell">
                  <span className="timeline-ruler-cell-label">
                    {tick.labelLine1 != null && tick.labelLine2 != null
                      ? `${tick.labelLine1} ${tick.labelLine2}`
                      : tick.label}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="timeline-bars"
              style={{ height: Math.max(200, rows.length * 44) }}
            >
              {rows.map((row, i) => (
                  <div
                    key={row.parent.id}
                    className="timeline-bar-row"
                    style={{ top: `${i * 44}px` }}
                  >
                    <div className="timeline-bar-track" ref={i === 0 ? trackRef : undefined}>
                      {[row.parent, ...row.children].map((task) => {
                        const bounds = getEffectiveTaskBounds(tasks, task.id)
                        const editable = onUpdateTask && !hasChildren(task.id)
                        const isDragging = draggingId === task.id
                        const isResizing = resizingId === task.id
                        const startLabel = bounds.startDate ? format(parseISO(bounds.startDate), 'MMM d, yyyy') : 'No start date'
                        const endDate = bounds.startDate ? getTaskEndDate({ startDate: bounds.startDate, duration: bounds.duration }) : null
                        const endLabel = endDate ? format(parseISO(endDate), 'MMM d, yyyy') : '—'
                        return (
                          <div
                            key={`${row.parent.id}-${task.id}`}
                            className={`timeline-bar ${editable ? 'timeline-bar-resizable' : ''} ${isDragging ? 'timeline-bar-dragging' : ''} ${isResizing ? 'timeline-bar-resizing' : ''} ${editable ? 'timeline-bar-draggable' : ''}`}
                            style={{
                              left: `${leftPercent(task)}%`,
                              width: `${Math.min(widthPercent(task), 100 - leftPercent(task))}%`,
                            }}
                            title={`${startLabel} – ${endLabel}${editable ? '. Drag to reschedule, drag right edge for duration.' : ''}`}
                            onMouseDown={editable ? (e) => handleBarMouseDown(e, task) : undefined}
                          >
                            {editable && (
                              <>
                                <div
                                  className="timeline-bar-resize-handle"
                                  title="Drag to change duration"
                                  onMouseDown={(e) => {
                                    e.stopPropagation()
                                    handleResizeMouseDown(e, task)
                                  }}
                                />
                                <button
                                  type="button"
                                  className="timeline-bar-edit-btn"
                                  title="Edit dates"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    setEditPopoverTaskId((id) => (id === task.id ? null : task.id))
                                  }}
                                >
                                  <span className="material-symbols-rounded">edit_calendar</span>
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
              ))}
            </div>
            </div>
          </div>
        </div>
      )}
      {(draggingId || resizingId) && (previewStart || previewEnd) && (
        <div className="timeline-preview-tooltip">
          {previewStart && <span>Start: {previewStart}</span>}
          {previewEnd && <span>End: {previewEnd}</span>}
          {previewDuration != null && <span>{previewDuration} days</span>}
        </div>
      )}

      <Modal
        title={editPopoverTaskId ? tasks.find((t) => t.id === editPopoverTaskId)?.title ?? 'Edit dates' : ''}
        open={!!editPopoverTaskId}
        onCancel={() => setEditPopoverTaskId(null)}
        footer={null}
        destroyOnClose
      >
        {editPopoverTaskId && (() => {
          const task = tasks.find((t) => t.id === editPopoverTaskId)
          if (!task) return null
          const bounds = getEffectiveTaskBounds(tasks, task.id)
          return (
            <div className="timeline-edit-popover">
              <div style={{ marginBottom: 12 }}>
                <label className="timeline-edit-label">Start date</label>
                <DatePicker
                  value={bounds.startDate ? dayjs(bounds.startDate) : null}
                  onChange={(_, s) => {
                    const str = typeof s === 'string' ? (s || null) : null
                    handleEditDates(task.id, { startDate: str || null })
                  }}
                  format="YYYY-MM-DD"
                  allowClear
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="timeline-edit-label">Duration (days)</label>
                <InputNumber
                  min={1}
                  value={bounds.duration}
                  onChange={(v) => {
                    const d = typeof v === 'number' ? Math.max(1, Math.round(v)) : 1
                    handleEditDates(task.id, { duration: d })
                  }}
                  style={{ width: '100%' }}
                />
              </div>
              <button
                type="button"
                className="timeline-edit-close"
                onClick={() => setEditPopoverTaskId(null)}
              >
                Done
              </button>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
