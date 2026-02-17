import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react'
import type { Task } from './types'
import './CanvasView.css'

interface CanvasViewProps {
  tasks: Task[]
  onUpdateTask: (id: string, updates: Partial<Pick<Task, 'canvasX' | 'canvasY' | 'canvasColor'>>) => Promise<void>
  onSelectTask: (id: string | null) => void
  selectedTaskId: string | null
}

const STICKER_W = 156
const STICKER_H = 108
const CANVAS_PADDING = 32
const GRID_COLS = 6
const GRID_GAP_X = 20
const GRID_GAP_Y = 16

const PALETTE = [
  { bg: '#FFF9C4', border: '#F9A825' },
  { bg: '#E1F5FE', border: '#03A9F4' },
  { bg: '#F3E5F5', border: '#9C27B0' },
  { bg: '#E8F5E9', border: '#4CAF50' },
  { bg: '#FFE0B2', border: '#FF9800' },
  { bg: '#FFCDD2', border: '#F44336' },
  { bg: '#D1C4E9', border: '#673AB7' },
  { bg: '#B2DFDB', border: '#009688' },
  { bg: '#FFCCBC', border: '#FF5722' },
  { bg: '#F8BBD0', border: '#E91E63' },
  { bg: '#C5E1A5', border: '#8BC34A' },
  { bg: '#B3E5FC', border: '#0288D1' },
]

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lr = Math.round(r + (255 - r) * amount)
  const lg = Math.round(g + (255 - g) * amount)
  const lb = Math.round(b + (255 - b) * amount)
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

/** Find palette entry by bg color, or derive a border from a bg hex */
function paletteFromBg(bg: string): { bg: string; border: string } {
  const match = PALETTE.find((p) => p.bg.toLowerCase() === bg.toLowerCase())
  if (match) return match
  // Derive a border by darkening the bg
  const r = parseInt(bg.slice(1, 3), 16)
  const g = parseInt(bg.slice(3, 5), 16)
  const b = parseInt(bg.slice(5, 7), 16)
  const dr = Math.round(r * 0.6)
  const dg = Math.round(g * 0.6)
  const db = Math.round(b * 0.6)
  return { bg, border: `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}` }
}

function buildColorMap(tasks: Task[]): Map<string, { bg: string; border: string }> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]))
  const colorMap = new Map<string, { bg: string; border: string }>()

  function findRoot(id: string): string {
    const t = taskMap.get(id)
    if (!t || !t.parentId) return id
    return findRoot(t.parentId)
  }

  // Resolve the effective color for a root/parent task:
  // 1. If the task itself has canvasColor, use it
  // 2. If a child task has canvasColor and its root doesn't, the child's color is used only for itself (unusual)
  // 3. Otherwise fall back to auto-palette
  const rootColorIndex = new Map<string, number>()
  let idx = 0
  for (const task of tasks) {
    if (!task.parentId && !rootColorIndex.has(task.id)) {
      rootColorIndex.set(task.id, idx++)
    }
  }

  function getBaseColor(rootId: string): { bg: string; border: string } {
    const rootTask = taskMap.get(rootId)
    if (rootTask?.canvasColor) return paletteFromBg(rootTask.canvasColor)
    const colorIdx = (rootColorIndex.get(rootId) ?? 0) % PALETTE.length
    return PALETTE[colorIdx]
  }

  for (const task of tasks) {
    // If this specific task has a manual color, use it directly
    if (task.canvasColor && !task.parentId) {
      colorMap.set(task.id, paletteFromBg(task.canvasColor))
      continue
    }

    const rootId = findRoot(task.id)
    const base = getBaseColor(rootId)

    if (task.parentId) {
      // Child: lighter background, softer border
      colorMap.set(task.id, {
        bg: lighten(base.bg, 0.45),
        border: lighten(base.border, 0.35),
      })
    } else {
      colorMap.set(task.id, base)
    }
  }

  return colorMap
}

function autoPosition(index: number): { x: number; y: number } {
  const col = index % GRID_COLS
  const row = Math.floor(index / GRID_COLS)
  return {
    x: CANVAS_PADDING + col * (STICKER_W + GRID_GAP_X),
    y: CANVAS_PADDING + row * (STICKER_H + GRID_GAP_Y),
  }
}

