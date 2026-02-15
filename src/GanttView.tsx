import { useState, useRef, useCallback, useEffect } from 'react'
import { CaretRightOutlined, CaretDownOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { Task, TimeUnit, ViewMode } from './types'
import { parseISO, format, addDays, startOfDay } from 'date-fns'
import {
  getProjectBounds,
  getAxisTicks,
  dateToUnitOffset,
  durationInUnits,
  getTotalUnits,
  getDaysPerUnit,
  getEffectiveTaskBounds,
} from './utils/dateUtils'
import './GanttView.css'

const CLICK_DRAG_THRESHOLD_PX = 5
const ZOOM_OPTIONS = [50, 75, 100, 125, 150] as const

const ROW_HEIGHT = 48
const BAR_MARGIN = 4

const UNIT_WIDTH_PX: Record<TimeUnit, number> = {
  day: 24,
  week: 28,
  month: 36,
  quarter: 48,
}

interface GanttViewProps {
  tasks: Task[]
  timeUnit: TimeUnit
  onUpdateTask?: (
    id: string,
    updates: Partial<Pick<Task, 'title' | 'startDate' | 'duration'>>
  ) => void
  onOpenTask?: (taskId: string) => void
  onSwitchToView?: (view: ViewMode) => void
}

/** One row = parent + its direct children on the same line. Unrelated tasks are on different rows. */
function buildRows(
  tasks: Task[],
  parentId: string | null,
  collapsedIds?: Set<string>
): { parent: Task; children: Task[] }[] {
  const result: { parent: Task; children: Task[] }[] = []
  const siblings = tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
  for (const task of siblings) {
    const directChildren = tasks
      .filter((t) => t.parentId === task.id)
      .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    const children = collapsedIds?.has(task.id) ? [] : directChildren
    result.push({ parent: task, children })
    if (!collapsedIds?.has(task.id)) {
      for (const child of directChildren) {
        const grandChildren = tasks
          .filter((t) => t.parentId === child.id)
          .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
        const childChildren = collapsedIds?.has(child.id) ? [] : grandChildren
        result.push({ parent: child, children: childChildren })
        result.push(...buildRows(tasks, child.id, collapsedIds))
      }
    }
  }
  return result
}

function buildDependencyEdges(
  flat: Task[],
  taskById: Map<string, Task>
): { from: Task; to: Task }[] {
  const edges: { from: Task; to: Task }[] = []
  flat.forEach((toTask) => {
    toTask.dependencyIds.forEach((depId) => {
      const fromTask = taskById.get(depId)
      if (fromTask) edges.push({ from: fromTask, to: toTask })
    })
  })
  return edges
}

export function GanttView({ tasks, timeUnit, onUpdateTask, onOpenTask, onSwitchToView }: GanttViewProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [chartScale, setChartScale] = useState(100)
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const dragExceededThreshold = useRef(false)
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
  const unitWidth = UNIT_WIDTH_PX[timeUnit]
  const columnCount = Math.max(ticks.length, Math.ceil(totalUnits))
  const chartWidth = columnCount * unitWidth

  const taskById = new Map(visibleTasks.map((t) => [t.id, t]))
  const rowIndexById = new Map<string, number>()
  rows.forEach((row, i) => {
    rowIndexById.set(row.parent.id, i)
    row.children.forEach((c) => rowIndexById.set(c.id, i))
  })
  const edges = buildDependencyEdges(visibleTasks, taskById)
  const hasChildren = (tid: string) => tasks.some((t) => t.parentId === tid)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffsetPx, setDragOffsetPx] = useState(0)
  const [resizingId, setResizingId] = useState<string | null>(null)
  const [resizeOffsetPx, setResizeOffsetPx] = useState(0)
  const dragStartX = useRef(0)
  const dragStartLeftPx = useRef(0)
  const resizeStartX = useRef(0)
  const resizeStartWidthPx = useRef(0)

  const leftPx = useCallback(
    (task: Task): number => {
      const bounds = getEffectiveTaskBounds(tasks, task.id)
      if (!bounds.startDate) return 0
      const start = parseISO(bounds.startDate)
      const offset = dateToUnitOffset(start, min, timeUnit)
      return Math.max(0, offset * unitWidth)
    },
    [tasks, min, timeUnit, unitWidth]
  )

  const widthPx = useCallback(
    (task: Task): number => {
      const bounds = getEffectiveTaskBounds(tasks, task.id)
      const w = durationInUnits(bounds.duration, timeUnit) * unitWidth
      return Math.max(unitWidth * 0.5, w)
    },
    [tasks, timeUnit, unitWidth]
  )

  const handleBarMouseDown = (e: React.MouseEvent, task: Task) => {
    if (e.button !== 0) return
    if (hasChildren(task.id)) return
    if (!onUpdateTask && !onOpenTask) return
    e.preventDefault()
    dragExceededThreshold.current = false
    setDraggingId(task.id)
    setDragOffsetPx(0)
    dragStartX.current = e.clientX
    dragStartLeftPx.current = leftPx(task)
  }

  const handleResizeMouseDown = (e: React.MouseEvent, task: Task) => {
    if (!onUpdateTask || e.button !== 0 || hasChildren(task.id)) return
    e.preventDefault()
    e.stopPropagation()
    setResizingId(task.id)
    setResizeOffsetPx(0)
    resizeStartX.current = e.clientX
    resizeStartWidthPx.current = widthPx(task)
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingId) {
        const deltaX = e.clientX - dragStartX.current
        if (Math.abs(deltaX) > CLICK_DRAG_THRESHOLD_PX) dragExceededThreshold.current = true
        setDragOffsetPx(deltaX)
      }
      if (resizingId) {
        const deltaX = e.clientX - resizeStartX.current
        setResizeOffsetPx(deltaX)
      }
    },
    [draggingId, resizingId]
  )

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return
      if (draggingId) {
        if (!dragExceededThreshold.current && onOpenTask) {
          onOpenTask(draggingId)
        } else {
          const task = taskById.get(draggingId)
          if (task && onUpdateTask) {
            const unitsDelta = dragOffsetPx / unitWidth
            const daysPerUnit = getDaysPerUnit(timeUnit)
            const daysDelta = Math.round(unitsDelta * daysPerUnit)
            if (daysDelta !== 0) {
              const baseDate = task.startDate ? parseISO(task.startDate) : min
              const newStart = addDays(baseDate, daysDelta)
              const newStartStr = newStart.toISOString().slice(0, 10)
              onUpdateTask(draggingId, { startDate: newStartStr })
            }
          }
        }
        setDraggingId(null)
        setDragOffsetPx(0)
      }
      if (resizingId) {
        const task = taskById.get(resizingId)
        if (task && onUpdateTask) {
          const newWidthPx = Math.max(unitWidth * 0.5, resizeStartWidthPx.current + resizeOffsetPx)
          const daysPerUnit = getDaysPerUnit(timeUnit)
          const newDuration = Math.max(1, Math.round((newWidthPx / unitWidth) * daysPerUnit))
          onUpdateTask(resizingId, { duration: newDuration })
        }
        setResizingId(null)
        setResizeOffsetPx(0)
      }
    },
    [draggingId, dragOffsetPx, resizingId, resizeOffsetPx, taskById, onUpdateTask, onOpenTask, min, unitWidth, timeUnit]
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

  const columnWidthPx = unitWidth
  const headerColumnCount = ticks.length

  const today = startOfDay(new Date())
  const todayInRange = min <= today && today <= max
  const todayPx = todayInRange ? dateToUnitOffset(today, min, timeUnit) * unitWidth : 0

  const handleFitToView = useCallback(() => {
    if (!chartScrollRef.current || !chartWrapRef.current) return
    const scrollWidth = chartScrollRef.current.getBoundingClientRect().width
    const chartTotalWidth = 240 + chartWidth
    if (chartTotalWidth <= 0) return
    const scale = Math.max(25, Math.min(150, (scrollWidth / chartTotalWidth) * 100))
    setChartScale(Math.round(scale))
  }, [chartWidth])

  const previewTask = draggingId ? taskById.get(draggingId) : resizingId ? taskById.get(resizingId) : null
  const previewStart = previewTask && draggingId
    ? (() => {
        const baseDate = previewTask.startDate ? parseISO(previewTask.startDate) : min
        const unitsDelta = dragOffsetPx / unitWidth
        const daysPerUnit = getDaysPerUnit(timeUnit)
        const daysDelta = Math.round(unitsDelta * daysPerUnit)
        return format(addDays(baseDate, daysDelta), 'MMM d, yyyy')
      })()
    : null
  const previewDuration = previewTask && resizingId
    ? (() => {
        const newWidthPx = Math.max(unitWidth * 0.5, resizeStartWidthPx.current + resizeOffsetPx)
        const daysPerUnit = getDaysPerUnit(timeUnit)
        return Math.max(1, Math.round((newWidthPx / unitWidth) * daysPerUnit))
      })()
    : null

  return (
    <div className="gantt-view">
      <h2 className="gantt-heading">Gantt chart</h2>
      <p className="gantt-hint">
        Click a task or bar to open. Drag bar to reschedule, drag right edge to change duration.
      </p>
      {rows.length === 0 ? (
        <div className="gantt-empty-wrap">
          <p className="gantt-empty">No tasks. Add tasks in the List view.</p>
          {onSwitchToView && (
            <Button type="primary" onClick={() => onSwitchToView('list')}>
              Go to List view
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="gantt-toolbar">
            <Button size="small" onClick={handleFitToView}>
              Fit to view
            </Button>
            <div className="gantt-zoom">
              <span className="gantt-zoom-label">Zoom:</span>
              <div className="gantt-zoom-buttons">
                {ZOOM_OPTIONS.map((z) => (
                  <button
                    key={z}
                    type="button"
                    className={`gantt-zoom-btn ${chartScale === z ? 'gantt-zoom-btn-active' : ''}`}
                    onClick={() => setChartScale(z)}
                  >
                    {z}%
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="gantt-scroll" ref={chartScrollRef}>
            <div
              className="gantt-zoom-wrap"
              style={{
                width: (240 + chartWidth) * (chartScale / 100),
                minHeight: 200,
              }}
            >
              <div
                ref={chartWrapRef}
                className="gantt-container"
                style={{
                  width: 240 + chartWidth,
                  transform: `scale(${chartScale / 100})`,
                  transformOrigin: '0 0',
                }}
              >
            <div className="gantt-header">
              <div className="gantt-header-task">Task</div>
              <div className="gantt-header-chart" style={{ display: 'flex' }}>
                {ticks.map((tick) => (
                  <div
                    key={tick.date.getTime()}
                    className="gantt-header-day"
                    style={{ width: columnWidthPx }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="gantt-body">
              <div
                className="gantt-dependency-layer"
                style={{
                  left: 240,
                  width: chartWidth,
                  height: rows.length * ROW_HEIGHT,
                }}
                aria-hidden
              >
                <svg
                  width={chartWidth}
                  height={rows.length * ROW_HEIGHT}
                  className="gantt-dependency-svg"
                >
                  <defs>
                    <marker
                      id="gantt-arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="4"
                      orient="auto"
                    >
                      <path
                        d="M0,0 L8,4 L0,8 Z"
                        fill="var(--text-muted)"
                      />
                    </marker>
                  </defs>
                  {edges.map(({ from, to }, k) => {
                    const fromRow = rowIndexById.get(from.id) ?? 0
                    const toRow = rowIndexById.get(to.id) ?? 0
                    const xFromEnd = BAR_MARGIN + leftPx(from) + widthPx(from)
                    const xToStart = BAR_MARGIN + leftPx(to)
                    const yFrom = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2
                    const yTo = toRow * ROW_HEIGHT + ROW_HEIGHT / 2
                    const midX = (xFromEnd + xToStart) / 2
                    const path = `M ${xFromEnd} ${yFrom} L ${midX} ${yFrom} L ${midX} ${yTo} L ${xToStart} ${yTo}`
                    return (
                      <path
                        key={`${from.id}-${to.id}-${k}`}
                        d={path}
                        className="gantt-dependency-line"
                        markerEnd="url(#gantt-arrow)"
                      />
                    )
                  })}
                </svg>
              </div>
              {todayInRange && (
                <div
                  className="gantt-today-layer"
                  style={{
                    left: 240,
                    width: chartWidth,
                    height: rows.length * ROW_HEIGHT,
                  }}
                  aria-hidden
                >
                  <div
                    className="gantt-today-line"
                    style={{ left: todayPx }}
                  />
                  <span className="gantt-today-label" style={{ left: todayPx }}>
                    Today
                  </span>
                </div>
              )}
              {rows.map((row, i) => {
                const rowTasks = [row.parent, ...row.children]
                return (
                  <div
                    key={row.parent.id}
                    className="gantt-row"
                    style={{
                      background:
                        i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div className="gantt-task-cell">
                      <div className="gantt-task-title-row">
                        {hasChildren(row.parent.id) ? (
                          <span
                            className="gantt-expand"
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
                          <span className="gantt-expand gantt-expand-placeholder" />
                        )}
                        {onOpenTask ? (
                          <button
                            type="button"
                            className="gantt-task-title gantt-task-title-btn"
                            onClick={() => onOpenTask(row.parent.id)}
                          >
                            {row.parent.title}
                            {row.children.length > 0 ? ` (+${row.children.length})` : ''}
                          </button>
                        ) : (
                          <span className="gantt-task-title">
                            {row.parent.title}
                            {row.children.length > 0 ? ` (+${row.children.length})` : ''}
                          </span>
                        )}
                      </div>
                      <span className="gantt-task-meta">
                        {(() => {
                          const eff = getEffectiveTaskBounds(tasks, row.parent.id)
                          return eff.startDate
                            ? `${format(parseISO(eff.startDate), 'MMM d')} · ${eff.duration}d`
                            : `No date · ${eff.duration}d`
                        })()}
                      </span>
                    </div>
                    <div
                      className="gantt-chart-cell"
                      style={{ width: chartWidth }}
                    >
                      <div className="gantt-bar-wrap">
                        {rowTasks.map((task) => {
                          const isDragging = draggingId === task.id
                          const isResizing = resizingId === task.id
                          const effective = getEffectiveTaskBounds(tasks, task.id)
                          const left = leftPx(task) + (isDragging ? dragOffsetPx : 0)
                          const width = widthPx(task) + (isResizing ? resizeOffsetPx : 0)
                          const displayWidth = Math.max(unitWidth * 0.5, width)
                          return (
                            <div
                              key={task.id}
                              className={`gantt-bar ${isDragging ? 'gantt-bar-dragging' : ''} ${isResizing ? 'gantt-bar-resizing' : ''} ${(onUpdateTask || onOpenTask) && !hasChildren(task.id) ? 'gantt-bar-draggable' : ''} ${onUpdateTask && !hasChildren(task.id) ? 'gantt-bar-resizable' : ''} ${onOpenTask && hasChildren(task.id) ? 'gantt-bar-clickable' : ''}`}
                              style={{
                                left,
                                width: displayWidth,
                              }}
                              title={
                                effective.startDate
                                  ? `${task.title}: ${format(parseISO(effective.startDate), 'MMM d')} – ${effective.duration} days`
                                  : `${task.title}: No start date – ${effective.duration}d`
                                + (onUpdateTask && !hasChildren(task.id) ? '. Drag to reschedule, drag right edge to change duration.' : '')
                              }
                              onMouseDown={(e) => handleBarMouseDown(e, task)}
                              onClick={hasChildren(task.id) && onOpenTask ? () => onOpenTask(task.id) : undefined}
                            >
                              {onUpdateTask && !hasChildren(task.id) && (
                                <div
                                  className="gantt-bar-resize-handle"
                                  title="Drag to change duration"
                                  onMouseDown={(e) => handleResizeMouseDown(e, task)}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div
                className="gantt-legend"
                style={{ left: 240, width: chartWidth }}
                aria-hidden
              >
                <span className="gantt-legend-text">Dependency: prerequisite → dependent</span>
              </div>
            </div>
              </div>
            </div>
          </div>
          {(draggingId || resizingId) && (previewStart != null || previewDuration != null) && (
            <div className="gantt-preview-tooltip">
              {previewStart != null && <span>Start: {previewStart}</span>}
              {previewDuration != null && <span>{previewDuration} days</span>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
