# collab-common 0.7.1 load gate in slides — tasks

- [x] Gate tests first, red (`src/lib/persistenceGate.test.ts`). (verified: suite failed to load the module first; 13/13 after)
- [x] `persistenceGate.ts`. (verified: src/lib/persistenceGate.ts)
- [x] SlideEditor: save paths, seeding, failed/loading panel, save-only toast, canvas observer. (verified: SlideEditor.tsx diff; live D below)
- [x] collab-common ^0.7.1; one copy of collab-common, ui, auth and yjs. (verified: lock holds one each of collab-common 0.7.1, ui, auth, yjs)
- [x] Full suite, typecheck, build, image (under the heavy-job lock). (verified: 142/142, tsc clean, image built)
- [x] Browser check: runtime config unchanged (production / staging). (verified: two-container browser check PASS)
- [x] Live on the local build under real sign-in: A-E. (verified: local build served as slides.cloistr.xyz under real sign-in, A-E PASS)
