/* Cross-workload "what does this hardware change actually help" view.
 * Unlike the per-workload KNOBS (agentic's core-count knob, batch's
 * PCIe-gen knob), this doesn't run a live simulation — for each (workload,
 * phase) a lever targets, it builds that workload's default state, asks
 * for its resource loads (via targetLoads() when the workload defines one,
 * so knob-driven workloads like agentic report their *real* default
 * numbers rather than an unused authored fallback — see agentic/data.js,
 * whose PHASES.loads is explicitly a placeholder never read live), scales
 * the targeted resource by the lever's factor, and asks: does that ever
 * change who the bottleneck is?
 *
 * A workload missing from a lever's TARGETS entry has no resource that
 * maps to that lever at all in its model (e.g. cpuinfer has no GPU, so
 * PCIe lanes have nothing to attach to there) — that's reported as "not
 * modeled here", a real answer, not a hidden zero.
 *
 * Factors are hand-authored to be directionally honest (same standard the
 * rest of this project holds itself to — see HANDOFF.md), not measured.
 * Most levers are straightforward upgrades (factor < 1, less pressure on
 * the targeted resource). `dimmsPerChannel` is deliberately two-sided: 2
 * DIMMs/channel raises capacity but drops the JEDEC-supported clock, so it
 * carries a factor > 1 (more pressure) on bandwidth and < 1 (less
 * pressure) on capacity, in the same lever.
 *
 * Scope is deliberately the AI-adjacent workloads only (not cipipeline/
 * redolog/noisyneighbor) — those are explicitly not about swappable
 * silicon (see their own data.js comments), so a hardware lever has
 * nothing meaningful to say about them either way. */

import * as chatbot from '../workloads/chatbot/data.js';
import * as batch from '../workloads/batch/data.js';
import * as training from '../workloads/training/data.js';
import * as cpuinfer from '../workloads/cpuinfer/data.js';
import * as agentic from '../workloads/agentic/data.js';

// `research` (added alongside agentic/batch/etc. as a workload) isn't
// wired in here yet — it has the same real coreSlots/platform concurrency
// math as agentic, so it deserves a proper charted curve (see
// AgenticCoreCountSection in LeverImpact.jsx), not a static single-point
// row that would misreport it as "not modeled." Follow-up, not this pass.
const WORKLOADS = { chatbot, batch, training, cpuinfer, agentic };

export const LEVERS = {
  coreCount: {
    id: 'coreCount',
    label: 'Core Count: 128 → 256',
    note: 'More cores raises concurrency — how many things can run at once. It does almost nothing for a workload that\'s already saturating one big resource (HBM bandwidth, a network fabric); it matters most when the wall is "how many sessions/threads fit," not "how fast is any one of them."',
  },
  coreFreq: {
    id: 'coreFreq',
    label: 'Core Frequency: +25%',
    note: "A faster clock helps per-task speed, not concurrency. Deliberately narrow here: this project hasn't modeled a count-vs-frequency split for host CPU in the GPU workloads, so this lever only touches the two places that split is explicit.",
  },
  coreCache: {
    id: 'coreCache',
    label: 'L3 Cache: 256MB → 512MB',
    note: "More last-level cache reduces how often a working set falls through to DRAM. Only shows up where the CPU itself is doing the heavy lifting — there's no host L3 path into GPU HBM traffic at all.",
  },
  dimmsPerChannel: {
    id: 'dimmsPerChannel',
    label: 'DIMMs per Channel: 1 → 2',
    note: 'A real trade, not a strict upgrade: populating a second DIMM/channel roughly doubles capacity but forces a lower JEDEC-supported clock, so bandwidth pressure goes up while capacity pressure goes down — in the same move.',
  },
  memChannels: {
    id: 'memChannels',
    label: 'Memory Channels: 12 → 16',
    factor: 12 / 16,
    note: "More host DDR5 channels raise the CPU's own memory-bandwidth ceiling. It has nothing to do with GPU HBM bandwidth — a different physical memory system — so this only ever touches CPU-side resources.",
  },
  pcieLanes: {
    id: 'pcieLanes',
    label: 'PCIe Lanes: 64 → 128',
    factor: 0.5,
    note: 'Doubling lane count roughly halves utilization pressure on whatever data crosses that link — it does nothing for traffic that never goes over PCIe at all (GPU-to-GPU NVLink, HBM, a vector-DB network hop).',
  },
  pcieGen: {
    id: 'pcieGen',
    label: 'PCIe Generation: 5.0 → 6.0',
    factor: 0.5,
    note: 'Mechanically the same effect as doubling lane count (PCIe 6.0 doubles per-lane throughput) — listed separately because "we moved to Gen 6" and "we added more lanes" are different claims people actually make, even though the math lands the same place.',
  },
};

