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
                            (KV cache block, token-append arc, output drip);
                            also exports Terminal — the chat transcript panel
    longctx/                prefill/compute-bound: ingest a long document, then summarize
    batch/                  capacity-bound: KV-cache slots fill up, requests queue
    training/               network-bound: GPU cluster looping compute <-> all-reduce

  App.jsx                 shell: workload picker + engine chrome + <Scene> + optional <Terminal>
  main.jsx                ReactDOM mount
```

## The workload contract

Full spec with field-by-field explanation: `src/engine/workloadContract.js`.
Summary: a workload exports `id`, `label`, `RESOURCES`, `ORDER`, `PHASES`
(pure data — 0..1 load per resource per phase), `createState()`, `step()`,
`reset()`, optionally `targetLoads()` for state-dependent targets (e.g. a
buffer pool filling), a `Scene` component that draws the diagram using
`engine/primitives.jsx` plus whatever bespoke shapes the workload needs, and
optionally a `Terminal` component (plain text/HTML, rendered by App.jsx
inside `engine/TerminalWindow.jsx`'s generic terminal chrome) for workloads
that have a concrete textual thing to show happening.

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
  into the structure above is **verified**: `npm install && npm test && npm
  run build` all pass.
- Three new workloads added alongside chatbot, closing out the "next
  workloads to re-add" list in `HANDOFF.md`: `longctx` (prefill/compute-bound
  document summarization), `batch` (capacity-bound concurrent request
  serving), `training` (network-bound gradient all-reduce, looping
  compute↔all-reduce with its own multi-GPU-cluster `Scene` rather than the
  single-pipeline layout — see HANDOFF's note that training needed a
  different visual mode).
- Added an optional `Terminal` contract field + `engine/TerminalWindow.jsx`
  chrome: chatbot now reveals a canned prompt/response word-by-word in sync
  with the decode beat, in a small terminal-style panel under the scene.
  Other workloads don't implement one yet (App.jsx just omits the panel).
- Original prototype file `ai_workload_visualizer_v2.jsx` left in place at
  repo root, untouched, as a reference.
- Open design questions from the original prototyping pass (legibility vs.
  busyness, hero-number contrast, pacing, the "what's marketing" heuristic,
  parameterization by real knobs) are **unchanged**. See `HANDOFF.md`.
- Tests: `theme.test.js`, `workloadContract.test.js` (contract-shape guard
  iterating every registered workload), one phase-progression test file per
  workload (`chatbot.test.js`, `longctx.test.js`, `batch.test.js`,
  `training.test.js`), `App.test.jsx` (render smoke test). 52 tests passing.
