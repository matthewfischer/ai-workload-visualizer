import { describe, it, expect } from 'vitest';
import * as chatbot from '../workloads/chatbot/data.js';

function advance(s, totalDt, stepDt = 1 / 60, speed = 1) {
  let elapsed = 0;
  while (elapsed < totalDt) {
    const dt = Math.min(stepDt, totalDt - elapsed);
    s.clock += dt;
    chatbot.step(s, dt, speed);
    elapsed += dt;
  }
}

describe('chatbot workload: prefill -> decode progression', () => {
  it('starts in prefill', () => {
    const s = chatbot.createState();
    expect(s.phase).toBe('prefill');
  });

  it('transitions to decode once PREFILL_DUR elapses', () => {
    const s = chatbot.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, chatbot.TIMING.PREFILL_DUR + 0.1);
    expect(s.phase).toBe('decode');
    expect(s.tokens).toBe(0);
  });

  it('stays in prefill before PREFILL_DUR elapses', () => {
    const s = chatbot.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, chatbot.TIMING.PREFILL_DUR - 0.1);
    expect(s.phase).toBe('prefill');
  });

  it('increments tokens roughly once per BEAT during decode', () => {
    const s = chatbot.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, chatbot.TIMING.PREFILL_DUR + 0.1); // enter decode
    advance(s, chatbot.TIMING.BEAT * 3.5);
    expect(s.tokens).toBe(3);
  });

  it('grows KV monotonically and caps it at 0.9', () => {
    const s = chatbot.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, chatbot.TIMING.PREFILL_DUR + 0.1);
    let prevKv = s.kv;
    advance(s, chatbot.TIMING.BEAT * 5);
    expect(s.kv).toBeGreaterThanOrEqual(prevKv);
    advance(s, chatbot.TIMING.BEAT * 1000);
    expect(s.kv).toBeLessThanOrEqual(0.9);
  });

  it('reset() returns to a fresh prefill run', () => {
    const s = chatbot.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, chatbot.TIMING.PREFILL_DUR + chatbot.TIMING.BEAT * 3);
    expect(s.phase).toBe('decode');
    chatbot.reset(s);
    expect(s.phase).toBe('prefill');
    expect(s.tokens).toBe(0);
    expect(s.kv).toBe(0);
  });

  it('targetLoads keeps mem load in range and rising with kv during decode', () => {
    const s = chatbot.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, chatbot.TIMING.PREFILL_DUR + 0.1);
    const early = chatbot.targetLoads(s).mem;
    advance(s, chatbot.TIMING.BEAT * 20);
    const later = chatbot.targetLoads(s).mem;
    expect(later).toBeGreaterThanOrEqual(early);
    expect(later).toBeLessThanOrEqual(1);
  });

  it('beatProgress is -1 during prefill and cycles 0..1 during decode', () => {
    const s = chatbot.createState();
    s.clock = 0; s.phaseStart = 0;
    expect(chatbot.beatProgress(s, 1)).toBe(-1);
    advance(s, chatbot.TIMING.PREFILL_DUR + 0.1);
    const bt = chatbot.beatProgress(s, 1);
    expect(bt).toBeGreaterThanOrEqual(0);
    expect(bt).toBeLessThan(1);
  });
});
