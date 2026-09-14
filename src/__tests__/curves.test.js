import { describe, it, expect } from 'vitest';
import { agenticCoreCountCurves, batchLeverCurve } from '../levers/curves.js';
import * as agentic from '../workloads/agentic/data.js';
import * as batch from '../workloads/batch/data.js';

describe('agenticCoreCountCurves: real platform math, not a synthetic factor', () => {
  const { configs, loadMax } = agenticCoreCountCurves();
  const turin = configs.find((c) => c.key === 'turin');
  const venice = configs.find((c) => c.key === 'venice');

  it('Turin saturates at a lower arrival rate than Venice (128c vs 256c-dense)', () => {
    expect(turin.saturatesAt).toBeCloseTo(agentic.PLATFORMS.turin.slots / agentic.AVG_HOLD_SEC);
    expect(venice.saturatesAt).toBeCloseTo(agentic.PLATFORMS.venice.slots / agentic.AVG_HOLD_SEC);
    expect(turin.saturatesAt).toBeLessThan(venice.saturatesAt);
  });

  it('at zero load both platforms show zero core-slot pressure — they only diverge as load climbs', () => {
    expect(turin.coreSlots[0].value).toBe(0);
    expect(venice.coreSlots[0].value).toBe(0);
  });

  it('at max swept load, Turin is pinned at 100% (both eventually saturate within range, Turin much sooner)', () => {
    const last = (arr) => arr[arr.length - 1];
    expect(last(turin.coreSlots).value).toBe(1);
    expect(last(turin.coreSlots).load).toBe(loadMax);
  });

  it('at the load where Turin has just saturated, Venice still has real headroom', () => {
    const atTurinSaturation = venice.coreSlots.find((p) => p.load >= turin.saturatesAt);
    expect(atTurinSaturation.value).toBeLessThan(1);
  });

  it("per-session compute is flat (load-independent) but Venice's is higher — the coupled clock-speed cost", () => {
    const spread = (series) => new Set(series.map((p) => p.value)).size;
    expect(spread(turin.perTaskSpeed)).toBe(1);
    expect(spread(venice.perTaskSpeed)).toBe(1);
    expect(venice.perTaskSpeed[0].value).toBeGreaterThan(turin.perTaskSpeed[0].value);
  });
});

describe('batchLeverCurve: real mem/capacity formula as a reference, lever effect swept over requests', () => {
  it('capacityMark matches batch\'s real CAPACITY constant', () => {
    const { capacityMark } = batchLeverCurve('cpu', 0.7);
    expect(capacityMark).toBe(batch.TIMING.CAPACITY);
  });

  it('baseline and upgraded track together up to CAPACITY, diverging by the given factor', () => {
    const { configs } = batchLeverCurve('pcie', 0.5);
    const baseline = configs.find((c) => c.key === 'baseline');
    const upgraded = configs.find((c) => c.key === 'upgraded');
    const midIdx = Math.floor(baseline.points.length / 4); // well within the ramp region
    expect(upgraded.points[midIdx].value).toBeCloseTo(baseline.points[midIdx].value * 0.5);
  });

  it('the mem/capacity reference line rises during ramp then holds flat at the saturated value past CAPACITY', () => {
    const { memReference } = batchLeverCurve('cpu', 0.7);
    const atCapacity = memReference.find((p) => Math.abs(p.load - batch.TIMING.CAPACITY) < 0.5);
    const last = memReference[memReference.length - 1];
    expect(last.value).toBeCloseTo(batch.PHASES.saturated.loads.mem);
    expect(last.load).toBeGreaterThan(batch.TIMING.CAPACITY);
    expect(atCapacity.value).toBeLessThanOrEqual(last.value + 1e-6);
  });

  it('never exceeds 1 even after the factor is applied', () => {
    const { configs } = batchLeverCurve('cpu', 1.5);
    for (const c of configs) {
      for (const p of c.points) expect(p.value).toBeLessThanOrEqual(1);
    }
  });
});
