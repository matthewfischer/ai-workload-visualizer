# AI Workload Visualizer — Handoff

A "watch where the machine runs hot" mental-model tool. Press play, watch a token flow
through an inference server, see which resource is pinned (the bottleneck) and which are idle.
Purpose: build gut feel for *which hardware feature actually matters for a given workload* —
and which is marketing. **Not** a customer-facing sales tool.

## Current state

- The project is a real Vite/React app with code/model separation. See
  `ARCHITECTURE.md` for the structure — **read that file first**, it
  supersedes the old "Architecture" section below in terms of where things
  physically live. The concepts (RESOURCES / PHASES / render engine) are
  unchanged, just relocated and formalized into an explicit contract
  (`src/engine/workloadContract.js`) so non-AI workloads (SAP HANA, Oracle,
  ...) can be added as siblings to `src/workloads/chatbot/` without touching
  engine code. `npm install && npm test && npm run build` all pass (52 tests).
- Old single-file prototype `ai_workload_visualizer_v2.jsx` is still at the
  repo root, untouched, as a reference.
- **Scope: four workloads now registered** — see "Next workloads to re-add"
  below, which this pass closed out: `chatbot` (prefill→decode), `longctx`
  (ingest→summarize, compute-bound), `batch` (ramp→saturated, capacity-bound),
  `training` (compute↔all-reduce loop, network-bound, its own multi-GPU
  `Scene`).
- **Terminal panels added for all four workloads** (`engine/TerminalWindow.jsx`
  chrome + each workload's own `Terminal` export in `Scene.jsx`) — content
  matches each workload's actual story rather than forcing one style:
  - `chatbot`: canned prompt during prefill, response revealed word-by-word
    in sync with `state.tokens` during decode.
  - `longctx`: a scrolling fake "parsing" log during ingest (one line per
    page, sampled from a fixed snippet pool) + a running extracted-token
    count, then a canned summary revealed word-by-word during summarize.
  - `batch`: one admission-log line per resident request, then one queued
    line per waiting arrival once the batch saturates.
  - `training`: a classic training-loop console — fake (not measured, but
    deterministic per step) decreasing loss line + an all-reduce sync-timing
    line, alternating with the phase.
  All of the above are pure functions of state (`ingestLogLines`,
  `revealedSummary`, `logLines`, etc. in each workload's `data.js`) so
  they're covered by ordinary unit tests, no rendering needed.
- **v1** (`ai_workload_visualizer.jsx`, not in this repo snapshot) had 4 workloads (chatbot / long-context / batch / training) but generic dots-on-lines rendering. Superseded by v2, which drops to one case and invests in the visual language, and this pass, which re-added the other three with the new visual language and separable data model.

## Architecture (the part to preserve)

Three layers, deliberately separable:

1. **`RESOURCES`** — each part of the machine (`compute, hbmBw, mem, nic, cpu, pcie`) + a `helps`
   string ("what genuinely speeds this up when it's the bottleneck").
2. **`PHASES`** — pure data. Each phase = a 0–1 `load` per resource + a `bottleneck` + a `caption`.
   This is the only thing you edit to add a workload/phase. The render engine never changes.
3. **Render engine** — generic. Eases displayed loads toward the phase target each frame, colors
   everything by load, animates the flow. Knows nothing model-specific.

**To add a workload later:** add a phase block to the data with its load profile. Bottleneck =
`argmax(load)`; the engine picks it up automatically.

## Key design decisions (and why)

- **Utilization = temperature.** Whole scene is cool steel at rest; heat (amber→red→white-hot) is
  the *only* saturated thing on screen. The bottleneck literally looks hot, so the eye goes to it
  and skips the idle parts. That skip *is* the lesson. (Rejected the generic dark-dashboard look.)
- **Read/write asymmetry is the signature.** Decode's real truth: you drag the entire model + KV
  cache out of HBM to produce *one* token. So a fat hot stream flows memory→compute, and a single
  thin pulse arcs over the top to append that one token to the KV cache. Fat in, trickle out.
- **KV cache is made visible.** It lives inside GPU memory, next to the weights, and grows one notch
  per generated token — answers the original "I couldn't draw where the KV cache sits" problem.
- **Two hero numbers.** Compute % (left) vs HBM bandwidth % (across the channel) — same machine,
  one bored, one pinned. Intended as the emotional core of the contrast.
- **Data-driven but focused.** Kept the separable data model from v1, but spent all craft on the one
  case per the "nail look and feel first, add more later" call.

## The technical model it encodes (don't lose this)

- **Prefill** = read whole prompt in one parallel pass → **compute-bound** (matmul heavy), seeds KV.
- **Decode** = one token at a time, re-reading all weights + KV every token → **bandwidth-bound**;
  cores mostly idle. This is the textbook result and the core intuition.
- Feature relevance rule: *a feature only matters if it accelerates the stage that's actually the
  bottleneck.* AMX/more FLOPs on a bandwidth-bound decode = reaches the same wall sooner.
- Load profiles are **hand-authored to be directionally honest, not measured.** Fine for gut-feel;
  see open question on whether to key them to real knobs.

## Open questions / next decisions

1. **Legibility vs. busyness** — channel stream + append arc + output drip + KV growth may read as
   noise. Option: slow token rate, thin particles so each token is one followable beat.
2. **Hero-number contrast** — do compute% vs bandwidth% land, or make them bigger / closer together?
3. **Pacing** — real-time instrument vs. guided loop that pauses on each phase to let you read it.
4. **"What's marketing" logic** — currently a heuristic (flag any marketed resource <50% as a red
   herring). Keep simple, or give each phase an explicit "tempting-but-wrong feature"?
5. **Parameterization** — eventually key load profiles to real knobs (batch size, context length,
   model size) so you can slide them and watch the bottleneck flip? Or keep it curated/canned?

## Next workloads to re-add (data only)

- ~~**Long-context / summarization** → prefill-bound (compute is the wall).~~ Done: `src/workloads/longctx/`.
- ~~**Batch serving** → capacity-bound (every request needs its own KV cache; caps concurrency).~~ Done: `src/workloads/batch/`.
- ~~**Training** → network-bound at scale (gradient all-reduce). Note: training needs a different
  visual mode than the inference token-loop; don't force it into the same animation.~~ Done:
  `src/workloads/training/` — 4 parallel GPU nodes wired into a shared network-fabric channel,
  looping compute↔all-reduce rather than a one-shot run.
- Possible next candidates: a non-AI workload (SAP HANA buffer-cache thrash, Oracle redo-log
  write pressure) to prove out the "not just AI" claim in ARCHITECTURE.md; per-workload `Terminal`
  panels for batch/training/longctx (log-line style, not literal chat transcript).

## Tech notes

- Single rAF loop; state held in a `useRef` mutated per frame + `useReducer` force-render (avoids
  stale closures). Particle positions derived from a clock (stateless). No `localStorage`.
- Thermal ramp = `heat(v)` piecewise interpolation. Palette: cool cyan for UI/data, warm for strain.
- Respects `prefers-reduced-motion`. Responsive SVG (`viewBox`, width 100%).
