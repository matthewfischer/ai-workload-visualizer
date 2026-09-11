/* The agentic workload: a fleet of tool-calling agent sessions, each
 * spending almost all of its wall-clock time blocked on something off-box
 * (a tool call, another agent, an API) and only briefly needing a core to
 * plan/parse/decide its next step. That makes this a concurrency problem,
 * not a speed problem — the same shape as noisyneighbor's CPU Ready queue
 * or batch's KV-cache slots, not chatbot's "go as fast as possible" decode.
 *
 * This is the test case for a real vendor claim: "256 low-frequency cores
 * is good for agentic." The mechanism isn't that slow cores are free — it's
 * that when each task is I/O-bound rather than compute-bound, the ceiling
 * is how many sessions can be concurrently resident (core *slots*), and a
 * platform with more slots clears the exact same offered demand without
 * queueing, even though each individual core is slower. Per-session speed
 * (frequency) stays a minor, non-bottleneck resource throughout — that's
 * the point being illustrated, not an oversight.
 *
 * Bottleneck is computed from a live KNOBS pick (see
 * src/engine/workloadContract.js's KNOBS/bottleneckKey/caption extension,
 * proven out by src/workloads/cipipeline/data.js), not authored per phase. */

export const id = 'agentic';
export const label = 'Running an agent fleet';
export const subtitle = 'Live-tunable · concurrency-bound, not speed-bound';

export const RESOURCES = {
  perTaskSpeed: { name: 'Per-Session Compute', helps: "a faster clock — but each agent's turn is a brief planning/parsing burst, so this rarely moves the needle" },
  toolNet:      { name: 'Tool-Call Network',   helps: 'faster APIs / lower-latency tools on the other end — the real source of wait time, and not something CPU choice fixes' },
  coreSlots:    { name: 'Core Slots',          helps: 'more cores/threads — how many sessions can be resident at once, not how fast any one of them runs' },
};
export const ORDER = ['perTaskSpeed', 'toolNet', 'coreSlots'];

// Single live phase — this workload doesn't tell an authored story, it
// computes one from the platform knob. loads/bottleneck below are unused
// fallbacks (targetLoads/bottleneckKey override every tick, same pattern
// as cipipeline).
export const PHASES = {
  running: {
    name: 'Agent fleet · live',
    bottleneck: 'coreSlots',
    caption: 'Pick a CPU platform below and watch whether sessions queue for a core.',
    loads: { perTaskSpeed: .25, toolNet: .5, coreSlots: .5 },
  },
};

/* Two ProLiant-sellable platforms, same real generational ratio researched
 * for this feature: EPYC Turin tops out at 128 cores; EPYC Venice's dense
 * (Zen6c) config doubles that to 256 cores at a lower per-core clock. The
 * `slots` values here are a proportional (2x) illustration of concurrency
 * capacity for this demo, not a literal core-to-slot mapping — the point
 * is the ratio and the queueing behavior it produces, not a spec sheet. */
export const PLATFORMS = {
  turin: {
    name: 'AMD EPYC Turin',
    detail: '128 cores · high clock',
    slots: 16,
    freq: 1.0,
  },
  venice: {
    name: 'AMD EPYC Venice (dense)',
    detail: '256 cores · lower clock',
    slots: 32,
    freq: 0.82,
  },
};

export const DEFAULT_KNOBS = { platform: 'turin' };

export const KNOBS = {
  platform: {
    type: 'select',
    label: 'CPU Platform',
    options: [
      { value: 'turin', label: 'EPYC Turin · 128c, high clock', shortLabel: 'Turin (128c)' },
      { value: 'venice', label: 'EPYC Venice · 256c, lower clock', shortLabel: 'Venice (256c)' },
    ],
  },
};

// Fixed demand: this many agent sessions arrive per second, and each one
// occupies a slot for this many seconds on average (several tool
// round-trips) before completing — the same real-world demand regardless
// of which platform is picked. Little's Law: offered concurrency = rate x
// hold time = 24 sessions wanting to be resident at once.
export const ARRIVAL_PER_SEC = 8;
export const AVG_HOLD_SEC = 3;
const MAX_QUEUE_DISPLAY = 40;

