export type Point = { x: number; y: number; pressure: number; angle?: number }
export type StrokeTool = 'marker' | 'eraser'
export type Stroke = {
  id: string
  tool: StrokeTool
  color: string
  width: number
  // Absent on legacy circular eraser strokes.
  height?: number
  points: Point[]
}

export const BOARD_WIDTH = 1140
export const BOARD_HEIGHT = 707
export const DEFAULT_PRESSURE = 0.5
export const ERASER_WIDTH = 84
export const ERASER_HEIGHT = 34

export function boardPoint(x: number, y: number, displayWidth: number): Point {
  const scale = BOARD_WIDTH / displayWidth
  return { x: x * scale, y: y * scale, pressure: DEFAULT_PRESSURE }
}

export const effectiveWidth = (stroke: Stroke, pressure: number) =>
  stroke.tool === 'eraser' ? stroke.width : stroke.width * (0.86 + (pressure || DEFAULT_PRESSURE) * 0.28)

export function eraserCorners(point: Point, width: number, height: number) {
  const radians = (point.angle ?? 0) * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
    x: point.x + x * width / 2 * cos - y * height / 2 * sin,
    y: point.y + x * width / 2 * sin + y * height / 2 * cos,
  }))
}

function stampEraser(ctx: CanvasRenderingContext2D, point: Point, stroke: Stroke) {
  const corners = eraserCorners(point, stroke.width, stroke.height!)
  ctx.beginPath()
  ctx.moveTo(corners[0].x, corners[0].y)
  corners.slice(1).forEach((corner) => ctx.lineTo(corner.x, corner.y))
  ctx.closePath()
  ctx.fill()
}

// Stable in board coordinates: neither replay nor another pointer sample should
// make the deposited ink shimmer. The two scales avoid a regular scalloped edge.
function inkWidth(stroke: Stroke, point: Point) {
  const variation = Math.sin(point.x * .83 + point.y * .47) * .022
    + Math.sin(point.x * .21 - point.y * .37) * .016
  return effectiveWidth(stroke, point.pressure) * (1 + variation)
}

function markerSegment(ctx: CanvasRenderingContext2D, stroke: Stroke, a: Point, control: Point, b: Point) {
  const length = Math.hypot(control.x - a.x, control.y - a.y) + Math.hypot(b.x - control.x, b.y - control.y)
  const steps = Math.max(1, Math.ceil(length / 2.5))
  let previous = a
  for (let step = 1; step <= steps; step++) {
    const t = step / steps, s = 1 - t
    const current = {
      x: s * s * a.x + 2 * s * t * control.x + t * t * b.x,
      y: s * s * a.y + 2 * s * t * control.y + t * t * b.y,
      pressure: a.pressure + (b.pressure - a.pressure) * t,
    }
    ctx.beginPath()
    ctx.lineWidth = inkWidth(stroke, current)
    ctx.moveTo(previous.x, previous.y)
    ctx.lineTo(current.x, current.y)
    ctx.stroke()
    previous = current
  }
}

function softenInk(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  let seed = 2166136261
  for (const char of stroke.id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
  const random = () => {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0
    return (seed >>> 0) / 4294967296
  }
  // Very light variations in deposited ink, applied to the opaque union once.
  // A separate stroke still builds density where it crosses previous ink.
  const wash = ctx.createLinearGradient(0, 0, BOARD_WIDTH, BOARD_HEIGHT * .42)
  for (let i = 0; i <= 80; i++) wash.addColorStop(i / 80, `rgba(0,0,0,${random() * .065})`)
  const pad = stroke.width
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const point of stroke.points) {
    left = Math.min(left, point.x); right = Math.max(right, point.x)
    top = Math.min(top, point.y); bottom = Math.max(bottom, point.y)
  }
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = wash
  ctx.fillRect(left - pad, top - pad, right - left + pad * 2, bottom - top + pad * 2)
  ctx.restore()
}

