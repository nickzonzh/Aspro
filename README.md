# Aspro

A small tactile whiteboard for the web. Pick a physical marker from the tray and draw directly on a glossy, aluminium-framed board.

## What is in this first pass

- CSS-built 2.5D whiteboard with aluminium frame, tray, enamel surface, contact shadow, and pointer-reactive highlights
- Four physical markers (black, blue, red, green)
- Marker pickup: all tools begin in the tray; selecting one lifts it out and turns it into the drawing cursor
- Marker pose has light visual inertia while the ink remains attached to the true pointer
- Physical eraser tool
- Pressure-aware pointer input where the device exposes pressure
- Undo / redo / clear
- Local autosave
- PNG export of the board surface
- Mouse, touch, and pen input via Pointer Events

## Run locally

```bash
npm install
npm run dev
```

Production check:

```bash
npm run build
```

## Architecture

The physical whiteboard is regular DOM/CSS. The ink is an independent high-DPI canvas. That separation is deliberate: the object/material design can evolve without coupling it to the stroke engine.

`src/components/Whiteboard.tsx` owns interaction and board composition. `src/lib/strokes.ts` owns stroke rendering/replay. `src/styles.css` owns the material system and physical tool styling.

## Next polish pass

- tune marker silhouette and nib alignment against rendered screenshots
- improve aluminium reflections and frame corner treatment
- refine marker inertia / pickup / return motion
- add more convincing dry-erase ink texture without sacrificing drawing latency
- visual QA on touch and stylus devices
