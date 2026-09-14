/* The research agent workload: a multi-hop retrieval loop — search the
 * web, search internal documents, synthesize what's been found, repeat
 * for several hops, then generate a final answer.
 *
 * This is two things layered on top of each other, not one:
 *   1. A per-task phase cycle (web -> docs -> synthesize, repeated `hops`
 *      times, then generate, then the next task starts) that drives which
 *      external resource is hot right now — same idea as training's
 *      compute<->all-reduce loop.
 *   2. A concurrency story — how many research tasks can run at once
 *      before they start queueing for a core — the same math shape as
 *      agentic/data.js's core-slots queueing (deliberately duplicated
 *      here rather than shared: two instances is fine, extract a helper
 *      if a third workload needs it too).
 *
 * Reuses agentic's real Turin/Venice PLATFORMS table directly (same
 * hardware facts, no reason to retype them) but NOT its queueing
 * constants — a research task holds a slot far longer than a single tool
 * call (multiple network round trips per hop), so hold time scales with
 * the hop count. That's the interesting new result this workload adds on
 * top of agentic: more hops per task means fewer concurrent tasks fit on
 * the same platform, even though nothing about the platform changed.
 *
 * See src/engine/workloadContract.js for the interface this implements. */

import { PLATFORMS } from '../agentic/data.js';

export const id = 'research';
export const label = 'Running a research agent';
export const subtitle = 'Web + docs + synthesis, N hops · concurrency-bound like agentic, deeper per task';

export const RESOURCES = {
  webNet: { name: 'Web Search', helps: "faster / more parallel search API calls — rarely the fix, it's an external round trip" },
  docNet: { name: 'Internal Docs', helps: 'an in-memory ANN index (HNSW), faster NVMe, more RAM to cache it' },
  compute: { name: 'Synthesize (GPU)', helps: 'newer tensor cores, FP8/FP16 math — reasoning over what\'s been gathered so far' },
  hbmBw: { name: 'HBM Bandwidth', helps: 'faster HBM (HBM3e), quantization, bigger batches — the final-answer decode wall' },
  mem: { name: 'HBM Capacity', helps: 'more VRAM, quantization, KV-cache compression' },
  coreSlots: { name: 'Core Slots', helps: 'more cores/threads — how many research tasks can be resident at once, not how fast any one runs' },
};
export const ORDER = ['webNet', 'docNet', 'compute', 'hbmBw', 'mem', 'coreSlots'];

// Per-task phase cycle. `bottleneck`/loads.coreSlots are authored fallbacks
// — targetLoads()/bottleneckKey() override coreSlots and the effective
// bottleneck every tick from the live platform/hops knobs, same pattern as
// agentic and cipipeline.
export const PHASES = {
  webSearch: {
    name: 'Searching the web',
    bottleneck: 'webNet',
    caption: 'Round-tripping to an external search API for this hop. Nothing else on the machine is busy — this is purely waiting on the network.',
    loads: { webNet: .85, docNet: .15, compute: .20, hbmBw: .08, mem: .15, coreSlots: .3 },
  },
  docSearch: {
    name: 'Searching internal docs',
    bottleneck: 'docNet',
    caption: "Scanning the internal vector index for this hop's query — same ANN lookup as a plain retrieval call, just one step in a longer chain.",
    loads: { webNet: .10, docNet: .82, compute: .25, hbmBw: .10, mem: .20, coreSlots: .3 },
  },
  synthesize: {
    name: 'Synthesizing this hop',
    bottleneck: 'compute',
    caption: 'Reasoning over everything gathered so far to decide the next query (or that it has enough to answer). Real GPU compute, not a network wait.',
    loads: { webNet: .10, docNet: .12, compute: .88, hbmBw: .45, mem: .30, coreSlots: .3 },
  },
  generate: {
    name: 'Generating the answer',
    bottleneck: 'hbmBw',
    caption: 'Hops are done — this is an ordinary decode loop now, same bandwidth wall as any other, just sitting on top of everything retrieved along the way.',
    loads: { webNet: .05, docNet: .05, compute: .15, hbmBw: .93, mem: .40, coreSlots: .3 },
  },
};

export const DEFAULT_KNOBS = { platform: 'turin', hops: 3 };

export const KNOBS = {
  platform: {
    type: 'select',
    label: 'CPU Platform',
    options: [
      { value: 'turin', label: 'EPYC Turin · 128c, high clock', shortLabel: 'Turin (128c)' },
      { value: 'venice', label: 'EPYC Venice · 256c, lower clock', shortLabel: 'Venice (256c)' },
    ],
  },
  hops: { label: 'Retrieval hops', min: 1, max: 6, step: 1, unit: '' },
};

// Fixed demand: this many research tasks start per second, regardless of
// platform or hop count. A task holds a core slot for its whole lifecycle
// (every hop's web+doc+synthesize round trip, plus the final generate) —
// so more hops directly means a longer hold time, same Little's Law shape
// as agentic (offered concurrency = arrival rate x hold time).
const ARRIVAL_PER_SEC = 1.2;
const SEC_PER_HOP = 3;
const GENERATE_SEC = 2;
const MAX_QUEUE_DISPLAY = 40;

