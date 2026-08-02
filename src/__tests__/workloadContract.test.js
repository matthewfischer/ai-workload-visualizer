import { describe, it, expect } from 'vitest';
import { WORKLOADS, WORKLOAD_LIST, DEFAULT_WORKLOAD_ID } from '../workloads/index.js';

/* Guards the seam between "code" (engine) and "models" (workloads): every
 * registered workload must implement the shape src/engine/useEngineClock.js
 * and src/engine/Chrome.jsx rely on. This is what should catch a broken
 * new workload (SAP HANA, Oracle, ...) before it ships. */
describe('workload contract', () => {
  it('has at least one registered workload, including the default', () => {
    expect(WORKLOAD_LIST.length).toBeGreaterThan(0);
    expect(WORKLOADS[DEFAULT_WORKLOAD_ID]).toBeDefined();
  });

  it.each(WORKLOAD_LIST)('$id implements the required contract shape', (w) => {
    expect(typeof w.id).toBe('string');
    expect(typeof w.label).toBe('string');
    expect(typeof w.RESOURCES).toBe('object');
    expect(Array.isArray(w.ORDER)).toBe(true);
    expect(typeof w.PHASES).toBe('object');
    expect(typeof w.createState).toBe('function');
    expect(typeof w.step).toBe('function');
    expect(typeof w.reset).toBe('function');
    expect(typeof w.Scene).toBe('function');
  });

  it.each(WORKLOAD_LIST)('$id: every ORDER key has RESOURCES metadata with a helps string', (w) => {
    for (const key of w.ORDER) {
      expect(w.RESOURCES[key]).toBeDefined();
      expect(typeof w.RESOURCES[key].name).toBe('string');
      expect(typeof w.RESOURCES[key].helps).toBe('string');
    }
  });

  it.each(WORKLOAD_LIST)('$id: every phase bottleneck and load key is a real resource in ORDER', (w) => {
    for (const phase of Object.values(w.PHASES)) {
      expect(w.ORDER).toContain(phase.bottleneck);
      for (const key of Object.keys(phase.loads)) {
        expect(w.ORDER).toContain(key);
      }
      for (const key of w.ORDER) {
        expect(phase.loads[key]).toBeGreaterThanOrEqual(0);
        expect(phase.loads[key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(WORKLOAD_LIST)('$id: createState() seeds disp at 0 for every resource', (w) => {
    const s = w.createState();
    expect(w.PHASES[s.phase]).toBeDefined();
    for (const key of w.ORDER) {
      expect(s.disp[key]).toBe(0);
    }
  });
});
