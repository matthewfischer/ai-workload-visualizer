import { describe, it, expect } from 'vitest';
import * as cpuinfer from '../workloads/cpuinfer/data.js';
import * as chatbot from '../workloads/chatbot/data.js';

function advance(mod, s, totalDt, stepDt = 1 / 60, speed = 1) {
  let elapsed = 0;
  while (elapsed < totalDt) {
    const dt = Math.min(stepDt, totalDt - elapsed);
    s.clock += dt;
    mod.step(s, dt, speed);
    elapsed += dt;
  }
}

describe('cpuinfer workload: prefill -> decode progression', () => {
  it('starts in prefill', () => {
    const s = cpuinfer.createState();
    expect(s.phase).toBe('prefill');
  });

  it('transitions to decode once PREFILL_DUR elapses', () => {
    const s = cpuinfer.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(cpuinfer, s, cpuinfer.TIMING.PREFILL_DUR + 0.1);
    expect(s.phase).toBe('decode');
    expect(s.tokens).toBe(0);
  });

  it('stays in prefill before PREFILL_DUR elapses', () => {
    const s = cpuinfer.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(cpuinfer, s, cpuinfer.TIMING.PREFILL_DUR - 0.1);
    expect(s.phase).toBe('prefill');
  });

  it('increments tokens roughly once per BEAT during decode', () => {
    const s = cpuinfer.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(cpuinfer, s, cpuinfer.TIMING.PREFILL_DUR + 0.1);
    advance(cpuinfer, s, cpuinfer.TIMING.BEAT * 3.5);
    expect(s.tokens).toBe(3);
  });

  it('grows KV monotonically and caps it at 0.9', () => {
    const s = cpuinfer.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(cpuinfer, s, cpuinfer.TIMING.PREFILL_DUR + 0.1);
    let prevKv = s.kv;
    advance(cpuinfer, s, cpuinfer.TIMING.BEAT * 5);
    expect(s.kv).toBeGreaterThanOrEqual(prevKv);
    advance(cpuinfer, s, cpuinfer.TIMING.BEAT * 1000);
    expect(s.kv).toBeLessThanOrEqual(0.9);
  });

  it('reset() returns to a fresh prefill run', () => {
    const s = cpuinfer.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(cpuinfer, s, cpuinfer.TIMING.PREFILL_DUR + cpuinfer.TIMING.BEAT * 3);
    expect(s.phase).toBe('decode');
    cpuinfer.reset(s);
    expect(s.phase).toBe('prefill');
    expect(s.tokens).toBe(0);
    expect(s.kv).toBe(0);
  });

  it('targetLoads keeps mem load in range and rising with kv during decode', () => {
    const s = cpuinfer.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(cpuinfer, s, cpuinfer.TIMING.PREFILL_DUR + 0.1);
    const early = cpuinfer.targetLoads(s).mem;
    advance(cpuinfer, s, cpuinfer.TIMING.BEAT * 20);
    const later = cpuinfer.targetLoads(s).mem;
    expect(later).toBeGreaterThanOrEqual(early);
    expect(later).toBeLessThanOrEqual(1);
  });

  it('beatProgress is -1 during prefill and cycles 0..1 during decode', () => {
    const s = cpuinfer.createState();
    s.clock = 0; s.phaseStart = 0;
    expect(cpuinfer.beatProgress(s, 1)).toBe(-1);
    advance(cpuinfer, s, cpuinfer.TIMING.PREFILL_DUR + 0.1);
    const bt = cpuinfer.beatProgress(s, 1);
    expect(bt).toBeGreaterThanOrEqual(0);
    expect(bt).toBeLessThan(1);
  });

  it('revealedResponse grows word-by-word and clamps at the full response', () => {
    expect(cpuinfer.revealedResponse(0)).toBe('');
    expect(cpuinfer.revealedResponse(1)).toBe(cpuinfer.RESPONSE_WORDS[0]);
    expect(cpuinfer.revealedResponse(3)).toBe(cpuinfer.RESPONSE_WORDS.slice(0, 3).join(' '));
    expect(cpuinfer.revealedResponse(9999)).toBe(cpuinfer.RESPONSE_WORDS.join(' '));
  });

  it('paces both prefill and decode slower than chatbot\'s GPU pacing — the felt "lower ceiling"', () => {
    expect(cpuinfer.TIMING.PREFILL_DUR).toBeGreaterThan(chatbot.TIMING.PREFILL_DUR);
    expect(cpuinfer.TIMING.BEAT).toBeGreaterThan(chatbot.TIMING.BEAT);
  });

  it('prefill bottleneck is compute (AMX) and decode bottleneck is memory bandwidth, same shape as chatbot', () => {
    expect(cpuinfer.PHASES.prefill.bottleneck).toBe('compute');
    expect(cpuinfer.PHASES.decode.bottleneck).toBe('memBw');
  });
});
