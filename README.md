# Aspro

A small tactile whiteboard for the web. Pick a physical marker from the tray and draw directly on a glossy, aluminium-framed board.

## What is in this first pass

- CSS-built 2.5D whiteboard with aluminium frame, tray, enamel surface, contact shadow, and pointer-reactive highlights
- Four physical markers (black, blue, red, green)
- Marker pickup: all tools begin in the tray; selecting one lifts it out and turns it into the drawing cursor
- Marker rotation eases while the nib stays attached to the true pointer
- Physical eraser tool
- Pressure-aware pointer input where the device exposes pressure
- Undo / redo / clear
- Local autosave
- PNG export of the board surface
- Mouse, touch, and pen input via Pointer Events

## Run locally

```bash
npm ci
npm run dev
```

Verification:

```bash
npm test
npm run build
```

## Architecture

The physical whiteboard is regular DOM/CSS. The ink is an independent high-DPI canvas. That separation is deliberate: the object/material design can evolve without coupling it to the stroke engine.

`src/components/Whiteboard.tsx` owns interaction and board composition. `src/lib/strokes.ts` owns stroke rendering/replay. `src/styles.css` owns the material system and physical tool styling.

## Polish and coordinate model

Drawing uses a fixed 1140 x 707 logical surface, displayed with the same aspect ratio at every breakpoint. Saved ink, pressure and eraser footprints scale together when the window changes size. The tray objects fit their individual button slots down to 320px.

The renderer caches committed ink and paints active strokes into a reusable opaque coverage canvas, then applies transparency once. Tiny spatial width changes and a deterministic opacity wash give the ink slight edge and density variation without sample seams. Texture stays stable through redraw, undo and autosave; separate strokes darken at overlaps. Stationary repeated samples retain the initial contact dot. The eraser stores its rectangular felt dimensions and angle at each sample; interpolated stamps keep fast wipes continuous.

`src/lib/toolMotion.ts` handles interruptible 180ms pickup/return transitions. Pointer-down interrupts pickup immediately so ink never waits for animation. While drawing, the tool pose and fresh ink are committed in the same animation frame. Translation and shadow are outside the rotated body, preserving a consistent scene-light direction. Reduced-motion preferences and keyboard selection skip tool travel.

Contact shadows tighten while drawing. The eraser leans gently with drag direction; its shell compresses by about 1px while the felt footprint stays unchanged. Parked objects use close contact shadows, and the enamel reflection passes faintly over the ink. Below 720px, narrower page margins and frame padding increase usable surface area while preserving the drawing's aspect ratio.

Autosave writes `aspro:whiteboard:v2`. Existing v1 data is retained and imported using the original desktop coordinate size: v1 did not record its canvas dimensions, so a drawing originally made on a smaller viewport cannot have its original scale reconstructed exactly. Legacy circular eraser operations replay as circles; new eraser operations use the felt rectangle.

## Verification scope

Pixel tests cover sparse stroke continuity, opacity at sample joins and separate-stroke crossings, pressure, rotated eraser coverage, fast wipes, resizing/DPR, and clear/undo cache invalidation. Browser checks cover desktop and narrow layouts, tool switching, undo/redo, clear, pickup/return and reduced motion. Real touch/stylus hardware and high-refresh input latency still need a hands-on feel check.
