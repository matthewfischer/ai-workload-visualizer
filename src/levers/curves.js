/* Load-swept curves for the two workloads that already have genuine
 * concurrency math in their own data.js — agentic (arrival rate vs. core
 * slots) and batch (concurrent requests vs. KV-cache capacity). Every
 * other workload in this app is a single-request prefill/decode loop with
 * no concurrency dimension modeled at all, so a "load axis" for them would
 * be invented, not real — LeverImpact.jsx keeps those as single-point rows
 * rather than fake a sweep here.
 *
 * This directly answers the "no effect... or not enough load to show a
 * difference?" question: instead of one snapshot, plot utilization across
 * the full range of demand and let the divergence (or lack of one) speak
 * for itself. */

import * as agentic from '../workloads/agentic/data.js';
import * as batch from '../workloads/batch/data.js';

function range(steps, max) {
  return Array.from({ length: steps }, (_, i) => (i / (steps - 1)) * max);
}

/** Core Count on agentic: Turin (128c) vs. Venice (256c-dense), using the
 * workload's real PLATFORMS data — not a synthetic factor. Two paired
 * series per platform: Core Slots (rises with load, the thing that
 * actually saturates) and Per-Session Compute (flat — doesn't depend on
 * load at all, only on the platform's clock, which is the coupled cost:
 * Venice's lower clock nudges this up a little, in exchange for double the
 * slots). */
export function agenticCoreCountCurves() {
  const loadMax = 16; // sessions/sec arriving — comfortably past both platforms' saturation point
  const loads = range(33, loadMax);
  const platformSeries = (key, dashed) => {
    const platform = agentic.PLATFORMS[key];
    const capacityPerSec = platform.slots / agentic.AVG_HOLD_SEC;
    const perTaskSpeed = 0.22 + (1 - platform.freq) * 0.5;
    return {
      key, label: platform.name, detail: platform.detail, dashed,
      coreSlots: loads.map((load) => ({ load, value: Math.min(1, load / capacityPerSec) })),
      perTaskSpeed: loads.map((load) => ({ load, value: perTaskSpeed })),
      saturatesAt: capacityPerSec <= loadMax ? capacityPerSec : null,
    };
  };
  return {
    xLabel: 'agent sessions arriving per second',
    loadMax,
    configs: [platformSeries('turin', true), platformSeries('venice', false)],
  };
}

const BATCH_LOAD_MAX = batch.TIMING.CAPACITY * 2;

/** Ramps linearly from 0 toward the authored `ramp`-phase value as
 * requests climb to CAPACITY (mirrors mem's own real formula for shape,
 * though only mem's is the simulator's actual per-tick formula — cpu/pcie
 * have no per-request formula in the sim itself, so this is a labeled
 * interpolation, not a second real formula), then holds at the authored
 * `saturated`-phase value once queueing starts — matching the real step()
 * behavior, where nothing about resource load changes once saturated,
 * only queue depth does. */
function rampThenHold(requests, rampVal, saturatedVal) {
  if (requests <= batch.TIMING.CAPACITY) return rampVal * (requests / batch.TIMING.CAPACITY);
  return saturatedVal;
}

/** batch's actual bottleneck (mem/HBM capacity) using its real formula —
 * plotted as a reference so a lever that touches a different resource
 * (cpu, pcie) visibly does NOT move this line. Answers "if one part speeds
 * up, does the wall move elsewhere, or not move at all?" — here, honestly,
 * it doesn't move, because neither Core Count nor PCIe touches capacity. */
function batchMemReference() {
  const loads = range(33, BATCH_LOAD_MAX);
  return loads.map((requests) => ({
    load: requests,
    value: requests <= batch.TIMING.CAPACITY
      ? 0.12 + (requests / batch.TIMING.CAPACITY) * 0.6
      : batch.PHASES.saturated.loads.mem,
  }));
}

/** One lever's effect on batch's `key` resource, baseline vs. upgraded
 * (factor applied to both the ramp and saturated authored values), plus
 * the real mem/capacity line for reference. */
export function batchLeverCurve(resourceKey, factor) {
  const loads = range(33, BATCH_LOAD_MAX);
  const ramp = batch.PHASES.ramp.loads[resourceKey];
  const saturated = batch.PHASES.saturated.loads[resourceKey];
  const baseline = loads.map((requests) => ({ load: requests, value: rampThenHold(requests, ramp, saturated) }));
  const upgraded = loads.map((requests) => ({ load: requests, value: Math.max(0, Math.min(1, rampThenHold(requests, ramp, saturated) * factor)) }));
  return {
    xLabel: 'concurrent requests',
    loadMax: BATCH_LOAD_MAX,
    capacityMark: batch.TIMING.CAPACITY,
    configs: [
      { key: 'baseline', label: 'today', dashed: true, points: baseline },
      { key: 'upgraded', label: 'upgraded', dashed: false, points: upgraded },
    ],
    memReference: batchMemReference(),
  };
}
