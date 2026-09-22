import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/strokes.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { drawStroke } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

for (const tool of ['marker', 'eraser']) {
  test(`${tool}: sparse samples form a connected path ending at the final sample`, () => {
    const paths = []
    let path
    const ctx = {
      save() {}, restore() {},
      beginPath() { path = {} },
      moveTo(x, y) { path.start = [x, y] },
      quadraticCurveTo(_cx, _cy, x, y) { path.end = [x, y] },
      lineTo(x, y) { path.end = [x, y] },
      stroke() { paths.push(path) },
    }
    const points = [
      { x: 0, y: 0, pressure: .2 },
      { x: 80, y: 100, pressure: .8 },
      { x: 180, y: 0, pressure: .4 },
    ]
    drawStroke(ctx, { tool, color: '#222', width: 6, points })
    assert.ok(paths.length)
    assert.deepEqual(paths[0].start, [0, 0])
    for (let i = 1; i < paths.length; i++) {
      assert.deepEqual(paths[i].start, paths[i - 1].end, 'No gap between drawn segments')
    }
    assert.deepEqual(paths.at(-1).end, [180, 0], 'Ink reaches the released nib position')
    assert.equal(ctx.globalCompositeOperation, tool === 'eraser' ? 'destination-out' : 'source-over')
  })
}
