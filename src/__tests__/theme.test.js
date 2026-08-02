import { describe, it, expect } from 'vitest';
import { heat, lerp, bez, pct } from '../engine/theme.js';

describe('heat()', () => {
  it('returns a valid rgb() string across the full range', () => {
    for (let v = 0; v <= 1; v += 0.1) {
      expect(heat(v)).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    }
  });

  it('clamps out-of-range input instead of extrapolating', () => {
    expect(heat(-5)).toBe(heat(0));
    expect(heat(5)).toBe(heat(1));
  });

  it('gets hotter (monotonically, stop to stop) as utilization rises', () => {
    // red channel should not regress as v climbs through the ramp
    const reds = [0, 0.35, 0.55, 0.72, 0.86, 1].map((v) => {
      const [, r] = heat(v).match(/rgb\((\d+),/);
      return Number(r);
    });
    for (let i = 1; i < reds.length; i++) {
      expect(reds[i]).toBeGreaterThanOrEqual(reds[i - 1]);
    }
  });
});

describe('lerp()', () => {
  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('bez()', () => {
  it('starts and ends at the control endpoints', () => {
    const p0 = [0, 0], p1 = [5, 10], p2 = [10, 0];
    expect(bez(p0, p1, p2, 0)).toEqual(p0);
    expect(bez(p0, p1, p2, 1)).toEqual(p2);
  });
});

describe('pct()', () => {
  it('rounds a 0..1 fraction to a whole percent', () => {
    expect(pct(0.5)).toBe(50);
    expect(pct(0.004)).toBe(0);
    expect(pct(0.995)).toBe(100);
  });

  it('treats missing/falsy input as 0', () => {
    expect(pct(undefined)).toBe(0);
    expect(pct(null)).toBe(0);
  });
});
