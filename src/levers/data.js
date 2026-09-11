/* Cross-workload "what does this hardware change actually help" view.
 * Unlike the per-workload KNOBS (agentic's core-count knob, batch's
 * PCIe-gen knob), this doesn't run a live simulation — it reads each
 * workload's already-authored PHASES loads directly and asks: does
 * scaling this one resource by this lever's factor ever change who the
 * bottleneck is?
 *
 * A workload missing from a lever's TARGETS entry has no resource that
 * maps to that lever at all in its model (e.g. cpuinfer has no GPU, so
 * PCIe lanes have nothing to attach to there) — that's reported as "not
 * modeled here", a real answer, not a hidden zero.
 *
 * Scope is deliberately the AI-adjacent workloads only (not cipipeline/
 * redolog/noisyneighbor) — those are explicitly not about swappable
 * silicon (see their own data.js comments), so a hardware lever has
 * nothing meaningful to say about them either way. */

import * as chatbot from '../workloads/chatbot/data.js';
import * as longctx from '../workloads/longctx/data.js';
import * as batch from '../workloads/batch/data.js';
import * as training from '../workloads/training/data.js';
import * as rag from '../workloads/rag/data.js';
import * as cpuinfer from '../workloads/cpuinfer/data.js';
import * as agentic from '../workloads/agentic/data.js';

const WORKLOADS = { chatbot, longctx, batch, training, rag, cpuinfer, agentic };

export const LEVERS = {
  pcieLanes: {
    id: 'pcieLanes',
    label: 'PCIe Lanes: 64 → 128',
    short: 'PCIe Lanes',
    factor: 0.5, // double the lanes ~ half the utilization for the same data volume
    note: 'Doubling lane count roughly halves utilization pressure on whatever data crosses that link — it does nothing for traffic that never goes over PCIe at all (GPU-to-GPU NVLink, HBM, a vector-DB network hop).',
  },
  memChannels: {
    id: 'memChannels',
    label: 'Memory Channels: 12 → 16',
    short: 'Memory Channels',
    factor: 12 / 16, // Turin (12ch) -> Venice (16ch), researched ratio
    note: "More host DDR5 channels raise the CPU's own memory-bandwidth ceiling. It has nothing to do with GPU HBM bandwidth — a different physical memory system — so this only ever touches CPU-side resources.",
  },
};

// lever -> workload id -> [{ phase, key }] — which PHASES entries + resource
// key that workload has for this lever, if any.
const TARGETS = {
  pcieLanes: {
    chatbot: [{ phase: 'prefill', key: 'pcie' }, { phase: 'decode', key: 'pcie' }],
    longctx: [{ phase: 'ingest', key: 'pcie' }, { phase: 'summarize', key: 'pcie' }],
    batch: [{ phase: 'ramp', key: 'pcie' }, { phase: 'saturated', key: 'pcie' }],
    training: [{ phase: 'compute', key: 'pcie' }, { phase: 'allreduce', key: 'pcie' }],
  },
  memChannels: {
    cpuinfer: [{ phase: 'prefill', key: 'memBw' }, { phase: 'decode', key: 'memBw' }],
  },
};

function argmaxKey(loads) {
  return Object.entries(loads).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/** One row per (workload, phase) this lever actually touches, with a
 * verdict bucket: 'relieved' (was the bottleneck, isn't after) / 'still-wall'
 * (was and remains the bottleneck) / 'eased-not-wall' (meaningfully loaded
 * but never the tallest bar, before or after) / 'no-effect' (barely loaded
 * either way). */
export function impactRows(leverId) {
  const lever = LEVERS[leverId];
  const targets = TARGETS[leverId] || {};
  const rows = [];
  for (const [wid, specs] of Object.entries(targets)) {
    const w = WORKLOADS[wid];
    for (const { phase, key } of specs) {
      const loads = w.PHASES[phase].loads;
      const baseline = loads[key];
      const upgraded = Math.max(0, Math.min(1, baseline * lever.factor));
      const wasBottleneck = argmaxKey(loads) === key;
      const stillBottleneck = argmaxKey({ ...loads, [key]: upgraded }) === key;

      let verdict;
      if (wasBottleneck && !stillBottleneck) verdict = 'relieved';
      else if (wasBottleneck && stillBottleneck) verdict = 'still-wall';
      else if (baseline >= 0.4) verdict = 'eased-not-wall';
      else verdict = 'no-effect';

      rows.push({
        workloadId: wid,
        workloadLabel: w.label,
        phaseName: w.PHASES[phase].name,
        resourceName: w.RESOURCES[key].name,
        baseline, upgraded, verdict,
      });
    }
  }
  return rows;
}

/** Workloads (from the AI-adjacent set above) with no path at all for this
 * lever to attach to — a real "doesn't apply here", not an omission. */
export function notModeled(leverId) {
  const targets = TARGETS[leverId] || {};
  return Object.keys(WORKLOADS)
    .filter((wid) => !(wid in targets))
    .map((wid) => WORKLOADS[wid].label);
}
