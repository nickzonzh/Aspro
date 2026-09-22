export type Point = {
  x: number
  y: number
  pressure: number
}

export type StrokeTool = 'marker' | 'eraser'

export type Stroke = {
  id: string
  tool: StrokeTool
  color: string
  width: number
  points: Point[]
}

export const DEFAULT_PRESSURE = 0.5

const effectiveWidth = (stroke: Stroke, pressure: number) => {
  if (stroke.tool === 'eraser') return stroke.width
  const normalized = pressure > 0 ? pressure : DEFAULT_PRESSURE
  return stroke.width * (0.86 + normalized * 0.28)
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { points } = stroke
  if (!points.length) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.globalAlpha = stroke.tool === 'eraser' ? 1 : 0.86

  if (points.length === 1) {
    const point = points[0]
    const radius = effectiveWidth(stroke, point.pressure) / 2
    ctx.beginPath()
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]
    const current = points[i]
    const midX = (previous.x + current.x) / 2
    const midY = (previous.y + current.y) / 2

    ctx.beginPath()
    ctx.lineWidth = effectiveWidth(stroke, (previous.pressure + current.pressure) / 2)
    const start = i === 1 ? previous : {
      x: (points[i - 2].x + previous.x) / 2,
      y: (points[i - 2].y + previous.y) / 2,
    }
    ctx.moveTo(start.x, start.y)
    ctx.quadraticCurveTo(previous.x, previous.y, midX, midY)
    if (i === points.length - 1) ctx.lineTo(current.x, current.y)
    ctx.stroke()
  }

  ctx.restore()
}

export function redrawCanvas(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  inProgress?: Stroke | null,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
  strokes.forEach((stroke) => drawStroke(ctx, stroke))
  if (inProgress) drawStroke(ctx, inProgress)
  ctx.restore()
}
