import {
  PointerEvent as ReactPointerEvent,
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Point, Stroke, StrokeTool, redrawCanvas } from '../lib/strokes'

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

const STORAGE_KEY = 'aspro:whiteboard:v1'

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
  const toolOverlayRef = useRef<HTMLDivElement>(null)
  const activeStrokeRef = useRef<Stroke | null>(null)
  const renderFrameRef = useRef<number | null>(null)
  const previousPointerRef = useRef<Point | null>(null)
  const markerPoseRef = useRef({ x: 0, y: 0, angle: -38 })

  const [strokes, setStrokes] = useState<Stroke[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? (JSON.parse(saved) as Stroke[]) : []
    } catch {
      return []
    }
  })
  const [undoStack, setUndoStack] = useState<Stroke[][]>([])
  const [redoStack, setRedoStack] = useState<Stroke[][]>([])
  const [activeTool, setActiveTool] = useState<StrokeTool | null>(null)
  const [activeMarkerId, setActiveMarkerId] = useState('black')
  const [pointerInside, setPointerInside] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)

  const activeMarker = useMemo(
    () => MARKERS.find((marker) => marker.id === activeMarkerId) ?? MARKERS[0],
    [activeMarkerId],
  )

  const render = useCallback(
    (nextStrokes = strokes, inProgress = activeStrokeRef.current) => {
      if (!canvasRef.current) return
      redrawCanvas(canvasRef.current, nextStrokes, inProgress)
    },
    [strokes],
  )

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(strokes))
    } catch {
      // The board still works if browser storage is unavailable.
    }
    render(strokes, null)
  }, [render, strokes])

  useEffect(() => {
    const surface = surfaceRef.current
    const canvas = canvasRef.current
    if (!surface || !canvas) return

    const resize = () => {
      const rect = surface.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      render(strokes, activeStrokeRef.current)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [render, strokes])

  useEffect(() => {
    return () => {
      if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current)
    }
  }, [])

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pressure: event.pointerType === 'mouse' ? 0.5 : event.pressure || 0.5,
    }
  }

  const updateLighting = (clientX: number, clientY: number) => {
    const board = boardRef.current
    if (!board) return
    const rect = board.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    board.style.setProperty('--light-x', `${x}%`)
    board.style.setProperty('--light-y', `${y}%`)
    board.style.setProperty('--light-shift', `${(x - 50) * 0.08}px`)
  }

  const updateToolOverlay = (point: Point) => {
    const overlay = toolOverlayRef.current
    if (!overlay) return

    const previous = previousPointerRef.current
    const dx = previous ? point.x - previous.x : 0
    const dy = previous ? point.y - previous.y : 0
    const speed = Math.hypot(dx, dy)

    let targetAngle = markerPoseRef.current.angle
    if (activeTool === 'marker' && speed > 0.35) {
      const direction = Math.atan2(dy, dx) * (180 / Math.PI)
      targetAngle = Math.max(-62, Math.min(-20, direction - 42))
    } else if (activeTool === 'eraser' && speed > 0.35) {
      targetAngle = Math.max(-12, Math.min(12, dx * 0.7))
    }

    const pose = markerPoseRef.current
    if (!previous) {
      pose.x = point.x
      pose.y = point.y
    } else {
      pose.x += (point.x - pose.x) * 0.72
      pose.y += (point.y - pose.y) * 0.72
    }
    pose.angle += (targetAngle - pose.angle) * 0.18

    overlay.style.setProperty('--tool-x', `${pose.x}px`)
    overlay.style.setProperty('--tool-y', `${pose.y}px`)
    overlay.style.setProperty('--tool-angle', `${pose.angle}deg`)
    overlay.style.setProperty('--tool-press', isDrawing ? '1' : '0')
    previousPointerRef.current = point
  }

  const scheduleOverlayUpdate = (point: Point) => {
    if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current)
    renderFrameRef.current = requestAnimationFrame(() => updateToolOverlay(point))
  }

  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    if (!activeTool) return

    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)

    const stroke: Stroke = {
      id: uid(),
      tool: activeTool,
      color: activeMarker.ink,
      width: activeTool === 'eraser' ? 34 : 5.6,
      points: [point],
    }

    activeStrokeRef.current = stroke
    setIsDrawing(true)
    render(strokes, stroke)
    scheduleOverlayUpdate(point)
  }

  const moveStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    updateLighting(event.clientX, event.clientY)
    scheduleOverlayUpdate(point)

    if (!activeStrokeRef.current || !isDrawing) return

    const nativeEvent = event.nativeEvent as PointerEvent
    const coalesced = typeof nativeEvent.getCoalescedEvents === 'function'
      ? nativeEvent.getCoalescedEvents()
      : []

    if (coalesced.length > 1) {
      const rect = event.currentTarget.getBoundingClientRect()
      coalesced.forEach((sample: PointerEvent) => {
        activeStrokeRef.current?.points.push({
          x: sample.clientX - rect.left,
          y: sample.clientY - rect.top,
          pressure: sample.pointerType === 'mouse' ? 0.5 : sample.pressure || 0.5,
        })
      })
    } else {
      activeStrokeRef.current.points.push(point)
    }

    render(strokes, activeStrokeRef.current)
  }

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = activeStrokeRef.current
    if (!current) return

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Capture can already be released by the browser on cancellation.
    }

    setUndoStack((history) => [...history.slice(-39), strokes])
    setRedoStack([])
    setStrokes((existing) => [...existing, current])
    activeStrokeRef.current = null
    setIsDrawing(false)
  }

  const selectMarker = (id: string) => {
    if (activeTool === 'marker' && activeMarkerId === id) {
      setActiveTool(null)
      return
    }
    setActiveMarkerId(id)
    setActiveTool('marker')
  }

  const selectEraser = () => {
    setActiveTool((tool) => (tool === 'eraser' ? null : 'eraser'))
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
    const source = canvasRef.current
    if (!source) return
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = source.width
    exportCanvas.height = source.height
    const ctx = exportCanvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#f7f8f6'
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
    ctx.drawImage(source, 0, 0)

    const link = document.createElement('a')
    link.download = 'aspro-board.png'
    link.href = exportCanvas.toDataURL('image/png')
    link.click()
  }

  return (
    <section className="whiteboard-stage" aria-label="Aspro whiteboard">
      <div
        className="whiteboard"
        ref={boardRef}
        onPointerMove={(event) => updateLighting(event.clientX, event.clientY)}
      >
        <div className="frame-reflection" aria-hidden="true" />
        <div className="board-frame">
          <div
            className={`board-surface${activeTool ? ' has-active-tool' : ''}`}
            ref={surfaceRef}
            onPointerEnter={() => setPointerInside(true)}
            onPointerLeave={() => {
              setPointerInside(false)
              previousPointerRef.current = null
            }}
          >
            <div className="surface-gloss" aria-hidden="true" />
            <canvas
              ref={canvasRef}
              className="drawing-canvas"
              aria-label="Drawing surface"
              onPointerDown={beginStroke}
              onPointerMove={moveStroke}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
            />

            <div
              ref={toolOverlayRef}
              className={`active-tool-overlay${pointerInside && activeTool ? ' is-visible' : ''}${isDrawing ? ' is-drawing' : ''}`}
              aria-hidden="true"
            >
              {activeTool === 'marker' && <MarkerBody marker={activeMarker} active />}
              {activeTool === 'eraser' && <EraserObject active />}
            </div>

            <span className="board-mark" aria-hidden="true">ASPRO</span>
          </div>

          <div className="marker-tray" aria-label="Whiteboard tools">
            <div className="tray-inner">
              <div className="marker-rack" role="group" aria-label="Markers">
                {MARKERS.map((marker) => {
                  const selected = activeTool === 'marker' && activeMarkerId === marker.id
                  return (
                    <button
                      type="button"
                      className={`marker-slot${selected ? ' is-selected' : ''}`}
                      key={marker.id}
                      onClick={() => selectMarker(marker.id)}
                      aria-label={`${marker.label} marker${selected ? ', selected' : ''}`}
                      aria-pressed={selected}
                    >
                      <MarkerBody marker={marker} />
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                className={`eraser-slot${activeTool === 'eraser' ? ' is-selected' : ''}`}
                onClick={selectEraser}
                aria-label={`Eraser${activeTool === 'eraser' ? ', selected' : ''}`}
                aria-pressed={activeTool === 'eraser'}
              >
                <EraserObject />
              </button>
            </div>
          </div>
        </div>
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
