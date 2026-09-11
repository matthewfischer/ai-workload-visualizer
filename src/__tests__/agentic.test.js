import { describe, it, expect } from 'vitest';
import * as ag from '../workloads/agentic/data.js';

function advance(s, totalDt, stepDt = 1 / 60, speed = 1) {
  let elapsed = 0;
  while (elapsed < totalDt) {
    const dt = Math.min(stepDt, totalDt - elapsed);
    s.clock += dt;
    ag.step(s, dt, speed);
    elapsed += dt;
  }
}

describe('agentic workload: computed (not authored) bottleneck', () => {
  it('starts on the Turin platform with zeroed counters', () => {
    const s = ag.createState();
    expect(s.knobs).toEqual(ag.DEFAULT_KNOBS);
    expect(s.knobs.platform).toBe('turin');
    expect(s.queue).toBe(0);
    expect(s.sessionCounter).toBe(0);
  });

  it('core slots is always the bottleneck — the one resource in real contention', () => {
    const s = ag.createState();
    expect(ag.bottleneckKey(s)).toBe('coreSlots');
    s.knobs = { ...s.knobs, platform: 'venice' };
    expect(ag.bottleneckKey(s)).toBe('coreSlots');
  });

  it('Turin (128c) is undersized for the fixed arrival rate — utilization pins at 100% and a queue builds', () => {
    const s = ag.createState();
    advance(s, 15);
    expect(ag.targetLoads(s).coreSlots).toBe(1);
    expect(s.queue).toBeGreaterThan(0);
  });

  it('Venice (256c) clears the same arrival rate with no queue', () => {
    const s = ag.createState();
    s.knobs = { ...s.knobs, platform: 'venice' };
    advance(s, 15);
    expect(ag.targetLoads(s).coreSlots).toBeLessThan(1);
    expect(s.queue).toBe(0);
  });

  it('per-session compute never approaches the bottleneck on either platform — speed was never the constraint', () => {
    const s = ag.createState();
    advance(s, 15);
    expect(ag.targetLoads(s).perTaskSpeed).toBeLessThan(0.5);
    s.knobs = { ...s.knobs, platform: 'venice' };
    advance(s, 15);
    expect(ag.targetLoads(s).perTaskSpeed).toBeLessThan(0.5);
  });

  it('switching from Turin to Venice mid-run raises capacity so the queue stops growing', () => {
    const s = ag.createState();
    advance(s, 10);
    const queuedOnTurin = s.queue;
    expect(queuedOnTurin).toBeGreaterThan(0);
    s.knobs = { ...s.knobs, platform: 'venice' };
    advance(s, 10);
    expect(s.queue).toBeLessThan(queuedOnTurin);
  });

  it('reset() zeroes queue/counters but preserves the tuned platform knob', () => {
    const s = ag.createState();
    s.knobs = { ...s.knobs, platform: 'venice' };
    advance(s, 10);
    ag.reset(s);
    expect(s.queue).toBe(0);
    expect(s.sessionCounter).toBe(0);
    expect(s.completed).toBe(0);
    expect(s.knobs.platform).toBe('venice');
  });

  it('caption() names the queue on Turin and calls out headroom on Venice', () => {
    const s = ag.createState();
    advance(s, 15);
    expect(ag.caption(s)).toContain('queued');
    s.knobs = { ...s.knobs, platform: 'venice' };
    ag.reset(s);
    advance(s, 15);
    expect(ag.caption(s)).toContain('no queue');
  });

  it('headerLabel() reports completed and queued as non-negative counts', () => {
    const s = ag.createState();
    advance(s, 10);
    expect(ag.headerLabel(s)).toMatch(/\d+ sessions completed · \d+ queued/);
  });

  it('logLines() reports a growing queue once Turin is saturated', () => {
    const s = ag.createState();
    advance(s, 15);
    const lines = ag.logLines(s);
    expect(lines.some((l) => l.includes('queued'))).toBe(true);
  });
});
