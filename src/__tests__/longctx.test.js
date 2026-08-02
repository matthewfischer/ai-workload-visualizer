import { describe, it, expect } from 'vitest';
import * as longctx from '../workloads/longctx/data.js';

function advance(s, totalDt, stepDt = 1 / 60, speed = 1) {
  let elapsed = 0;
  while (elapsed < totalDt) {
    const dt = Math.min(stepDt, totalDt - elapsed);
    s.clock += dt;
    longctx.step(s, dt, speed);
    elapsed += dt;
  }
}

describe('long-context workload: ingest -> summarize progression', () => {
  it('starts in ingest', () => {
    const s = longctx.createState();
    expect(s.phase).toBe('ingest');
  });

  it('transitions to summarize once INGEST_DUR elapses, with pages capped at TOTAL_PAGES', () => {
    const s = longctx.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, longctx.TIMING.INGEST_DUR + 0.1);
    expect(s.phase).toBe('summarize');
    expect(s.tokens).toBe(0);
    expect(s.pages).toBeLessThanOrEqual(longctx.TIMING.TOTAL_PAGES);
  });

  it('stays in ingest before INGEST_DUR elapses', () => {
    const s = longctx.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, longctx.TIMING.INGEST_DUR - 0.2);
    expect(s.phase).toBe('ingest');
  });

  it('increments tokens roughly once per BEAT during summarize', () => {
    const s = longctx.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, longctx.TIMING.INGEST_DUR + 0.1);
    advance(s, longctx.TIMING.BEAT * 3.5);
    expect(s.tokens).toBe(3);
  });

  it('targetLoads fills mem toward the full context as pages climb during ingest', () => {
    const s = longctx.createState();
    s.clock = 0; s.phaseStart = 0;
    const early = longctx.targetLoads(s).mem;
    advance(s, longctx.TIMING.INGEST_DUR * 0.6);
    const later = longctx.targetLoads(s).mem;
    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThanOrEqual(1);
  });

  it('reset() returns to a fresh ingest run', () => {
    const s = longctx.createState();
    s.clock = 0; s.phaseStart = 0;
    advance(s, longctx.TIMING.INGEST_DUR + longctx.TIMING.BEAT * 3);
    expect(s.phase).toBe('summarize');
    longctx.reset(s);
    expect(s.phase).toBe('ingest');
    expect(s.pages).toBe(0);
    expect(s.tokens).toBe(0);
  });

  it('beatProgress is -1 during ingest and cycles 0..1 during summarize', () => {
    const s = longctx.createState();
    s.clock = 0; s.phaseStart = 0;
    expect(longctx.beatProgress(s, 1)).toBe(-1);
    advance(s, longctx.TIMING.INGEST_DUR + 0.1);
    const bt = longctx.beatProgress(s, 1);
    expect(bt).toBeGreaterThanOrEqual(0);
    expect(bt).toBeLessThan(1);
  });

  it('ingestLogLines grows one line per whole page, referencing the running total', () => {
    expect(longctx.ingestLogLines(0)).toEqual([]);
    expect(longctx.ingestLogLines(2.9)).toHaveLength(2);
    expect(longctx.ingestLogLines(2.9)[1]).toContain(`2/${longctx.TIMING.TOTAL_PAGES}`);
  });

  it('revealedSummary grows word-by-word and clamps at the full summary', () => {
    expect(longctx.revealedSummary(0)).toBe('');
    expect(longctx.revealedSummary(1)).toBe(longctx.SUMMARY_WORDS[0]);
    expect(longctx.revealedSummary(9999)).toBe(longctx.SUMMARY_WORDS.join(' '));
  });
});
