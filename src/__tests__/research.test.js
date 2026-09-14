import { describe, it, expect } from 'vitest';
import * as research from '../workloads/research/data.js';

function advance(s, totalDt, stepDt = 1 / 60, speed = 1) {
  let elapsed = 0;
  while (elapsed < totalDt) {
    const dt = Math.min(stepDt, totalDt - elapsed);
    s.clock += dt;
    research.step(s, dt, speed);
    elapsed += dt;
  }
}

describe('research workload: per-task phase cycle', () => {
  it('starts on Turin, 3 hops, at the first web-search phase', () => {
    const s = research.createState();
    expect(s.knobs).toEqual(research.DEFAULT_KNOBS);
    expect(s.phase).toBe('webSearch');
    expect(s.hopIndex).toBe(0);
  });

  it('cycles web -> docs -> synthesize, incrementing hopIndex each pass', () => {
    const s = research.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, 1.2 + 0.05); // past webSearch's duration
    expect(s.phase).toBe('docSearch');
    advance(s, 1.0 + 0.05);
    expect(s.phase).toBe('synthesize');
    advance(s, 1.4 + 0.05);
    expect(s.hopIndex).toBe(1);
    expect(s.phase).toBe('webSearch'); // hops=3 default, still more hops to go
  });

  it('moves to generate once hopIndex reaches the hops knob, then starts a new task', () => {
    const s = research.createState();
    s.clock = 0; s.phaseStart = 0;
    s.knobs = { ...s.knobs, hops: 1 };
    advance(s, 1.2 + 1.0 + 1.4 + 0.1); // one full web->docs->synthesize pass
    expect(s.phase).toBe('generate');
    advance(s, 1.8 + 0.1);
    expect(s.phase).toBe('webSearch');
    expect(s.hopIndex).toBe(0);
    expect(s.taskCount).toBe(1);
  });
});

describe('research workload: concurrency is Little\'s Law over hop-scaled hold time', () => {
  it('more hops raises the hold time and therefore the utilization, for the same platform', () => {
    const low = research.createState();
    low.knobs = { ...low.knobs, hops: 1 };
    const high = research.createState();
    high.knobs = { ...high.knobs, hops: 6 };
    expect(research.targetLoads(high).coreSlots).toBeGreaterThan(research.targetLoads(low).coreSlots);
  });

  it('Venice (256c) tolerates more hops than Turin (128c) before saturating', () => {
    const s = research.createState();
    s.knobs = { ...s.knobs, hops: 6, platform: 'turin' };
    const turinUtil = research.targetLoads(s).coreSlots;
    s.knobs = { ...s.knobs, platform: 'venice' };
    const veniceUtil = research.targetLoads(s).coreSlots;
    expect(veniceUtil).toBeLessThan(turinUtil);
  });

  it('bottleneckKey falls back to core slots when concurrency is the real wall, overriding the phase\'s nominal bottleneck', () => {
    const s = research.createState();
    s.knobs = { ...s.knobs, hops: 6, platform: 'turin' }; // deep hops, undersized platform
    expect(research.targetLoads(s).coreSlots).toBe(1);
    expect(research.bottleneckKey(s)).toBe('coreSlots');
  });

  it('queue grows over time once saturated', () => {
    const s = research.createState();
    s.knobs = { ...s.knobs, hops: 6, platform: 'turin' };
    advance(s, 20);
    expect(s.queue).toBeGreaterThan(0);
  });

  it('reset() zeroes queue/hop/task counters but preserves the tuned knobs', () => {
    const s = research.createState();
    s.knobs = { ...s.knobs, hops: 5, platform: 'venice' };
    advance(s, 10);
    research.reset(s);
    expect(s.queue).toBe(0);
    expect(s.hopIndex).toBe(0);
    expect(s.taskCount).toBe(0);
    expect(s.knobs.hops).toBe(5);
    expect(s.knobs.platform).toBe('venice');
  });

  it('caption() names concurrency as the wall only when core slots actually wins', () => {
    const s = research.createState();
    s.knobs = { ...s.knobs, hops: 6, platform: 'turin' };
    expect(research.caption(s)).toContain('out of core slots');
    s.knobs = { ...s.knobs, hops: 1, platform: 'venice' };
    expect(research.caption(s)).not.toContain('out of core slots');
  });

  it('headerLabel() reports hop, task, and queue counts', () => {
    const s = research.createState();
    expect(research.headerLabel(s)).toMatch(/hop \d+\/\d+ · task \d+ · \d+ queued/);
  });
});
