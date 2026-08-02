import { describe, it, expect } from 'vitest';
import * as batch from '../workloads/batch/data.js';

function advance(s, totalDt, stepDt = 1 / 60, speed = 1) {
  let elapsed = 0;
  while (elapsed < totalDt) {
    const dt = Math.min(stepDt, totalDt - elapsed);
    s.clock += dt;
    batch.step(s, dt, speed);
    elapsed += dt;
  }
}

describe('batch-serving workload: ramp -> saturated progression', () => {
  it('starts in ramp with no requests admitted', () => {
    const s = batch.createState();
    expect(s.phase).toBe('ramp');
    expect(s.requests).toBe(0);
  });

  it('admits requests up to CAPACITY then flips to saturated', () => {
    const s = batch.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, batch.TIMING.RAMP_DUR + 0.1);
    expect(s.phase).toBe('saturated');
    expect(s.requests).toBe(batch.TIMING.CAPACITY);
  });

  it('stays in ramp with a partial batch before RAMP_DUR elapses', () => {
    const s = batch.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, batch.TIMING.RAMP_DUR * 0.5);
    expect(s.phase).toBe('ramp');
    expect(s.requests).toBeGreaterThan(0);
    expect(s.requests).toBeLessThan(batch.TIMING.CAPACITY);
  });

  it('grows the queue once saturated, capped at MAX_QUEUE', () => {
    const s = batch.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, batch.TIMING.RAMP_DUR + 0.1);
    expect(s.queued).toBe(0);
    advance(s, batch.TIMING.ARRIVAL_BEAT * 3.5);
    expect(s.queued).toBe(3);
    advance(s, batch.TIMING.ARRIVAL_BEAT * 1000);
    expect(s.queued).toBeLessThanOrEqual(batch.TIMING.MAX_QUEUE);
  });

  it('targetLoads fills mem toward capacity as requests are admitted during ramp', () => {
    const s = batch.createState();
    s.clock = 0; s.phaseStart = 0;
    const early = batch.targetLoads(s).mem;
    advance(s, batch.TIMING.RAMP_DUR * 0.5);
    const later = batch.targetLoads(s).mem;
    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThanOrEqual(1);
  });

  it('reset() returns to a fresh ramp with an empty batch and queue', () => {
    const s = batch.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, batch.TIMING.RAMP_DUR + batch.TIMING.ARRIVAL_BEAT * 3);
    expect(s.phase).toBe('saturated');
    batch.reset(s);
    expect(s.phase).toBe('ramp');
    expect(s.requests).toBe(0);
    expect(s.queued).toBe(0);
  });

  it('logLines has one admitted line per resident request, then one queued line per waiting arrival', () => {
    const s = batch.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, batch.TIMING.RAMP_DUR + 0.1);
    expect(batch.logLines(s)).toHaveLength(batch.TIMING.CAPACITY);
    advance(s, batch.TIMING.ARRIVAL_BEAT * 2.5);
    const lines = batch.logLines(s);
    expect(lines).toHaveLength(batch.TIMING.CAPACITY + 2);
    expect(lines[lines.length - 1]).toContain('queued');
  });
});
