import { C, heat, lerp, pct } from './theme.js';

/* Generic scene pieces any workload's Scene can compose. Nothing below
   references tokens, prompts, KV caches, or any other AI-specific concept —
   a SAP HANA or Oracle scene would reach for the same primitives. */

export function SmallNode({ x, y, w, h, label, util }) {
  const col = heat(util);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={C.panel} stroke={util > 0.25 ? col : C.steel} strokeWidth={1.3} />
      <text x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle" fill={C.ink} fontSize={14} fontWeight={600} fontFamily={C.sans}>{label}</text>
      <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill={col} fontSize={11} fontFamily={C.mono} fontWeight={700}>{pct(util)}%</text>
    </g>
  );
}

export function BigNode({ x, y, w, h, title, sub, util, bottleneck, idleNote }) {
  const col = heat(util);
  const cx = x + w / 2;
  return (
    <g>
      {bottleneck && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={13} fill="none" stroke={col} strokeWidth={2.5} filter="url(#hot)" />}
      <rect x={x} y={y} width={w} height={h} rx={11} fill={C.panel} stroke={bottleneck ? col : C.steel} strokeWidth={bottleneck ? 2 : 1.3} />
      <text x={cx} y={y + 30} textAnchor="middle" fill={C.ink} fontSize={16} fontWeight={600}>{title}</text>
      <text x={cx} y={y + 48} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono}>{sub}</text>
      <text x={cx} y={y + h / 2 + 26} textAnchor="middle" fill={col} fontSize={32} fontWeight={800} fontFamily={C.mono}>{pct(util)}%</text>
      {idleNote && <text className="idle" x={cx} y={y + h - 16} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono}>◷ {idleNote}</text>}
    </g>
  );
}

export function FeedLine({ from, to, util, clock }) {
  const col = heat(util);
  const n = Math.round(util * 5);
  const dots = [];
  for (let i = 0; i < n; i++) {
    const t = (clock * 0.3 + i / Math.max(1, n)) % 1;
    dots.push([lerp(from[0], to[0], t), lerp(from[1], to[1], t)]);
  }
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={C.steel} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
      {dots.map((d, i) => <circle key={i} cx={d[0]} cy={d[1]} r={2.4} fill={col} />)}
    </g>
  );
}

/**
 * A directional bandwidth channel between two points: a walled duct with
 * flowing particles, a label, and a hero percentage. Reusable for any
 * "stuff moves through a pipe and that pipe can saturate" resource —
 * HBM reads, a disk I/O path, a network fabric, a redo log stream.
 */
export function Channel({ x0, x1, top, bot, util, clock, bottleneck, label, directionHint }) {
  const cy = (top + bot) / 2;
  const col = heat(util);
  const lanes = [];
  const laneCount = 6;
  for (let i = 0; i < laneCount; i++) lanes.push(lerp(top + 8, bot - 8, i / (laneCount - 1)));
  const perLane = Math.round(util * 5);
  const speed = 0.22 + util * 0.45;
  const dots = [];
  lanes.forEach((ly, li) => {
    for (let i = 0; i < perLane; i++) {
      const t = (clock * speed + i / Math.max(1, perLane) + li * 0.13) % 1;
      dots.push([lerp(x0, x1, t), ly]);
    }
  });
  return (
    <g>
      <rect x={Math.min(x0, x1)} y={top} width={Math.abs(x0 - x1)} height={bot - top} rx={10} fill="#0c131d" stroke={bottleneck ? col : C.steel} strokeWidth={bottleneck ? 2 : 1.2}
        filter={util > 0.8 ? 'url(#hot)' : undefined} opacity={0.95} />
      <rect x={Math.min(x0, x1)} y={top} width={Math.abs(x0 - x1)} height={bot - top} rx={10} fill={col} opacity={0.10 + 0.14 * util} />
      {dots.map((d, i) => <circle key={i} cx={d[0]} cy={d[1]} r={2.8} fill={col} opacity={0.55 + 0.45 * util} />)}
      <text x={(x0 + x1) / 2} y={cy - 6} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono} letterSpacing={1}>{label}</text>
      <text x={(x0 + x1) / 2} y={cy + 22} textAnchor="middle" fill={col} fontSize={30} fontWeight={800} fontFamily={C.mono}>{pct(util)}%</text>
      {directionHint && <text x={Math.min(x0, x1) + 14} y={bot + 15} textAnchor="start" fill={C.mut} fontSize={10} fontFamily={C.mono}>{directionHint}</text>}
    </g>
  );
}
