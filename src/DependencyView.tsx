import { useMemo, useState, useRef, useEffect } from 'react'
import { Button, Segmented, Select, Space, Table, Tooltip } from 'antd'
import type { Task } from './types'
import { format, parseISO } from 'date-fns'
import './DependencyView.css'

const NODE_WIDTH = 180
const NODE_HEIGHT = 52
const LEVEL_GAP = 140
const NODE_GAP = 28
/** Horizontal offset per lane so edges into the same target don't overlap. */
const EDGE_LANE_OFFSET = 20

const ZOOM_OPTIONS = [50, 75, 100, 125, 150] as const

interface DependencyViewProps {
  tasks: Task[]
  onOpenTask?: (taskId: string) => void
}

/** Compute topological levels: level 0 = no deps, level k = all deps in levels < k. Breaks cycles by treating cycle back-edges as level 0. */
function getLevels(tasks: Task[]): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const level = new Map<string, number>()
  const visiting = new Set<string>()

  function getLevel(id: string): number {
    if (level.has(id)) return level.get(id)!
    if (visiting.has(id)) {
      level.set(id, 0)
      return 0
    }
    const task = byId.get(id)
    if (!task || task.dependencyIds.length === 0) {
      level.set(id, 0)
      return 0
    }
    visiting.add(id)
    try {
      const depLevels = task.dependencyIds.map((depId) => getLevel(depId))
      const maxDep = Math.max(...depLevels, 0)
      const L = maxDep + 1
      level.set(id, L)
      return L
    } finally {
      visiting.delete(id)
    }
  }

  tasks.forEach((t) => getLevel(t.id))
  return level
}

/** Edges: from A to B when B depends on A (arrow points to dependent). */
function getEdges(tasks: Task[]): { fromId: string; toId: string }[] {
  const edges: { fromId: string; toId: string }[] = []
  tasks.forEach((task) => {
    task.dependencyIds.forEach((depId) => {
      edges.push({ fromId: depId, toId: task.id })
    })
  })
  return edges
}

/** All task ids that are prerequisites of taskId (transitive). */
function getPrerequisiteIds(tasks: Task[], taskId: string): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const out = new Set<string>()
  function collect(id: string) {
    const task = byId.get(id)
    if (!task) return
    task.dependencyIds.forEach((depId) => {
      if (!out.has(depId)) {
        out.add(depId)
        collect(depId)
      }
    })
  }
  collect(taskId)
  return out
}

/** All task ids that depend on taskId (transitive). */
function getDependentIds(tasks: Task[], taskId: string): Set<string> {
  const out = new Set<string>()
  function collect(id: string) {
    tasks.forEach((t) => {
      if (t.dependencyIds.includes(id) && !out.has(t.id)) {
        out.add(t.id)
        collect(t.id)
      }
    })
  }
  collect(taskId)
  return out
}

