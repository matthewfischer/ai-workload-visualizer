/**
 * The interface every workload module implements. This is the seam between
 * "code" (this engine directory) and "models" (src/workloads/*). The engine
 * imports nothing workload-specific; workloads import only from the engine.
 *
 * A workload module exports:
 *   id            string — unique key, used for routing/switching.
 *   label         string — shown in the workload picker.
 *   subtitle      string — one-line framing shown under the picker.
 *   RESOURCES     { [key]: { name, helps } } — the parts of the machine this
 *                 workload models, and what actually helps each one.
 *   ORDER         string[] — display order of resource keys in the telemetry
 *                 strip (left/cool -> right/hot is a reasonable convention).
 *   PHASES        { [key]: { name, bottleneck, caption, loads } } — pure
 *                 data. `loads` is a 0..1 target per resource key.
 *   createState() -> state — fresh mutable engine state for this workload.
 *                 Must include at least { phase, phaseStart, disp } where
 *                 `disp` is a { [resourceKey]: number } map seeded at 0 and
 *                 `phase` is a key into PHASES.
 *   step(state, dt, speed) -> void — advance state.clock/phase/whatever
 *                 workload-specific progression it tracks (tokens, KV size,
 *                 queue depth, redo log position, ...) by dt seconds at the
 *                 given speed multiplier. Must NOT ease `disp` itself — the
 *                 engine's clock hook does that generically from
 *                 PHASES[state.phase].loads (see targetLoads below).
 *   targetLoads(state) -> { [resourceKey]: number } — optional. Defaults to
 *                 PHASES[state.phase].loads. Override when a resource's
 *                 target load needs to be a function of live state (e.g.
 *                 memory climbing as a KV cache/buffer pool fills).
 *   reset(state)  -> void — mutate state back to the start of a fresh run
 *                 (new prompt / new transaction / new batch).
 *   Scene         React component: (props: { state, disp }) => SVG children.
 *                 Renders the workload's own diagram inside the shared
 *                 <svg viewBox="0 0 1000 440"> stage using engine primitives
 *                 (SmallNode, BigNode, Channel, FeedLine, ...) plus whatever
 *                 bespoke pieces the workload needs (e.g. a KV cache block
 *                 for chatbot inference, a redo-log ring for Oracle).
 *   Terminal      React component (props: { state }) => plain HTML/text
 *                 children, optional. Rendered by App.jsx inside the shared
 *                 engine/TerminalWindow chrome (a generic terminal-style
 *                 panel: title bar + monospace body). Use it when the
 *                 workload has a concrete textual thing to show happening
 *                 (a chat transcript revealed token-by-token, log lines,
 *                 a query plan) — skip it entirely when there's no natural
 *                 text output; App.jsx omits the panel if a workload has no
 *                 Terminal export.
 *
 * Adding a new workload (AI or not — SAP HANA, Oracle, whatever) means
 * adding one folder here and registering it in src/workloads/index.js.
 * The engine (theme, clock hook, primitives, telemetry strip, controls,
 * narration, App shell) never changes.
 */
export const WORKLOAD_CONTRACT_VERSION = 1;