function holdTimeFor(hops) {
  return hops * SEC_PER_HOP + GENERATE_SEC;
}

function stats(knobs) {
  const platform = PLATFORMS[knobs.platform];
  const holdTime = holdTimeFor(knobs.hops);
  const capacityPerSec = platform.slots / holdTime;
  const util = ARRIVAL_PER_SEC / capacityPerSec;
  return { platform, holdTime, capacityPerSec, util };
}

// Animated per-phase durations (seconds at 1x) — separate from the
// concurrency hold time above, this just paces the visible phase cycle.
const DUR = { webSearch: 1.2, docSearch: 1.0, synthesize: 1.4, generate: 1.8 };
const CYCLE = ['webSearch', 'docSearch', 'synthesize'];

export function createState() {
  return {
    phase: 'webSearch', phaseStart: 0,
    knobs: { ...DEFAULT_KNOBS },
    hopIndex: 0, taskCount: 0,
    queue: 0, sessionCounter: 0, completed: 0,
    disp: { webNet: 0, docNet: 0, compute: 0, hbmBw: 0, mem: 0, coreSlots: 0 },
  };
}

export function step(s, dt, speed) {
  // Per-task phase cycling — which resource is hot right now.
  if (s.clock - s.phaseStart > DUR[s.phase] / speed) {
    if (s.phase === 'synthesize') {
      s.hopIndex += 1;
      s.phase = s.hopIndex < s.knobs.hops ? 'webSearch' : 'generate';
    } else if (s.phase === 'generate') {
      s.phase = 'webSearch'; s.hopIndex = 0; s.taskCount += 1;
    } else {
      s.phase = CYCLE[CYCLE.indexOf(s.phase) + 1];
    }
    s.phaseStart = s.clock;
  }

  // Concurrency/queueing — independent of which phase is animating above,
  // same math shape as agentic's.
  const dtSec = dt * speed;
  if (dtSec <= 0) return;
  const { capacityPerSec } = stats(s.knobs);
  s.sessionCounter += ARRIVAL_PER_SEC * dtSec;
  const throughput = Math.min(ARRIVAL_PER_SEC, capacityPerSec);
  s.completed += throughput * dtSec;
  s.queue = Math.max(0, Math.min(MAX_QUEUE_DISPLAY, s.queue + (ARRIVAL_PER_SEC - capacityPerSec) * dtSec));
}

export function targetLoads(s) {
  const { util } = stats(s.knobs);
  return { ...PHASES[s.phase].loads, coreSlots: Math.max(0, Math.min(1, util)) };
}

/** Usually the phase's own authored bottleneck — but if concurrency is
 * genuinely the tightest resource right now (undersized platform, too
 * many hops), core slots wins instead. Computed, not authored — same
 * override pattern as agentic/cipipeline. */
export function bottleneckKey(s) {
  const target = targetLoads(s);
  let best = ORDER[0], bestV = -Infinity;
  for (const key of ORDER) {
    if (target[key] > bestV) { bestV = target[key]; best = key; }
  }
  return best;
}

export function caption(s) {
  const base = PHASES[s.phase].caption;
  const bn = bottleneckKey(s);
  if (bn !== 'coreSlots') return base;
  const { platform, util } = stats(s.knobs);
  const utilPct = Math.round(Math.min(1, util) * 100);
  const queued = s.queue >= 0.5 ? ` ${Math.floor(s.queue)} task(s) queued.` : '';
  const nominal = RESOURCES[PHASES[s.phase].bottleneck].name.toLowerCase();
  return `${platform.name} (${platform.detail}) is out of core slots at ${utilPct}% of capacity, running ${s.knobs.hops}-hop research tasks.${queued} Right now concurrency is the real wall here, not ${nominal}.`;
}

export function reset(s) {
  s.phase = 'webSearch'; s.phaseStart = s.clock;
  s.hopIndex = 0; s.taskCount = 0;
  s.queue = 0; s.sessionCounter = 0; s.completed = 0;
}

export function headerLabel(s) {
  return `hop ${s.hopIndex + 1}/${s.knobs.hops} · task ${s.taskCount} · ${Math.floor(s.queue)} queued`;
}

/** One line for the current task/hop/phase, then queue-depth lines once
 * the platform can't keep up with the hop-count-driven hold time. */
export function logLines(s) {
  const { platform } = stats(s.knobs);
  const lines = [`task-${1000 + s.taskCount} · hop ${s.hopIndex + 1}/${s.knobs.hops} · ${PHASES[s.phase].name.toLowerCase()}`];
  const q = Math.floor(s.queue);
  if (q > 0) lines.push(`${q} research task(s) queued — waiting for a free core slot on ${platform.name}`);
  else lines.push(`all tasks resident · ${platform.slots} slots · ${Math.floor(s.completed)} completed so far`);
  return lines;
}