function stats(knobs) {
  const platform = PLATFORMS[knobs.platform];
  const capacityPerSec = platform.slots / AVG_HOLD_SEC;
  const util = ARRIVAL_PER_SEC / capacityPerSec; // can exceed 1 — queue grows
  return { platform, capacityPerSec, util };
}

export function createState() {
  return {
    phase: 'running', phaseStart: 0,
    knobs: { ...DEFAULT_KNOBS },
    queue: 0,
    sessionCounter: 0,
    completed: 0,
    disp: { perTaskSpeed: 0, toolNet: 0, coreSlots: 0 },
  };
}

export function step(s, dt, speed) {
  const dtSec = dt * speed;
  if (dtSec <= 0) return;
  const { capacityPerSec } = stats(s.knobs);
  s.sessionCounter += ARRIVAL_PER_SEC * dtSec;
  const throughput = Math.min(ARRIVAL_PER_SEC, capacityPerSec);
  s.completed += throughput * dtSec;
  s.queue = Math.max(0, Math.min(MAX_QUEUE_DISPLAY, s.queue + (ARRIVAL_PER_SEC - capacityPerSec) * dtSec));
}

export function targetLoads(s) {
  const { platform, util } = stats(s.knobs);
  return {
    coreSlots: Math.max(0, Math.min(1, util)),
    // Slower clock nudges per-task time up slightly — real, but nowhere
    // near the wall; never crosses out of "cool" on the heat ramp.
    perTaskSpeed: 0.22 + (1 - platform.freq) * 0.5,
    toolNet: 0.5, // flat, platform-independent — the genuine off-box latency
  };
}

/** Highest live utilization wins — same computed-not-authored pattern as
 * cipipeline. toolNet's fixed 0.5 and perTaskSpeed's low, near-flat value
 * mean coreSlots always wins the moment the platform is anywhere near
 * capacity, which is the point: this workload has exactly one resource
 * that's ever in contention. */
export function bottleneckKey(s) {
  const target = targetLoads(s);
  let best = ORDER[0], bestV = -Infinity;
  for (const key of ORDER) {
    if (target[key] > bestV) { bestV = target[key]; best = key; }
  }
  return best;
}

export function caption(s) {
  const { platform, capacityPerSec, util } = stats(s.knobs);
  const utilPct = Math.round(Math.min(1, util) * 100);
  if (s.queue < 0.5) {
    return `${platform.name} (${platform.detail}) has enough concurrent slots for this fleet's arrival rate — ${utilPct}% of capacity, no queue. Per-session speed barely matters here; it's headroom in slot count that's keeping up.`;
  }
  return `${platform.name} (${platform.detail}) is out of core slots at ${utilPct}% of capacity. ${Math.floor(s.queue)} session(s) queued and climbing — every one waiting on a free slot, not a slow core. A faster clock wouldn't help; more concurrent slots would.`;
}

export function reset(s) {
  s.phase = 'running'; s.phaseStart = s.clock;
  s.queue = 0; s.sessionCounter = 0; s.completed = 0;
}

export function headerLabel(s) {
  return `${Math.floor(s.completed)} sessions completed · ${Math.floor(s.queue)} queued`;
}

/** One line per agent session started, then queue-depth lines once the
 * platform can't keep up — derived from state, no rendering-time
 * randomness. */
export function logLines(s) {
  const { platform } = stats(s.knobs);
  const started = Math.floor(s.sessionCounter);
  const lines = [`agent-${1000 + started} started · ${platform.name}`];
  const q = Math.floor(s.queue);
  if (q > 0) {
    lines.push(`${q} agent session(s) queued — waiting for a free core slot`);
  } else {
    lines.push(`all sessions resident · ${platform.slots} slots · ${Math.floor(s.completed)} completed so far`);
  }
  return lines;
}
