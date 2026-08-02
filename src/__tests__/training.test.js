import { describe, it, expect } from 'vitest';
import * as training from '../workloads/training/data.js';

function advance(s, totalDt, stepDt = 1 / 60, speed = 1) {
  let elapsed = 0;
  while (elapsed < totalDt) {
    const dt = Math.min(stepDt, totalDt - elapsed);
    s.clock += dt;
    training.step(s, dt, speed);
    elapsed += dt;
  }
}

describe('training workload: compute <-> all-reduce loop', () => {
  it('starts in compute at step 0', () => {
    const s = training.createState();
    expect(s.phase).toBe('compute');
    expect(s.trainStep).toBe(0);
  });

  it('transitions to allreduce once COMPUTE_DUR elapses, without incrementing the step yet', () => {
    const s = training.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, training.TIMING.COMPUTE_DUR + 0.1);
    expect(s.phase).toBe('allreduce');
    expect(s.trainStep).toBe(0);
  });

  it('returns to compute and increments trainStep once ALLREDUCE_DUR elapses', () => {
    const s = training.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, training.TIMING.COMPUTE_DUR + 0.1);
    advance(s, training.TIMING.ALLREDUCE_DUR + 0.1);
    expect(s.phase).toBe('compute');
    expect(s.trainStep).toBe(1);
  });

  it('keeps looping across many steps', () => {
    const s = training.createState();
    s.clock = 0; s.phaseStart = 0;
    const cycle = training.TIMING.COMPUTE_DUR + training.TIMING.ALLREDUCE_DUR + 0.2;
    advance(s, cycle * 5);
    expect(s.trainStep).toBeGreaterThanOrEqual(4);
    expect(['compute', 'allreduce']).toContain(s.phase);
  });

  it('reset() returns to a fresh compute phase at step 0', () => {
    const s = training.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, training.TIMING.COMPUTE_DUR + training.TIMING.ALLREDUCE_DUR + 0.1);
    expect(s.trainStep).toBe(1);
    training.reset(s);
    expect(s.phase).toBe('compute');
    expect(s.trainStep).toBe(0);
  });

  it('logLines adds a forward/backward + all-reduce pair per completed step, plus the in-flight step', () => {
    const s = training.createState();
    s.clock = 0; s.phaseStart = 0;
    expect(training.logLines(s)).toEqual([expect.stringContaining('step 0 · forward/backward')]);
    advance(s, training.TIMING.COMPUTE_DUR + 0.1);
    expect(training.logLines(s).at(-1)).toContain('syncing');
    advance(s, training.TIMING.ALLREDUCE_DUR + 0.1);
    const lines = training.logLines(s);
    expect(lines[0]).toContain('step 0 · forward/backward');
    expect(lines[1]).toContain('step 0 · all-reduce · synced');
    expect(lines.at(-1)).toContain('step 1 · forward/backward');
  });
});