// Paint opaque coverage. Composite once per stroke to avoid dark sample seams.
function paintCoverage(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { points } = stroke
  if (!points.length) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  if (stroke.tool === 'eraser' && stroke.height) {
    stampEraser(ctx, points[0], stroke)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]
      const rotationDistance = Math.abs((b.angle ?? 0) - (a.angle ?? 0)) * Math.PI / 180 * stroke.width / 2
      const steps = Math.max(1, Math.ceil((Math.hypot(b.x - a.x, b.y - a.y) + rotationDistance) / Math.max(1, stroke.height / 8)))
      for (let step = 1; step <= steps; step++) {
        const t = step / steps
        stampEraser(ctx, {
          x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
          pressure: .5, angle: (a.angle ?? 0) + ((b.angle ?? 0) - (a.angle ?? 0)) * t,
        }, stroke)
      }
    }
    return
  }
  // Repeated stationary samples still leave the initial contact mark.
  ctx.beginPath()
  ctx.arc(points[0].x, points[0].y, (stroke.tool === 'marker' ? inkWidth(stroke, points[0]) : stroke.width) / 2, 0, Math.PI * 2)
  ctx.fill()
  if (points.length === 1) return
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1], current = points[i]
    const start = i === 1 ? previous : {
      x: (points[i - 2].x + previous.x) / 2,
      y: (points[i - 2].y + previous.y) / 2,
      pressure: (points[i - 2].pressure + previous.pressure) / 2,
    }
    if (stroke.tool === 'marker') {
      const end = { x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2,
        pressure: (previous.pressure + current.pressure) / 2 }
      markerSegment(ctx, stroke, start, previous, end)
      if (i === points.length - 1) markerSegment(ctx, stroke, end, current, current)
      continue
    }
    ctx.beginPath()
    ctx.lineWidth = effectiveWidth(stroke, (previous.pressure + current.pressure) / 2)
    ctx.moveTo(start.x, start.y)
    ctx.quadraticCurveTo(previous.x, previous.y, (previous.x + current.x) / 2, (previous.y + current.y) / 2)
    if (i === points.length - 1) ctx.lineTo(current.x, current.y)
    ctx.stroke()
  }
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, coverage: HTMLCanvasElement) {
  if (!stroke.points.length) return
  const ink = coverage.getContext('2d')!
  ink.setTransform(1, 0, 0, 1, 0, 0)
  ink.clearRect(0, 0, coverage.width, coverage.height)
  ink.setTransform(ctx.getTransform())
  paintCoverage(ink, stroke)
  if (stroke.tool === 'marker') softenInk(ink, stroke)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  ctx.globalAlpha = stroke.tool === 'eraser' ? 1 : .86
  ctx.drawImage(coverage, 0, 0)
  ctx.restore()
}

// Cache committed ink. Pointer movement only repaints the active stroke.
export function createBoardRenderer(canvas: HTMLCanvasElement) {
  const committed = document.createElement('canvas')
  const coverage = document.createElement('canvas')
  let previousStrokes: Stroke[] | null = null
  let scale = 1
  return {
    resize(width: number, height: number, dpr: number) {
      canvas.width = committed.width = coverage.width = Math.max(1, Math.round(width * dpr))
      canvas.height = committed.height = coverage.height = Math.max(1, Math.round(height * dpr))
      scale = canvas.width / BOARD_WIDTH
      previousStrokes = null
    },
    render(strokes: Stroke[], active: Stroke | null = null) {
      const base = committed.getContext('2d')!
      const ctx = canvas.getContext('2d')!
      if (strokes !== previousStrokes) {
        base.setTransform(1, 0, 0, 1, 0, 0)
        base.clearRect(0, 0, committed.width, committed.height)
        base.setTransform(scale, 0, 0, scale, 0, 0)
        strokes.forEach((stroke) => drawStroke(base, stroke, coverage))
        previousStrokes = strokes
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(committed, 0, 0)
      if (active) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0)
        drawStroke(ctx, active, coverage)
      }
    },
  }
}
