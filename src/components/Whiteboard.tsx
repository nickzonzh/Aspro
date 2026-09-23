import {
  PointerEvent as ReactPointerEvent,
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Point, Stroke, BOARD_WIDTH, ERASER_WIDTH, ERASER_HEIGHT, boardPoint, createBoardRenderer } from '../lib/strokes'

import { createToolMotion } from '../lib/toolMotion'

type Marker = {
  id: string
  label: string
  color: string
  ink: string
}

const MARKERS: Marker[] = [
  { id: 'black', label: 'Black', color: '#1e2224', ink: '#1b2022' },
  { id: 'blue', label: 'Blue', color: '#1f5f9c', ink: '#1768ad' },
  { id: 'red', label: 'Red', color: '#b63c36', ink: '#c33d36' },
  { id: 'green', label: 'Green', color: '#357258', ink: '#2f7a58' },
]

const STORAGE_KEY = 'aspro:whiteboard:v2'

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

function MarkerBody({ marker, active = false }: { marker: Marker; active?: boolean }) {
  return (
    <span className={`marker-object${active ? ' marker-object--active' : ''}`} aria-hidden="true">
      <span className="marker-nib" style={{ '--marker': marker.color } as CSSProperties} />
      <span className="marker-neck" />
      <span className="marker-barrel">
        <span className="marker-brand">ASPRO</span>
        <span className="marker-band" style={{ '--marker': marker.color } as CSSProperties} />
      </span>
      <span className="marker-cap" style={{ '--marker': marker.color } as CSSProperties} />
    </span>
  )
}

function EraserObject({ active = false }: { active?: boolean }) {
  return (
    <span className={`eraser-object${active ? ' eraser-object--active' : ''}`} aria-hidden="true">
      <span className="eraser-felt" />
      <span className="eraser-shell">ASPRO</span>
    </span>
  )
}

