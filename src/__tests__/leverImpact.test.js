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

  it('rag, cpuinfer, and agentic have no PCIe path modeled at all', () => {
    const skipped = notModeled('pcieLanes');
    expect(skipped).toEqual(expect.arrayContaining(['Answering with retrieval (RAG)', 'Running inference on CPU', 'Running an agent fleet']));
  });

  it('every lever exposes a human-readable label and note', () => {
    for (const lever of Object.values(LEVERS)) {
      expect(lever.label).toBeTruthy();
      expect(lever.note).toBeTruthy();
      expect(lever.factor).toBeGreaterThan(0);
    }
  });

  it('upgraded load is always baseline scaled by the lever factor, clamped to [0,1]', () => {
    const rows = impactRows('pcieLanes');
    for (const r of rows) {
      expect(r.upgraded).toBeCloseTo(Math.min(1, r.baseline * LEVERS.pcieLanes.factor));
    }
  });
});
