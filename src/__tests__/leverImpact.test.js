import { describe, it, expect } from 'vitest';
import { LEVERS, impactRows, notModeled } from '../levers/data.js';

describe('lever impact: static read of each workload\'s authored PHASES loads', () => {
  it('PCIe lanes never relieves a bottleneck across the currently modeled workloads', () => {
    const rows = impactRows('pcieLanes');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.verdict !== 'relieved')).toBe(true);
  });

  it('training\'s all-reduce phase shows PCIe meaningfully loaded but not the wall', () => {
    const rows = impactRows('pcieLanes');
    const row = rows.find((r) => r.workloadId === 'training' && r.phaseName === 'Gradient all-reduce');
    expect(row).toBeTruthy();
    expect(row.baseline).toBeGreaterThanOrEqual(0.4);
    expect(row.verdict).toBe('eased-not-wall');
  });

  it('batch\'s saturated phase shows PCIe as a true no-effect (low baseline, never the wall)', () => {
    const rows = impactRows('pcieLanes');
    const row = rows.find((r) => r.workloadId === 'batch' && r.phaseName === 'Batch at capacity');
    expect(row).toBeTruthy();
    expect(row.verdict).toBe('no-effect');
  });

  it('memory channels only ever touches cpuinfer among the modeled workloads', () => {
    const rows = impactRows('memChannels');
    expect(rows.every((r) => r.workloadId === 'cpuinfer')).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('cpuinfer and agentic have no PCIe path modeled at all', () => {
    const skipped = notModeled('pcieLanes');
    expect(skipped).toEqual(expect.arrayContaining(['Running inference on CPU', 'Running an agent fleet']));
  });

  it('every lever exposes a human-readable label and note', () => {
    for (const lever of Object.values(LEVERS)) {
      expect(lever.label).toBeTruthy();
      expect(lever.note).toBeTruthy();
    }
  });

  it('upgraded load is always baseline scaled by the lever factor, clamped to [0,1]', () => {
    const rows = impactRows('pcieLanes');
    for (const r of rows) {
      expect(r.upgraded).toBeCloseTo(Math.min(1, r.baseline * LEVERS.pcieLanes.factor));
    }
  });

  it('PCIe Generation mirrors PCIe Lanes — same physical effect, different framing', () => {
    expect(impactRows('pcieGen')).toEqual(impactRows('pcieLanes'));
  });

  it('core count reports agentic\'s real live default (Turin, 100% pinned), not its unused authored fallback (50%)', () => {
    const row = impactRows('coreCount').find((r) => r.workloadId === 'agentic');
    expect(row).toBeTruthy();
    expect(row.baseline).toBe(1);
  });

  it('core count barely touches GPU workloads\' Host CPU resource — never their bottleneck', () => {
    const rows = impactRows('coreCount').filter((r) => r.workloadId !== 'agentic' && r.workloadId !== 'cpuinfer');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.verdict === 'no-effect' || r.verdict === 'eased-not-wall')).toBe(true);
  });

  it('core frequency only touches agentic and cpuinfer — the two places count vs. frequency is explicitly modeled', () => {
    const rows = impactRows('coreFreq');
    expect(rows.every((r) => r.workloadId === 'agentic' || r.workloadId === 'cpuinfer')).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('DIMMs per channel is a real two-sided trade on cpuinfer: bandwidth gets worse, capacity gets better', () => {
    const rows = impactRows('dimmsPerChannel');
    const bw = rows.filter((r) => r.resourceName === 'System Memory Bandwidth');
    const cap = rows.filter((r) => r.resourceName === 'System Memory Capacity');
    expect(bw.length).toBeGreaterThan(0);
    expect(cap.length).toBeGreaterThan(0);
    expect(bw.every((r) => r.upgraded > r.baseline)).toBe(true);
    expect(cap.every((r) => r.upgraded < r.baseline)).toBe(true);
  });
});
