import { useState, useRef, useCallback, useEffect } from 'react'
import { CaretRightOutlined, CaretDownOutlined } from '@ant-design/icons'
import type { Task, TimeUnit } from './types'
import { parseISO, format } from 'date-fns'
import { getProjectBounds, getAxisTicks, dateToUnitOffset, durationInUnits, getTotalUnits, getDaysPerUnit, getEffectiveTaskBounds } from './utils/dateUtils'
import './TimelineView.css'

interface TimelineViewProps {
  tasks: Task[]
  timeUnit: TimeUnit
  onUpdateTask?: (id: string, updates: Partial<Pick<Task, 'duration'>>) => void
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

export function TimelineView({ tasks, timeUnit, onUpdateTask }: TimelineViewProps) {
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

  const [resizingId, setResizingId] = useState<string | null>(null)
  const [resizeDeltaDays, setResizeDeltaDays] = useState(0)
  const resizeStartX = useRef(0)
  const resizeStartDuration = useRef(0)

  function leftPercent(task: Task): number {
    const bounds = getEffectiveTaskBounds(tasks, task.id)
    if (!bounds.startDate) return 0
    const start = parseISO(bounds.startDate)
    const offset = dateToUnitOffset(start, min, timeUnit)
    return (offset / totalUnits) * 100
  }

  function widthPercent(task: Task): number {
    const bounds = getEffectiveTaskBounds(tasks, task.id)
    const duration = bounds.duration + (resizingId === task.id ? resizeDeltaDays : 0)
    const units = durationInUnits(Math.max(1, duration), timeUnit)
    return Math.max(0.5, (units / totalUnits) * 100)
  }

  const hasChildren = (tid: string) => tasks.some((t) => t.parentId === tid)
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
      if (!resizingId || !trackRef.current) return
      const trackWidth = trackRef.current.getBoundingClientRect().width
      if (trackWidth <= 0) return
      const deltaPx = e.clientX - resizeStartX.current
      const daysPerUnit = getDaysPerUnit(timeUnit)
      const deltaDays = Math.round((deltaPx / trackWidth) * totalUnits * daysPerUnit)
      setResizeDeltaDays(deltaDays)
    },
    [resizingId, totalUnits, timeUnit]
  )

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0 || !resizingId) return
      const task = visibleTasks.find((t) => t.id === resizingId)
      if (task && onUpdateTask) {
        const newDuration = Math.max(1, resizeStartDuration.current + resizeDeltaDays)
        onUpdateTask(resizingId, { duration: newDuration })
      }
      setResizingId(null)
      setResizeDeltaDays(0)
    },
    [resizingId, resizeDeltaDays, visibleTasks, onUpdateTask]
  )

  useEffect(() => {
    if (!resizingId) return
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingId, handleMouseMove, handleMouseUp])

  return (
    <div className="timeline-view">
      <h2 className="timeline-heading">Project timeline</h2>
      {rows.length === 0 ? (
        <p className="timeline-empty">No tasks. Add tasks in the List view.</p>
      ) : (
        <div className="timeline-scroll">
          <div className="timeline-grid">
            <div className="timeline-spacer" />
            <div className="timeline-axis">
              {ticks.map((tick) => (
                <div
                  key={tick.date.getTime()}
                  className="timeline-axis-tick"
                  style={{
                    left: `${(tick.offsetUnits / totalUnits) * 100}%`,
                  }}
                >
                  {tick.label}
                </div>
              ))}
            </div>
            <div className="timeline-spacer" />
            <div
              className="timeline-ruler"
              style={{ gridTemplateColumns: `repeat(${ticks.length}, 1fr)` }}
            >
              {ticks.map((tick) => (
                <div key={tick.date.getTime()} className="timeline-ruler-cell" />
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
                  <div className="timeline-bar-label">
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
                    <span className="timeline-bar-label-text">
                      {row.parent.title}
                      {row.children.length > 0 ? ` (+${row.children.length})` : ''}
                    </span>
                  </div>
                  <div className="timeline-bar-track" ref={i === 0 ? trackRef : undefined}>
                    {[row.parent, ...row.children].map((task) => (
                      <div
                        key={task.id}
                        className={`timeline-bar ${onUpdateTask && !hasChildren(task.id) ? 'timeline-bar-resizable' : ''}`}
                        style={{
                          left: `${leftPercent(task)}%`,
                          width: `${Math.min(widthPercent(task), 100 - leftPercent(task))}%`,
                        }}
                        title={(() => {
                          const b = getEffectiveTaskBounds(tasks, task.id)
                          const label = b.startDate ? `${format(parseISO(b.startDate), 'MMM d')} – ${b.duration}d` : `No start date – ${b.duration}d`
                          return onUpdateTask && !hasChildren(task.id) ? `${label}. Drag right edge to change duration.` : label
                        })()}
                      >
                        {onUpdateTask && !hasChildren(task.id) && (
                          <div
                            className="timeline-bar-resize-handle"
                            title="Drag to change duration"
                            onMouseDown={(e) => handleResizeMouseDown(e, task)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
