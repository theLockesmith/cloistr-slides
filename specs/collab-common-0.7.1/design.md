# collab-common 0.7.1 load gate in slides — design

`src/lib/persistenceGate.ts` (same contract as docs, plus
`shouldSeedFirstSlide`) decides the view, the save gate and seeding from
`loadStatus`. collab-common copies load failures into `error`, so
`saveFailure` treats `error` as a save failure only once loaded; the toast and
the status bar use it.

`SlideEditor.tsx`: `onSave` checks the gate through a ref (Ctrl+S never reads
stale state); the File-menu Save and the status-bar button use
`canSave`/`saveBlockedReason`; the seed effect uses `shouldSeedFirstSlide`;
while not ready the editor body is replaced by a loading or failed panel. The
canvas ResizeObserver effect now re-runs on `view`, since the canvas only
mounts once the presentation is ready (with `[]` it would never attach).

Live check: `live-persist.mjs` slides adapter counts slides (1 seeded + 2 per
edit) and drops only kind 30078 REQs on the relay socket for the silent case.
