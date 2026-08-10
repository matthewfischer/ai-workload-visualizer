import { describe, it, expect } from 'vitest';
import * as ci from '../workloads/cipipeline/data.js';

function advance(s, totalDt, stepDt = 1 / 60, speed = 1) {
  let elapsed = 0;
  while (elapsed < totalDt) {
    const dt = Math.min(stepDt, totalDt - elapsed);
    s.clock += dt;
    ci.step(s, dt, speed);
    elapsed += dt;
  }
}

describe('cipipeline workload: computed (not authored) bottleneck', () => {
  it('starts idle with default knobs and zeroed counters', () => {
    const s = ci.createState();
    expect(s.knobs).toEqual(ci.DEFAULT_KNOBS);
    expect(s.prCounter).toBe(0);
    for (const key of Object.keys(s.queues)) expect(s.queues[key]).toBe(0);
  });

  it('default knobs make PR Review the bottleneck (too few reviewers for the dev pool)', () => {
    const s = ci.createState();
    expect(ci.bottleneckKey(s)).toBe('review');
  });

  it('write/devtest utilization never exceeds 1 — devs pace the pipeline, never queue on themselves', () => {
    const s = ci.createState();
    const target = ci.targetLoads(s);
    expect(target.write).toBeLessThanOrEqual(1);
    expect(target.devtest).toBeLessThanOrEqual(1);
  });

  it("review's queue grows over time while it's the bottleneck", () => {
    const s = ci.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, 20);
    expect(s.queues.review).toBeGreaterThan(0);
  });

  it('downstream-of-bottleneck stages stay idle (low utilization, no queue) while review is congested', () => {
    const s = ci.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, 20);
    expect(s.queues.merge).toBe(0);
    expect(s.queues.postQA).toBe(0);
    const target = ci.targetLoads(s);
    expect(target.merge).toBeLessThan(0.5);
    expect(target.postQA).toBeLessThan(0.5);
  });

  it('adding reviewers via setKnob-equivalent (mutating state.knobs) relieves review and shifts the bottleneck', () => {
    const s = ci.createState();
    s.knobs = { ...s.knobs, reviewers: 20 };
    expect(ci.bottleneckKey(s)).not.toBe('review');
  });

  it('increasing developer count without adding capacity elsewhere raises every downstream utilization', () => {
    const s = ci.createState();
    const before = ci.targetLoads(s).ciTest;
    s.knobs = { ...s.knobs, numDevs: 40 };
    const after = ci.targetLoads(s).ciTest;
    expect(after).toBeGreaterThan(before);
  });

  it('reset() zeroes queues/counters but preserves tuned knobs', () => {
    const s = ci.createState();
    s.knobs = { ...s.knobs, reviewers: 20 };
    s.clock = 0; s.phaseStart = 0;
    advance(s, 20);
    ci.reset(s);
    expect(s.queues.review).toBe(0);
    expect(s.completed.review).toBe(0);
    expect(s.prCounter).toBe(0);
    expect(s.knobs.reviewers).toBe(20);
  });

  it('caption() names the live bottleneck stage', () => {
    const s = ci.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, 20);
    expect(ci.caption(s)).toContain('PR Review');
  });

  it('logLines() reports a growing queue for the bottleneck stage', () => {
    const s = ci.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, 20);
    const lines = ci.logLines(s);
    expect(lines.some((l) => l.includes('PR Review') && l.includes('queued'))).toBe(true);
  });

  it('headerLabel() reports PRs opened and released as non-negative counts', () => {
    const s = ci.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, 10);
    const label = ci.headerLabel(s);
    expect(label).toMatch(/\d+ PRs opened · \d+ released/);
  });
});