// lever -> workload id -> [{ phase, key, factor? }] — which PHASES entries +
// resource key that workload has for this lever, if any. `factor` overrides
// the lever's default factor for that specific (workload, phase, key).
const TARGETS = {
  coreCount: {
    agentic: [{ phase: 'running', key: 'coreSlots', factor: 0.5 }],
    cpuinfer: [
      { phase: 'prefill', key: 'compute', factor: 0.65 },
      { phase: 'decode', key: 'compute', factor: 0.65 },
    ],
    chatbot: [{ phase: 'prefill', key: 'cpu', factor: 0.7 }, { phase: 'decode', key: 'cpu', factor: 0.7 }],
    batch: [{ phase: 'ramp', key: 'cpu', factor: 0.7 }, { phase: 'saturated', key: 'cpu', factor: 0.7 }],
    training: [{ phase: 'compute', key: 'cpu', factor: 0.7 }, { phase: 'allreduce', key: 'cpu', factor: 0.7 }],
  },
  coreFreq: {
    agentic: [{ phase: 'running', key: 'perTaskSpeed', factor: 0.8 }],
    cpuinfer: [
      { phase: 'prefill', key: 'compute', factor: 0.85 },
      { phase: 'decode', key: 'compute', factor: 0.9 },
    ],
  },
  coreCache: {
    cpuinfer: [
      { phase: 'prefill', key: 'memBw', factor: 0.9 },
      { phase: 'decode', key: 'memBw', factor: 0.85 },
    ],
  },
  dimmsPerChannel: {
    cpuinfer: [
      { phase: 'prefill', key: 'memBw', factor: 1.1 },
      { phase: 'decode', key: 'memBw', factor: 1.15 },
      { phase: 'prefill', key: 'mem', factor: 0.6 },
      { phase: 'decode', key: 'mem', factor: 0.55 },
    ],
  },
  memChannels: {
    cpuinfer: [{ phase: 'prefill', key: 'memBw' }, { phase: 'decode', key: 'memBw' }],
  },
  pcieLanes: {
    chatbot: [{ phase: 'prefill', key: 'pcie' }, { phase: 'decode', key: 'pcie' }],
    batch: [{ phase: 'ramp', key: 'pcie' }, { phase: 'saturated', key: 'pcie' }],
    training: [{ phase: 'compute', key: 'pcie' }, { phase: 'allreduce', key: 'pcie' }],
  },
  pcieGen: {
    chatbot: [{ phase: 'prefill', key: 'pcie' }, { phase: 'decode', key: 'pcie' }],
    batch: [{ phase: 'ramp', key: 'pcie' }, { phase: 'saturated', key: 'pcie' }],
    training: [{ phase: 'compute', key: 'pcie' }, { phase: 'allreduce', key: 'pcie' }],
  },
};

function argmaxKey(loads) {
  return Object.entries(loads).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/** relieved / new-wall / still-wall are about who's on top; eased/worsened
 * -not-wall are for a resource that moved meaningfully (>=40%) but was
 * never (before or after) actually the tallest bar; no-effect is everyone
 * else. Handles both directions — a factor > 1 (dimmsPerChannel's
 * bandwidth cost) is exactly as reportable as a factor < 1. */
function verdictFor(before, after, wasBottleneck, isBottleneck) {
  if (wasBottleneck && !isBottleneck) return 'relieved';
  if (!wasBottleneck && isBottleneck) return 'new-wall';
  if (wasBottleneck && isBottleneck) return 'still-wall';
  if (Math.max(before, after) >= 0.4) return after > before ? 'worsened-not-wall' : 'eased-not-wall';
  return 'no-effect';
}

/** One row per (workload, phase, resource) this lever actually touches. */
export function impactRows(leverId) {
  const lever = LEVERS[leverId];
  const targets = TARGETS[leverId] || {};
  const rows = [];
  for (const [wid, specs] of Object.entries(targets)) {
    const w = WORKLOADS[wid];
    for (const spec of specs) {
      const { phase, key } = spec;
      const factor = spec.factor ?? lever.factor;
      const state = w.createState();
      state.phase = phase;
      const loads = w.targetLoads ? w.targetLoads(state) : w.PHASES[phase].loads;
      const baseline = loads[key];
      const upgraded = Math.max(0, Math.min(1, baseline * factor));
      const wasBottleneck = argmaxKey(loads) === key;
      const isBottleneck = argmaxKey({ ...loads, [key]: upgraded }) === key;
      rows.push({
        workloadId: wid,
        workloadLabel: w.label,
        phaseName: w.PHASES[phase].name,
        resourceName: w.RESOURCES[key].name,
        baseline, upgraded,
        verdict: verdictFor(baseline, upgraded, wasBottleneck, isBottleneck),
      });
    }
  }
  return rows;
}

/** The factor a given (lever, workload, resource) target actually uses —
 * exported so the curve charts (curves.js) can stay in sync with TARGETS
 * instead of duplicating magic numbers. */
export function targetFactor(leverId, workloadId, key) {
  const specs = (TARGETS[leverId] || {})[workloadId] || [];
  const spec = specs.find((s) => s.key === key);
  if (!spec) return null;
  return spec.factor ?? LEVERS[leverId].factor;
}

/** Workloads (from the AI-adjacent set above) with no path at all for this
 * lever to attach to — a real "doesn't apply here", not an omission. */
export function notModeled(leverId) {
  const targets = TARGETS[leverId] || {};
  return Object.keys(WORKLOADS)
    .filter((wid) => !(wid in targets))
    .map((wid) => WORKLOADS[wid].label);
}
