import { C, heat } from '../../engine/theme.js';
import { SmallNode, BigNode, HostPanel } from '../../engine/primitives.jsx';
import { PLATFORMS, ARRIVAL_PER_SEC, AVG_HOLD_SEC, bottleneckKey, logLines } from './data.js';

// Fixed offered concurrency (Little's Law: arrival rate x hold time) — how
// many sessions "want" to be resident at once, regardless of platform.
const OFFERED = ARRIVAL_PER_SEC * AVG_HOLD_SEC;

/* One cell per core slot. A platform with more slots draws a bigger grid —
   the visual payoff of swapping the knob. Cells beyond the offered
   concurrency stay dark: unused headroom. Sessions that can't fit in any
   slot at all don't get a cell — they show up as the queued count instead. */
function SessionGrid({ x, y, w, h, slots, activeCount, queued, util, label }) {
  const cols = 8;
  const rows = Math.ceil(slots / cols);
  const pad = 16, gap = 7;
  const cellW = (w - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = Math.min(36, (h - 40 - gap * (rows - 1)) / rows);
  const col = heat(util);
  const cells = [];
  for (let i = 0; i < slots; i++) {
    const cx = x + pad + (i % cols) * (cellW + gap);
    const cy = y + 34 + Math.floor(i / cols) * (cellH + gap);
    const on = i < activeCount;
    cells.push(
      <rect key={i} x={cx} y={cy} width={cellW} height={cellH} rx={5}
        fill={on ? col : '#141d29'} opacity={on ? 0.9 : 1}
        stroke={on ? col : '#233047'} strokeWidth={1} />
    );
  }
  return (
    <g>
      <text x={x + w / 2} y={y + 20} textAnchor="middle" fill={C.ink} fontSize={14} fontWeight={600}>
        {label}
        <tspan fill={C.mut} fontSize={11} fontFamily={C.mono}> · {activeCount}/{slots} slots busy</tspan>
        {queued > 0 && <tspan fill={col} fontSize={11} fontFamily={C.mono} fontWeight={800}> · {queued} queued</tspan>}
      </text>
      {cells}
    </g>
  );
}

export default function AgenticScene({ state, disp }) {
  const platform = PLATFORMS[state.knobs.platform];
  const bn = bottleneckKey(state);
  const activeCount = Math.min(platform.slots, OFFERED);
  const queued = Math.floor(state.queue);

  return (
    <>
      <HostPanel x={24} y={14} w={952} h={100} label={`${platform.name.toUpperCase()} · ${platform.detail}`} />

      <SessionGrid x={44} y={130} w={540} h={280} slots={platform.slots} activeCount={activeCount}
        queued={queued} util={disp.coreSlots} label="Agent Sessions" />

      <BigNode x={608} y={130} w={360} h={150}
        title="Core Slots" sub="concurrent sessions vs. capacity"
        util={disp.coreSlots} bottleneck={bn === 'coreSlots'} idleNote={null} />

      <SmallNode x={608} y={300} w={172} h={54} label="Per-Session Compute" util={disp.perTaskSpeed} />
      <SmallNode x={796} y={300} w={172} h={54} label="Tool-Call Network" util={disp.toolNet} />

      <text x={500} y={430} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono}>
        arrival: {ARRIVAL_PER_SEC}/sec constant · offered demand ≈ {OFFERED} concurrent sessions, same on every platform
      </text>
    </>
  );
}

export { headerLabel } from './data.js';

/* Terminal panel: a log-line feed of agent sessions starting, then
   queue-depth lines once the platform runs out of slots. */
export function Terminal({ state }) {
  const lines = logLines(state).slice(-8);
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} style={{ color: i === lines.length - 1 ? C.ink : C.mut }}>{l}</div>
      ))}
      <span className="idle" style={{ color: C.cyan }}>▍</span>
    </>
  );
}
