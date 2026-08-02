# Architecture

Core principle: **code and models are separate.** The engine has no idea what
a "token" or a "redo log" is. Everything workload-specific — including
non-AI workloads (SAP HANA, Oracle, ...) — lives under `src/workloads/`.

## Layout

```
src/
  engine/                 generic — never imports from workloads/
    theme.js              color ramp (heat), lerp, bez, pct, palette
    workloadContract.js   the interface a workload module must implement (read this first)
    useEngineClock.js     rAF loop: advances workload state, eases disp[] toward phase targets
    primitives.jsx        reusable SVG pieces: SmallNode, BigNode, FeedLine, Channel
    Chrome.jsx            TelemetryStrip, Narration, Controls — driven by RESOURCES/PHASES data

  workloads/
    index.js              REGISTRY — the one file that has to know a workload exists
    chatbot/
      data.js              RESOURCES, PHASES, ORDER, createState/step/reset/targetLoads
      Scene.jsx            the SVG diagram for this workload + its bespoke pieces
                            (KV cache block, token-append arc, output drip)

  App.jsx                 shell: workload picker + engine chrome + <Scene>
  main.jsx                ReactDOM mount
```

## The workload contract

Full spec with field-by-field explanation: `src/engine/workloadContract.js`.
Summary: a workload exports `id`, `label`, `RESOURCES`, `ORDER`, `PHASES`
(pure data — 0..1 load per resource per phase), `createState()`, `step()`,
`reset()`, optionally `targetLoads()` for state-dependent targets (e.g. a
buffer pool filling), and a `Scene` component that draws the diagram using
`engine/primitives.jsx` plus whatever bespoke shapes the workload needs.

`src/workloads/index.js` is the *only* place a new workload has to be wired
in. Nothing in `engine/` or in other workload folders changes.

## Adding a new workload (AI or not)

1. `mkdir src/workloads/<name>` with `data.js` + `Scene.jsx` implementing
   the contract above.
2. Register it in `src/workloads/index.js`.
3. Add contract-shape tests will pass automatically —
   `src/__tests__/workloadContract.test.js` iterates every registered
   workload, so a broken new one (missing RESOURCES entry, bottleneck key
   that isn't in ORDER, etc.) fails CI immediately.
4. Add workload-specific logic tests alongside it (see
   `src/__tests__/chatbot.test.js` for the pattern: drive `step()` with a
   fake clock, assert phase transitions / derived state, no rendering).

This is why non-AI workloads (SAP HANA buffer-cache thrash, Oracle redo-log
write pressure, a plain disk-bound OLTP workload, ...) are first-class here,
not a hypothetical: `RESOURCES` and `PHASES` are just labeled 0..1 load
data, and `Scene` can lay out whatever physical story that workload needs
(it doesn't have to look like the chatbot's network→compute→memory pipeline).

## Status as of this pass

- Refactor from the single-file `ai_workload_visualizer_v2.jsx` prototype
  into the structure above is **written but not yet verified** — `npm
  install` had not completed and `npm test` / `npm run build` had not been
  run before this session ended. **Next step: run `npm install && npm test
  && npm run build`, fix whatever breaks** (likely candidates: JSX-in-.js
  import extension mismatches, the `Scene.jsx` re-export of `pct` that's
  unused/dead, unused `onSpeed`/`resetLabel` polish, unused `S` from data.js
  `PHASES` in App.jsx).
- Original prototype file `ai_workload_visualizer_v2.jsx` left in place at
  repo root, untouched, as a reference / fallback until the new structure
  is confirmed working end-to-end.
- Open design questions from the original prototyping pass (legibility vs.
  busyness, hero-number contrast, pacing, the "what's marketing" heuristic,
  parameterization by real knobs) are **unchanged** — this pass was
  structural only, no visual/UX changes. See `HANDOFF.md`.
- Tests written (not yet run): `theme.test.js` (color ramp / math),
  `workloadContract.test.js` (contract-shape guard for all registered
  workloads), `chatbot.test.js` (phase-progression logic), `App.test.jsx`
  (render smoke test).
