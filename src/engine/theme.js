/* Generic visual language shared by every workload: thermal color ramp,
   interpolation helpers, palette. Nothing here knows what a "token" or
   a "redo log" is — that's the workload's job. */

export const C = {
  bg: '#0a0e15', panel: '#0f141d', edge: '#1e2c3e', steel: '#2a3d54',
  ink: '#e8eef6', mut: '#6f8199', cyan: '#54cdda', kv: '#39b3c2', kvEdge: '#2b8c99',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  sans: 'Inter, system-ui, -apple-system, sans-serif',
};

const STOPS = [
  [0.00, [58, 84, 112]], [0.35, [96, 112, 120]], [0.55, [196, 132, 62]],
  [0.72, [236, 142, 56]], [0.86, [255, 92, 56]], [1.00, [255, 178, 140]],
];

/** Utilization (0..1) -> cool steel..amber..red..white-hot rgb() string. */
export function heat(v) {
  v = Math.max(0, Math.min(1, v));
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], t = (v - a) / (b - a);
      return `rgb(${(ca[0] + (cb[0] - ca[0]) * t) | 0},${(ca[1] + (cb[1] - ca[1]) * t) | 0},${(ca[2] + (cb[2] - ca[2]) * t) | 0})`;
    }
  }
  return 'rgb(255,178,140)';
}

export const lerp = (a, b, t) => a + (b - a) * t;

export const bez = (p0, p1, p2, t) => [
  (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
  (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
];

export const pct = (v) => Math.round((v || 0) * 100);