export function DependencyView({ tasks: tasksProp, onOpenTask }: DependencyViewProps) {
  const tasks = Array.isArray(tasksProp) ? tasksProp : []
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph')
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [fitScale, setFitScale] = useState<number | null>(null)
  const graphWrapRef = useRef<HTMLDivElement>(null)

  const { levels, edges, taskPos, bounds, edgeLane, edgeLaneCount, levelByTaskId } = useMemo(() => {
    const levels = getLevels(tasks)
    const levelToTasks = new Map<number, string[]>()
    levels.forEach((l, id) => {
      if (!levelToTasks.has(l)) levelToTasks.set(l, [])
      levelToTasks.get(l)!.push(id)
    })
    const sortedLevels = Array.from(levelToTasks.keys()).sort((a, b) => a - b)
    sortedLevels.forEach((l) => levelToTasks.get(l)!.sort())

    const edges = getEdges(tasks)

    const taskPos = new Map<string, { x: number; y: number }>()
    let maxX = 0
    let maxY = 0
    sortedLevels.forEach((l) => {
      const ids = levelToTasks.get(l)!
      ids.forEach((id, i) => {
        const x = 24 + l * (NODE_WIDTH + LEVEL_GAP)
        const y = 24 + i * (NODE_HEIGHT + NODE_GAP)
        taskPos.set(id, { x, y })
        maxX = Math.max(maxX, x + NODE_WIDTH)
        maxY = Math.max(maxY, y + NODE_HEIGHT)
      })
    })

    const taskIds = new Set(tasks.map((t) => t.id))
    const validEdges = edges.filter((e) => taskIds.has(e.fromId) && taskIds.has(e.toId))

    // Assign a lane per edge into the same target so incoming edges don't overlap
    const edgesByTarget = new Map<string, { fromId: string; toId: string }[]>()
    validEdges.forEach((e) => {
      const list = edgesByTarget.get(e.toId) ?? []
      list.push(e)
      edgesByTarget.set(e.toId, list)
    })
    edgesByTarget.forEach((list) => {
      list.sort((a, b) => {
        const posA = taskPos.get(a.fromId)
        const posB = taskPos.get(b.fromId)
        if (!posA || !posB) return 0
        return posA.y !== posB.y ? posA.y - posB.y : a.fromId.localeCompare(b.fromId)
      })
    })
    const edgeLane = new Map<string, number>()
    const edgeLaneCount = new Map<string, number>()
    validEdges.forEach((e) => {
      const list = edgesByTarget.get(e.toId)!
      const idx = list.findIndex((x) => x.fromId === e.fromId && x.toId === e.toId)
      edgeLane.set(`${e.fromId}-${e.toId}`, idx >= 0 ? idx : 0)
      edgeLaneCount.set(`${e.fromId}-${e.toId}`, list.length)
    })

    const width = Math.max(400, maxX + 24)
    const height = Math.max(300, maxY + 24)

    return {
      levels: sortedLevels,
      levelByTaskId: levels,
      edges: validEdges,
      taskPos,
      bounds: { width, height },
      edgeLane,
      edgeLaneCount,
    }
  }, [tasks])

  const focusedSubgraphIds = useMemo(() => {
    if (!focusedTaskId) return null
    const prereq = getPrerequisiteIds(tasks, focusedTaskId)
    const deps = getDependentIds(tasks, focusedTaskId)
    const set = new Set(prereq)
    set.add(focusedTaskId)
    deps.forEach((id) => set.add(id))
    return set
  }, [tasks, focusedTaskId])

  const handleFitToView = () => {
    const wrap = graphWrapRef.current
    if (!wrap || viewMode !== 'graph' || bounds.width <= 0 || bounds.height <= 0) return
    const rect = wrap.getBoundingClientRect()
    const scale = Math.min(rect.width / bounds.width, rect.height / bounds.height, 1.2)
    setFitScale(scale)
  }

  useEffect(() => {
    if (viewMode !== 'graph') return
    const t = setTimeout(() => {
      const wrap = graphWrapRef.current
      if (!wrap || bounds.width <= 0 || bounds.height <= 0) return
      const rect = wrap.getBoundingClientRect()
      const scale = Math.min(rect.width / bounds.width, rect.height / bounds.height, 1.2)
      setFitScale(scale)
    }, 0)
    return () => clearTimeout(t)
  }, [viewMode, bounds.width, bounds.height])

  const scale = fitScale !== null ? fitScale : 1
  const zoomScale = zoom / 100
  const totalScale = scale * zoomScale

  if (tasks.length === 0) {
    return (
      <div className="dependency-view dependency-view-visible">
        <h2 className="dependency-view-title">Dependencies</h2>
        <p className="dependency-view-empty">No tasks. Add tasks in the List view and add dependencies.</p>
        {onOpenTask && (
          <p className="dependency-view-empty-cta">Create a task in List view to get started.</p>
        )}
      </div>
    )
  }

  const hasEdges = edges.length > 0

  const sortedTasksForList = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const levelA = levelByTaskId.get(a.id) ?? 0
      const levelB = levelByTaskId.get(b.id) ?? 0
      if (levelA !== levelB) return levelA - levelB
      return (a.title || '').localeCompare(b.title || '')
    })
  }, [tasks, levelByTaskId])

  return (
    <div className="dependency-view dependency-view-visible">
      <div className="dependency-view-chrome">
        <h2 className="dependency-view-title">Dependencies</h2>
        <Space wrap align="center" className="dependency-view-controls">
          <Segmented
            options={[{ label: 'Graph', value: 'graph' }, { label: 'List', value: 'list' }]}
            value={viewMode}
            onChange={(v) => setViewMode(v === 'list' ? 'list' : 'graph')}
          />
          {viewMode === 'graph' && (
            <Select
              placeholder="Focus on a task…"
              value={focusedTaskId ?? '__all__'}
              onChange={(v) => setFocusedTaskId(v === '__all__' || v == null ? null : v)}
              options={[
                { label: 'Show all', value: '__all__' },
                ...tasks.map((t) => ({ label: t.title || t.id, value: t.id })),
              ]}
              style={{ minWidth: 180 }}
            />
          )}
          {viewMode === 'graph' && (
            <Space>
              <Button size="small" onClick={handleFitToView}>Fit to view</Button>
              <Select
                size="small"
                value={zoom}
                onChange={setZoom}
                options={ZOOM_OPTIONS.map((p) => ({ label: `${p}%`, value: p }))}
                style={{ width: 72 }}
              />
            </Space>
          )}
        </Space>
        <Tooltip title="Prerequisite → dependent. Click a task to open it. Use 'Focus on a task' to highlight one chain.">
          <span className="dependency-view-hint">?</span>
        </Tooltip>
      </div>
      <p className="dependency-view-hint-text">Prerequisite → dependent. Click a task to open it.</p>

      {viewMode === 'list' ? (
        <div className="dependency-view-list-wrap">
          <Table
            size="small"
            dataSource={sortedTasksForList}
            rowKey="id"
            pagination={false}
            columns={[
              {
                title: 'Task',
                dataIndex: 'title',
                key: 'title',
                render: (_, task) =>
                  onOpenTask ? (
                    <button type="button" className="dependency-view-link" onClick={() => onOpenTask(task.id)}>
                      {task.title || task.id}
                    </button>
                  ) : (task.title || task.id),
              },
              {
                title: 'Depends on',
                key: 'dependsOn',
                render: (_, task) =>
                  task.dependencyIds.length === 0 ? (
                    '—'
                  ) : (
                    <Space size="small" wrap>
                      {task.dependencyIds.map((depId) => {
                        const dep = tasks.find((t) => t.id === depId)
                        const label = dep?.title || depId
                        return onOpenTask ? (
                          <button
                            key={depId}
                            type="button"
                            className="dependency-view-link"
                            onClick={() => onOpenTask(depId)}
                          >
                            {label}
                          </button>
                        ) : (
                          <span key={depId}>{label}</span>
                        )
                      })}
                    </Space>
                  ),
              },
              {
                title: 'Actions',
                key: 'actions',
                width: 80,
                render: (_, task) =>
                  onOpenTask ? (
                    <Button type="link" size="small" onClick={() => onOpenTask(task.id)}>Open</Button>
                  ) : null,
              },
            ]}
          />
        </div>
      ) : !hasEdges ? (
        <div className="dependency-view-empty-block">
          <p className="dependency-view-empty">No dependencies yet. Add dependencies in the List view (Dep button on a task).</p>
          <p className="dependency-view-empty-cta">You can open any task from the List and use the dependency control there.</p>
        </div>
      ) : (
        <div ref={graphWrapRef} className="dependency-view-graph-wrap" style={{ minHeight: 400 }}>
          <div
            className="dependency-view-graph-scaled"
            style={{
              transform: `scale(${totalScale})`,
              transformOrigin: '0 0',
              width: bounds.width,
              height: bounds.height,
            }}
          >
            <svg
              className="dependency-view-svg"
              width={bounds.width}
              height={bounds.height}
              style={{ minWidth: bounds.width, minHeight: bounds.height }}
            >
              <defs>
                <marker
                  id="dep-arrow"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="5"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 Z" className="dependency-view-arrow" />
                </marker>
              </defs>
              {levels.map((l) => (
                <rect
                  key={l}
                  x={24 + l * (NODE_WIDTH + LEVEL_GAP) - 8}
                  y={0}
                  width={NODE_WIDTH + LEVEL_GAP}
                  height={bounds.height}
                  className="dependency-view-level-band"
                />
              ))}
              {edges.map(({ fromId, toId }, i) => {
                const from = taskPos.get(fromId)
                const to = taskPos.get(toId)
                if (!from || !to) return null
                const dimmed = focusedSubgraphIds && !focusedSubgraphIds.has(fromId) && !focusedSubgraphIds.has(toId)
                const x1 = from.x + NODE_WIDTH
                const y1 = from.y + NODE_HEIGHT / 2
                const x2 = to.x
                const y2 = to.y + NODE_HEIGHT / 2
                const midX = (x1 + x2) / 2
                const laneIndex = edgeLane.get(`${fromId}-${toId}`) ?? 0
                const nLanes = edgeLaneCount.get(`${fromId}-${toId}`) ?? 1
                const laneOffset = (laneIndex - (nLanes - 1) / 2) * EDGE_LANE_OFFSET
                const cpx = midX + laneOffset
                const path = `M ${x1} ${y1} Q ${cpx} ${y1} ${cpx} ${(y1 + y2) / 2} Q ${cpx} ${y2} ${x2} ${y2}`
                return (
                  <path
                    key={`${fromId}-${toId}-${i}`}
                    d={path}
                    className={dimmed ? 'dependency-view-edge dependency-view-edge--dimmed' : 'dependency-view-edge'}
                    markerEnd="url(#dep-arrow)"
                  />
                )
              })}
            </svg>
            <div
              className="dependency-view-nodes"
              style={{ width: bounds.width, height: bounds.height, minWidth: bounds.width, minHeight: bounds.height }}
            >
              {tasks.map((task) => {
                const pos = taskPos.get(task.id)
                if (!pos) return null
                const dimmed = focusedSubgraphIds && !focusedSubgraphIds.has(task.id)
                const isFocusSeed = focusedTaskId === task.id
                return (
                  <div
                    key={task.id}
                    className={`dependency-view-node ${dimmed ? 'dependency-view-node--dimmed' : ''} ${isFocusSeed ? 'dependency-view-node--focus-seed' : ''}`}
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: NODE_WIDTH,
                      height: NODE_HEIGHT,
                    }}
                    title={`${task.title}${task.startDate ? ` · ${format(parseISO(task.startDate), 'MMM d')}` : ''} · ${task.duration}d`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenTask?.(task.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onOpenTask?.(task.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setFocusedTaskId(task.id)
                    }}
                  >
                    <div className="dependency-view-node-title">{task.title}</div>
                    <div className="dependency-view-node-meta">
                      {task.startDate ? format(parseISO(task.startDate), 'MMM d') : 'No date'} · {task.duration}d
                      {task.dependencyIds.length > 0 && (
                        <span className="dependency-view-node-deps"> · ← {task.dependencyIds.length}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="dependency-view-legend">
              Prerequisite → Dependent
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