export function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<ReturnType<typeof createBoardRenderer> | null>(null)
  const motionRef = useRef<ReturnType<typeof createToolMotion> | null>(null)
  const activeStrokeRef = useRef<Stroke | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const renderFrameRef = useRef<number | null>(null)
  const previousPointerRef = useRef<{ x: number; y: number } | null>(null)
  const angleRef = useRef(-38)
  const pendingToolRef = useRef<Parameters<ReturnType<typeof createToolMotion>['move']> | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return JSON.parse(saved).strokes
      // v1 used display pixels and did not record its original dimensions.
      // Keep its source intact; interpret it on the original desktop-sized board.
      const legacy = localStorage.getItem('aspro:whiteboard:v1')
      return legacy ? JSON.parse(legacy) : []
    } catch { return [] }
  })
  const strokesRef = useRef(strokes)
  const [undoStack, setUndoStack] = useState<Stroke[][]>([])
  const [redoStack, setRedoStack] = useState<Stroke[][]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeIdRef = useRef<string | null>(null)

  const render = useCallback(() => {
    rendererRef.current?.render(strokesRef.current, activeStrokeRef.current)
    // Commit nib position and fresh ink in the same frame, including coalesced input.
    if (pendingToolRef.current) {
      motionRef.current?.move(...pendingToolRef.current)
      pendingToolRef.current = null
    }
  }, [])
  const scheduleRender = () => {
    if (renderFrameRef.current !== null) return
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = null
      render()
    })
  }
  useEffect(() => {
    strokesRef.current = strokes
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, strokes })) } catch { /* Optional storage. */ }
    render()
  }, [strokes, render])

  useEffect(() => {
    const canvas = canvasRef.current!, surface = surfaceRef.current!, board = boardRef.current!
    const renderer = createBoardRenderer(canvas)
    const motion = createToolMotion(board)
    rendererRef.current = renderer
    motionRef.current = motion
    const resize = () => {
      const rect = surface.getBoundingClientRect()
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1)
      motion.dockAll(false)
      motion.fitTray()
      previousPointerRef.current = null
      render()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(surface)
    window.addEventListener('resize', resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      motion.destroy()
      if (renderFrameRef.current !== null) cancelAnimationFrame(renderFrameRef.current)
    }
  }, [render])

  const updateLighting = (clientX: number, clientY: number) => {
    const board = boardRef.current!
    const rect = board.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    board.style.setProperty('--light-x', `${x}%`)
    board.style.setProperty('--light-y', `${y}%`)
    board.style.setProperty('--light-shift', `${(x - 50) * 0.08}px`)
  }
  const toolScale = () => Math.max(.65, Math.min(1, surfaceRef.current!.getBoundingClientRect().width / BOARD_WIDTH))
  const updateTool = (clientX: number, clientY: number, drawing: boolean, pickup = true) => {
    const id = activeIdRef.current
    if (!id) return
    const previous = previousPointerRef.current
    const dx = previous ? clientX - previous.x : 0, dy = previous ? clientY - previous.y : 0
    const distance = Math.hypot(dx, dy)
    if (distance > .35) {
      const target = id === 'eraser'
        ? (dx / distance) * 9 + (dy / distance) * 3
        : Math.max(-62, Math.min(-20, Math.atan2(dy, dx) * 180 / Math.PI - 42))
      // Eraser lean follows travel distance, so sparse and coalesced input agree.
      angleRef.current += (target - angleRef.current) * (id === 'eraser' ? 1 - Math.exp(-distance / 22) : .18)
    }
    previousPointerRef.current = { x: clientX, y: clientY }
    const movement: NonNullable<typeof pendingToolRef.current> = [id, {
      x: clientX, y: clientY, angle: angleRef.current,
      scale: (id === 'eraser' ? .86 : drawing ? .86 : .88) * toolScale(),
    }, drawing, pickup]
    if (drawing) pendingToolRef.current = movement
    else {
      pendingToolRef.current = null
      motionRef.current?.move(...movement)
    }
  }
  const sample = (event: { clientX: number; clientY: number; pointerType: string; pressure: number }): Point => {
    const rect = surfaceRef.current!.getBoundingClientRect()
    updateTool(event.clientX, event.clientY, true)
    return {
      ...boardPoint(event.clientX - rect.left, event.clientY - rect.top, rect.width),
      pressure: event.pointerType === 'mouse' ? .5 : event.pressure || .5,
      angle: angleRef.current,
    }
  }
  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || event.button !== 0 || !activeIdRef.current || activeStrokeRef.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointerIdRef.current = event.pointerId
    const point = sample(event)
    const id = activeIdRef.current
    const eraser = id === 'eraser'
    const marker = MARKERS.find((item) => item.id === id) ?? MARKERS[0]
    const displayScale = surfaceRef.current!.getBoundingClientRect().width / BOARD_WIDTH
    const size = toolScale() / displayScale
    activeStrokeRef.current = {
      id: uid(), tool: eraser ? 'eraser' : 'marker', color: marker.ink,
      width: eraser ? ERASER_WIDTH * .86 * size : 5.6 * size,
      ...(eraser ? { height: ERASER_HEIGHT * .86 * size } : {}),
      points: [point],
    }
    render()
  }
  const moveStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activeStrokeRef.current && event.pointerId === pointerIdRef.current) {
      const samples = event.nativeEvent.getCoalescedEvents?.() ?? []
      for (const input of samples.length ? samples : [event.nativeEvent]) {
        activeStrokeRef.current.points.push(sample(input))
      }
      scheduleRender()
    } else if (!activeStrokeRef.current && event.isPrimary) {
      updateTool(event.clientX, event.clientY, false)
    }
  }
  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerId !== pointerIdRef.current || !activeStrokeRef.current) return
    const current = activeStrokeRef.current
    const cancelled = event.type !== 'pointerup'
    if (!cancelled) {
      const point = sample(event)
      const last = current.points.at(-1)!
      if (last.x !== point.x || last.y !== point.y) current.points.push(point)
      const previous = strokesRef.current
      setUndoStack((history) => [...history.slice(-39), previous])
      setRedoStack([])
      strokesRef.current = [...previous, current]
      setStrokes(strokesRef.current)
    }
    activeStrokeRef.current = null
    pointerIdRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    updateTool(event.clientX, event.clientY, false)
    const board = boardRef.current!.getBoundingClientRect()
    const outside = event.clientX < board.left || event.clientX > board.right || event.clientY < board.top || event.clientY > board.bottom
    if (event.pointerType === 'touch' || cancelled || outside) motionRef.current?.dockAll()
    render()
  }
  const selectTool = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    const old = activeIdRef.current
    if (old) motionRef.current?.dock(old, event.detail !== 0)
    const next = old === id ? null : id
    activeIdRef.current = next
    setActiveId(next)
    previousPointerRef.current = null
    angleRef.current = next === 'eraser' ? 0 : -38
    if (next && event.detail !== 0) updateTool(event.clientX, event.clientY, false)
  }
  const undo = () => {
    const previous = undoStack.at(-1)
    if (!previous) return
    setRedoStack((history) => [strokes, ...history].slice(0, 40))
    setUndoStack((history) => history.slice(0, -1))
    setStrokes(previous)
  }
  const redo = () => {
    const next = redoStack[0]
    if (!next) return
    setUndoStack((history) => [...history.slice(-39), strokes])
    setRedoStack((history) => history.slice(1))
    setStrokes(next)
  }
  const clear = () => {
    if (!strokes.length) return
    setUndoStack((history) => [...history.slice(-39), strokes])
    setRedoStack([])
    setStrokes([])
  }
  const saveImage = () => {
    const source = canvasRef.current!
    const exported = document.createElement('canvas')
    exported.width = source.width
    exported.height = source.height
    const ctx = exported.getContext('2d')!
    ctx.fillStyle = '#f7f8f6'
    ctx.fillRect(0, 0, exported.width, exported.height)
    ctx.drawImage(source, 0, 0)
    const link = document.createElement('a')
    link.download = 'aspro-board.png'
    link.href = exported.toDataURL('image/png')
    link.click()
  }

  return (
    <section className="whiteboard-stage" aria-label="Aspro whiteboard">
      <div className="whiteboard" ref={boardRef}
        onPointerMove={(event) => {
          if (!event.isPrimary) return
          updateLighting(event.clientX, event.clientY)
          if (event.target !== canvasRef.current && !activeStrokeRef.current) updateTool(event.clientX, event.clientY, false)
        }}
        onPointerLeave={() => {
          if (!activeStrokeRef.current) motionRef.current?.dockAll()
          previousPointerRef.current = null
        }}>
        <div className="frame-reflection" aria-hidden="true" />
        <div className="board-frame">
          <div className={`board-surface${activeId ? ' has-active-tool' : ''}`} ref={surfaceRef}>
            <div className="surface-gloss" aria-hidden="true" />
            <canvas ref={canvasRef} className="drawing-canvas" aria-label="Drawing surface"
              onPointerDown={beginStroke} onPointerMove={moveStroke} onPointerUp={finishStroke}
              onPointerCancel={finishStroke} onLostPointerCapture={finishStroke} />
            <span className="board-mark" aria-hidden="true">ASPRO</span>
          </div>
          <div className="marker-tray" aria-label="Whiteboard tools">
            <div className="tray-inner">
              <div className="marker-rack" role="group" aria-label="Markers">
                {MARKERS.map((marker) => (
                  <button type="button" className="marker-slot" key={marker.id} data-tool-slot={marker.id}
                    onClick={(event) => selectTool(marker.id, event)}
                    aria-label={`${marker.label} marker`} aria-pressed={activeId === marker.id}>
                    <MarkerBody marker={marker} />
                  </button>
                ))}
              </div>
              <button type="button" className="eraser-slot" data-tool-slot="eraser"
                onClick={(event) => selectTool('eraser', event)} aria-label="Eraser" aria-pressed={activeId === 'eraser'}>
                <EraserObject />
              </button>
            </div>
          </div>
        </div>
        {MARKERS.map((marker) => (
          <div className="tool-flight" data-tool-flight={marker.id} aria-hidden="true" key={marker.id}>
            <MarkerBody marker={marker} active />
          </div>
        ))}
        <div className="tool-flight" data-tool-flight="eraser" aria-hidden="true"><EraserObject active /></div>
      </div>
      <div className="utility-bar" aria-label="Board actions">
        <button type="button" onClick={undo} disabled={!undoStack.length}>Undo</button>
        <button type="button" onClick={redo} disabled={!redoStack.length}>Redo</button>
        <span className="utility-divider" aria-hidden="true" />
        <button type="button" onClick={clear} disabled={!strokes.length}>Clear</button>
        <button type="button" onClick={saveImage}>Save PNG</button>
      </div>
      <p className="board-hint">Pick a marker from the tray, then draw directly on the board.</p>
    </section>
  )
}
