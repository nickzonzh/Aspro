import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { createCanvas } from '@napi-rs/canvas'

const source = readFileSync(new URL('../src/lib/strokes.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { drawStroke, createBoardRenderer, boardPoint } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const point = (x, y, pressure = .5, angle = 0) => ({ x, y, pressure, angle })
const marker = (points, width = 10) => ({ id: 'test', tool: 'marker', color: '#000', width, points })
const alpha = (canvas, x, y) => canvas.getContext('2d').getImageData(x, y, 1, 1).data[3]
const paint = (canvas, stroke) => drawStroke(canvas.getContext('2d'), stroke, createCanvas(canvas.width, canvas.height))

test('sparse marker samples produce continuous ink all the way to the endpoint', () => {
  const canvas = createCanvas(400, 200)
  paint(canvas, marker([point(30, 100), point(150, 100), point(350, 100)]))
  for (let x = 30; x <= 350; x++) assert.ok(alpha(canvas, x, 100) > 200, `Gap at ${x}`)
})

test('ink variation stays subtle and independent of sample density; crossings build density', () => {
  const canvas = createCanvas(400, 200)
  paint(canvas, marker(Array.from({ length: 101 }, (_, i) => point(40 + i * 3, 100))))
  const sparse = createCanvas(400, 200)
  paint(sparse, marker([point(40, 100), point(340, 100)]))
  const values = Array.from({ length: 291 }, (_, i) => alpha(canvas, 45 + i, 100))
  const sparseValues = Array.from({ length: 291 }, (_, i) => alpha(sparse, 45 + i, 100))
  assert.deepEqual(values, sparseValues, 'Input sampling must not add dark beads or change ink density')
  assert.ok(Math.min(...values) >= 204 && Math.max(...values) <= 220, 'Keep opacity variation within six percent')
  assert.ok(Math.max(...values) - Math.min(...values) >= 5, 'Ink should have perceptible, restrained density variation')
  const before = alpha(canvas, 200, 100)
  paint(canvas, marker([point(200, 40), point(200, 160)]))
  assert.ok(alpha(canvas, 200, 100) > before + 20)
})

test('stationary contact keeps its ink when duplicate pointer samples arrive', () => {
  const canvas = createCanvas(100, 100)
  paint(canvas, marker([point(50, 50), point(50, 50), point(50, 50)]))
  assert.ok(alpha(canvas, 50, 50) > 200)
})

test('textured ink replays exactly and stays stable as an active stroke grows', () => {
  const canvas = createCanvas(400, 200), replay = createCanvas(400, 200)
  const stroke = marker([point(30, 100), point(150, 100), point(260, 100)])
  paint(canvas, stroke)
  paint(replay, JSON.parse(JSON.stringify(stroke)))
  const pixels = (target, width = 400) => target.getContext('2d').getImageData(0, 0, width, 200).data
  assert.deepEqual(pixels(canvas), pixels(replay), 'Reload/undo/export must preserve deposited texture')
  replay.getContext('2d').clearRect(0, 0, 400, 200)
  paint(replay, { ...stroke, points: [...stroke.points, point(350, 100)] })
  assert.deepEqual(pixels(canvas, 180), pixels(replay, 180), 'Existing ink must not shimmer as new samples arrive')
})

test('pressure changes the painted width', () => {
  const canvas = createCanvas(400, 200)
  paint(canvas, marker([point(40, 50, .1), point(340, 50, .1)], 20))
  paint(canvas, marker([point(40, 140, 1), point(340, 140, 1)], 20))
  assert.equal(alpha(canvas, 200, 60), 0)
  assert.ok(alpha(canvas, 200, 150) > 100)
})

for (const angle of [0, 90]) {
  test(`eraser footprint matches its rectangular felt at ${angle} degrees`, () => {
    const canvas = createCanvas(400, 400)
    canvas.getContext('2d').fillRect(0, 0, 400, 400)
    paint(canvas, { id: 'erase', tool: 'eraser', color: '#000', width: 84, height: 34, points: [point(200, 200, .5, angle)] })
    const longPoint = angle === 0 ? [235, 200] : [200, 235]
    const shortOutside = angle === 0 ? [200, 225] : [225, 200]
    assert.equal(alpha(canvas, ...longPoint), 0, 'The full long edge wipes')
    assert.equal(alpha(canvas, ...shortOutside), 255, 'Outside the felt remains untouched')
  })
}

test('fast diagonal erasing leaves no islands between sparse samples', () => {
  const canvas = createCanvas(400, 400)
  canvas.getContext('2d').fillRect(0, 0, 400, 400)
  paint(canvas, { id: 'erase', tool: 'eraser', color: '#000', width: 72, height: 29, points: [point(50, 50, .5, -12), point(350, 350, .5, 12)] })
  for (let i = 50; i < 350; i++) assert.equal(alpha(canvas, i, i), 0, `Unwiped point ${i}`)
  assert.equal(alpha(canvas, 30, 300), 255)
})

test('resize preserves the whole drawing and clear/undo invalidate the committed cache', () => {
  globalThis.document = { createElement: () => createCanvas(1, 1) }
  const canvas = createCanvas(1, 1)
  const renderer = createBoardRenderer(canvas)
  const strokes = [marker([point(1000, 600)], 20)]
  renderer.resize(1140, 707, 1)
  renderer.render(strokes)
  assert.ok(alpha(canvas, 1000, 600) > 200)
  renderer.resize(570, 353.5, 2)
  renderer.render(strokes)
  assert.ok(alpha(canvas, 1000, 600) > 200, 'DPR must preserve the same logical point')
  renderer.resize(285, 176.75, 1)
  renderer.render(strokes)
  assert.ok(alpha(canvas, 250, 150) > 200, 'Bottom-right ink survives mobile resize')
  assert.deepEqual(boardPoint(250, 150, 285), { x: 1000, y: 600, pressure: .5 })
  renderer.render([])
  assert.equal(alpha(canvas, 250, 150), 0)
  renderer.render(strokes)
  assert.ok(alpha(canvas, 250, 150) > 200)
  delete globalThis.document
})