function getTaskStatus(task: Task): string | null {
  if (!task.startDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(task.startDate)
  const end = new Date(task.startDate)
  end.setDate(end.getDate() + task.duration)
  if (end <= today) return 'done'
  if (start <= today && end > today) return 'active'
  return 'planned'
}

const MAX_FONT = 14
const MIN_FONT = 7.5

function FitTitle({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = useState(() => {
    const len = text.length
    if (len <= 18) return 14
    if (len <= 30) return 12.5
    if (len <= 50) return 11
    if (len <= 70) return 9.5
    return 8.5
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    let size = MAX_FONT
    el.style.fontSize = `${size}px`

    // Use actual available height from flex layout instead of a hardcoded value
    const maxH = el.clientHeight
    if (maxH <= 0) return

    while (el.scrollHeight > maxH && size > MIN_FONT) {
      size -= 0.5
      el.style.fontSize = `${size}px`
    }
    setFontSize(size)
  }, [text])

  return (
    <div ref={ref} className="sticker-title" style={{ fontSize }}>
      {text}
    </div>
  )
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

/** Resolve current canvas-space position for a task */
function taskPos(task: Task, index: number): { x: number; y: number } {
  return {
    x: task.canvasX ?? autoPosition(index).x,
    y: task.canvasY ?? autoPosition(index).y,
  }
}

export function CanvasView({ tasks, onUpdateTask, onSelectTask, selectedTaskId }: CanvasViewProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // ── Space + drag panning ──
  const [spaceHeld, setSpaceHeld] = useState(false)
  const spaceRef = useRef(false)
  const [panning, setPanning] = useState<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        spaceRef.current = true
        setSpaceHeld(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false
        setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // ── Color picker context menu ──
  const [colorPicker, setColorPicker] = useState<{
    taskId: string
    x: number; y: number
  } | null>(null)

  // ── Multi-selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── Marquee (rubber-band) selection ──
  const [marquee, setMarquee] = useState<{
    startX: number; startY: number
    currentX: number; currentY: number
  } | null>(null)

  // ── Sticker drag (single or group) ──
  const [dragState, setDragState] = useState<{
    startMouseX: number; startMouseY: number
    draggedId: string
    origPositions: Map<string, { x: number; y: number }>
  } | null>(null)
  const [dragDelta, setDragDelta] = useState({ dx: 0, dy: 0 })

  // ── Helpers ──
  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: (clientX - rect.left + el.scrollLeft) / zoomRef.current,
      y: (clientY - rect.top + el.scrollTop) / zoomRef.current,
    }
  }, [])

  // ── Ctrl + wheel to zoom ──
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((prev + delta) * 100) / 100)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Sticker pointer down ──
  const handleStickerPointerDown = useCallback(
    (e: React.PointerEvent, task: Task, x: number, y: number) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

      if (spaceRef.current) {
        const el = canvasRef.current!
        setPanning({ startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop })
        return
      }

      const origPositions = new Map<string, { x: number; y: number }>()

      if (selectedIds.has(task.id) && selectedIds.size > 1) {
        // Group drag: track all selected stickers
        for (const id of selectedIds) {
          const idx = tasks.findIndex((t) => t.id === id)
          if (idx !== -1) origPositions.set(id, taskPos(tasks[idx], idx))
        }
      } else {
        // Single drag
        origPositions.set(task.id, { x, y })
      }

      setDragState({ startMouseX: e.clientX, startMouseY: e.clientY, draggedId: task.id, origPositions })
      setDragDelta({ dx: 0, dy: 0 })
    },
    [selectedIds, tasks]
  )

  // ── Right-click → color picker ──
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, task: Task) => {
      e.preventDefault()
      e.stopPropagation()
      setColorPicker({ taskId: task.id, x: e.clientX, y: e.clientY })
    },
    []
  )

  const handlePickColor = useCallback(
    (bg: string) => {
      if (!colorPicker) return
      const task = tasks.find((t) => t.id === colorPicker.taskId)
      if (!task) { setColorPicker(null); return }

      // If this is a child task, set color on its root ancestor instead
      const taskMap = new Map(tasks.map((t) => [t.id, t]))
      let targetId = colorPicker.taskId
      let t = task
      while (t.parentId) {
        targetId = t.parentId
        const parent = taskMap.get(t.parentId)
        if (!parent) break
        t = parent
      }
      onUpdateTask(targetId, { canvasColor: bg })
      setColorPicker(null)
    },
    [colorPicker, tasks, onUpdateTask]
  )

  const handleClearColor = useCallback(() => {
    if (!colorPicker) return
    const task = tasks.find((t) => t.id === colorPicker.taskId)
    if (!task) { setColorPicker(null); return }

    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    let targetId = colorPicker.taskId
    let t = task
    while (t.parentId) {
      targetId = t.parentId
      const parent = taskMap.get(t.parentId)
      if (!parent) break
      t = parent
    }
    onUpdateTask(targetId, { canvasColor: null })
    setColorPicker(null)
  }, [colorPicker, tasks, onUpdateTask])

  // Close color picker on any click outside
  const pickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!colorPicker) return
    const close = (e: PointerEvent) => {
      if (pickerRef.current && pickerRef.current.contains(e.target as Node)) return
      setColorPicker(null)
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [colorPicker])

  // ── Canvas pointer down → start panning or marquee ──
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement
      if (target !== canvasRef.current && !target.classList.contains('canvas-inner')) return
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

      if (spaceRef.current) {
        const el = canvasRef.current!
        setPanning({ startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop })
        return
      }

      const pos = clientToCanvas(e.clientX, e.clientY)
      setMarquee({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y })
      setSelectedIds(new Set())
      onSelectTask(null)
    },
    [clientToCanvas, onSelectTask]
  )

  // ── Pointer move (panning, drag, or marquee) ──
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (panning) {
        const el = canvasRef.current!
        el.scrollLeft = panning.scrollX - (e.clientX - panning.startX)
        el.scrollTop = panning.scrollY - (e.clientY - panning.startY)
        return
      }
      if (dragState) {
        const z = zoomRef.current
        const dx = (e.clientX - dragState.startMouseX) / z
        const dy = (e.clientY - dragState.startMouseY) / z
        setDragDelta({ dx, dy })
      } else if (marquee) {
        const pos = clientToCanvas(e.clientX, e.clientY)
        setMarquee((prev) => prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null)
      }
    },
    [panning, dragState, marquee, clientToCanvas]
  )

  // ── Pointer up ──
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // ── Finish panning ──
      if (panning) {
        setPanning(null)
        return
      }

      // ── Finish sticker drag ──
      if (dragState) {
        const z = zoomRef.current
        const absDx = Math.abs(e.clientX - dragState.startMouseX) / z
        const absDy = Math.abs(e.clientY - dragState.startMouseY) / z
        const wasDrag = absDx > 3 || absDy > 3

        if (wasDrag) {
          Promise.all(
            Array.from(dragState.origPositions.entries()).map(([id, orig]) =>
              onUpdateTask(id, {
                canvasX: Math.round(Math.max(0, orig.x + dragDelta.dx)),
                canvasY: Math.round(Math.max(0, orig.y + dragDelta.dy)),
              })
            )
          )
        } else {
          // Click (not drag) → select sticker
          const id = dragState.draggedId
          if (e.ctrlKey || e.metaKey) {
            setSelectedIds((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id); else next.add(id)
              return next
            })
          } else {
            setSelectedIds(new Set([id]))
          }
        }
        setDragState(null)
        setDragDelta({ dx: 0, dy: 0 })
        return
      }

      // ── Finish marquee ──
      if (marquee) {
        const left = Math.min(marquee.startX, marquee.currentX)
        const right = Math.max(marquee.startX, marquee.currentX)
        const top = Math.min(marquee.startY, marquee.currentY)
        const bottom = Math.max(marquee.startY, marquee.currentY)

        if (right - left > 5 || bottom - top > 5) {
          const hits = new Set<string>()
          tasks.forEach((task, i) => {
            const p = taskPos(task, i)
            if (
              p.x + STICKER_W > left && p.x < right &&
              p.y + STICKER_H > top && p.y < bottom
            ) {
              hits.add(task.id)
            }
          })
          setSelectedIds(hits)
        }
        setMarquee(null)
      }
    },
    [panning, dragState, dragDelta, marquee, tasks, onUpdateTask]
  )

  // ── Auto-position unplaced tasks ──
  const didAutoPosition = useRef(false)
  useEffect(() => {
    if (didAutoPosition.current) return
    const unpositioned = tasks.filter((t) => t.canvasX === null || t.canvasY === null)
    if (unpositioned.length === 0) return
    didAutoPosition.current = true

    const positioned = tasks.filter((t) => t.canvasX !== null && t.canvasY !== null)
    let nextIndex = positioned.length

    Promise.all(
      unpositioned.map((task) => {
        const pos = autoPosition(nextIndex++)
        return onUpdateTask(task.id, { canvasX: pos.x, canvasY: pos.y })
      })
    )
  }, [tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  const colorMap = buildColorMap(tasks)

  // ── Marquee rect (canvas-space) ──
  const marqueeRect = marquee ? {
    left: Math.min(marquee.startX, marquee.currentX),
    top: Math.min(marquee.startY, marquee.currentY),
    width: Math.abs(marquee.currentX - marquee.startX),
    height: Math.abs(marquee.currentY - marquee.startY),
  } : null

  return (
    <div
      ref={canvasRef}
      className={`canvas-view${spaceHeld ? ' canvas-panning' : ''}${panning ? ' canvas-panning-active' : ''}`}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="canvas-inner"
        style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
      >
        {tasks.map((task, i) => {
          const isBeingDragged = dragState?.origPositions.has(task.id)
          const orig = isBeingDragged ? dragState!.origPositions.get(task.id)! : taskPos(task, i)
          const x = isBeingDragged ? Math.max(0, orig.x + dragDelta.dx) : orig.x
          const y = isBeingDragged ? Math.max(0, orig.y + dragDelta.dy) : orig.y
          const color = colorMap.get(task.id) ?? PALETTE[0]
          const status = getTaskStatus(task)
          const isSelected = selectedIds.has(task.id) || selectedTaskId === task.id
          const hasChildren = tasks.some((t) => t.parentId === task.id)

          return (
            <div
              key={task.id}
              className={`canvas-sticker${isBeingDragged ? ' dragging' : ''}${isSelected ? ' selected' : ''}`}
              style={{
                left: x,
                top: y,
                backgroundColor: color.bg,
                borderColor: color.border,
                zIndex: isBeingDragged ? 1000 : isSelected ? 100 : 1,
              }}
              onPointerDown={(e) => handleStickerPointerDown(e, task, orig.x, orig.y)}
              onDoubleClick={() => onSelectTask(task.id)}
              onContextMenu={(e) => handleContextMenu(e, task)}
            >
              <FitTitle text={task.title} />
              <div className="sticker-meta">
                {status && (
                  <span className={`sticker-status sticker-status--${status}`}>
                    {status === 'done' ? 'Done' : status === 'active' ? 'In Progress' : 'Planned'}
                  </span>
                )}
                {hasChildren && (
                  <span className="sticker-children-badge">
                    {tasks.filter((t) => t.parentId === task.id).length} sub
                  </span>
                )}
                {task.tags.length > 0 && (
                  <span className="sticker-tag">{task.tags[0]}</span>
                )}
              </div>
            </div>
          )
        })}

        {/* Marquee selection rectangle */}
        {marqueeRect && (
          <div className="canvas-marquee" style={marqueeRect} />
        )}
      </div>

      {/* Zoom badge */}
      {zoom !== 1 && (
        <div className="canvas-zoom-badge">
          {Math.round(zoom * 100)}%
          <button className="canvas-zoom-reset" onClick={() => setZoom(1)}>Reset</button>
        </div>
      )}

      {/* Selection count badge */}
      {selectedIds.size > 1 && (
        <div className="canvas-selection-badge">
          {selectedIds.size} selected
        </div>
      )}

      {/* Color picker context menu */}
      {colorPicker && (
        <div
          ref={pickerRef}
          className="canvas-color-picker"
          style={{ left: colorPicker.x, top: colorPicker.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="color-picker-label">Sticker color</div>
          <div className="color-picker-swatches">
            {PALETTE.map((p) => (
              <button
                key={p.bg}
                className="color-swatch"
                style={{ backgroundColor: p.bg, borderColor: p.border }}
                onClick={() => handlePickColor(p.bg)}
              />
            ))}
          </div>
          <button className="color-picker-clear" onClick={handleClearColor}>
            Reset to auto
          </button>
        </div>
      )}
    </div>
  )
}
