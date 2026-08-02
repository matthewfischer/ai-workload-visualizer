import { C, heat } from '../../engine/theme.js';
import { SmallNode, BigNode, FeedLine, Channel } from '../../engine/primitives.jsx';
import { PHASES, TIMING, logLines } from './data.js';

/* This workload's physical story is capacity, not throughput: a grid of KV
   cache slots fills as requests are admitted, and once every slot is full,
   new arrivals pile up in a queue instead of speeding anything up. Kept
   local to this file rather than the shared engine. */
function CapacityGrid({ x, y, w, h, requests, capacity, util, bottleneck }) {
  const col = heat(util);
  const cols = 6, rows = 4;
  const pad = 16, gap = 7;
  const cellW = (w - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = (h - 62 - gap * (rows - 1)) / rows;
  const filled = Math.round(requests);
  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    const cx = x + pad + (i % cols) * (cellW + gap);
    const cy = y + 46 + Math.floor(i / cols) * (cellH + gap);
    const on = i < filled;
    cells.push(
      <rect key={i} x={cx} y={cy} width={cellW} height={cellH} rx={5}
        fill={on ? col : '#141d29'} opacity={on ? 0.85 : 1}
        stroke={on ? col : '#233047'} strokeWidth={1} />
    );
  }
  return (
    <g>
      {bottleneck && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={13} fill="none" stroke={col} strokeWidth={2.5} filter="url(#hot)" />}
      <rect x={x} y={y} width={w} height={h} rx={11} fill={C.panel} stroke={bottleneck ? col : C.steel} strokeWidth={bottleneck ? 2 : 1.3} />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" fill={C.ink} fontSize={15} fontWeight={600}>
        GPU Memory <tspan fill={C.mut} fontSize={11} fontFamily={C.mono}>· KV cache slots</tspan>
      </text>
      {cells}
      <text x={x + w / 2} y={y + h - 10} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono}>{filled} / {capacity} requests resident</text>
    </g>
  );
}

function Queue({ x, y, queued, saturated }) {
  const dots = [];
  for (let i = 0; i < queued; i++) {
    dots.push(<circle key={i} cx={x + 14 + i * 16} cy={y} r={6} fill={saturated ? heat(0.9) : C.steel} />);
  }
  return (
    <g>
      <text x={x} y={y - 16} textAnchor="start" fill={C.mut} fontSize={11} fontFamily={C.mono}>
        {saturated ? `queue · ${queued} waiting for a slot` : 'queue · empty'}
      </text>
      {dots}
    </g>
  );
}

export default function BatchScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;

  return (
    <>
      {/* intake: new requests arrive over the network, routed by the host */}
      <SmallNode x={20} y={26} w={112} h={48} label="Network" util={disp.nic} />
      <SmallNode x={150} y={26} w={112} h={48} label="Host CPU" util={disp.cpu} />
      <FeedLine from={[206, 74]} to={[240, 158]} util={disp.pcie} clock={state.clock} />

      {/* the bandwidth channel: memory -> compute, right to left */}
      <Channel x0={690} x1={350} top={206} bot={294} util={disp.hbmBw} clock={state.clock}
        bottleneck={bn === 'hbmBw'} label="HBM BANDWIDTH" directionHint="◄ batched weights + KV reads" />

      {/* GPU Compute: scheduling matmuls across the whole batch at once */}
      <BigNode x={150} y={158} w={200} h={168}
        title="GPU Compute" sub="batched matmul scheduler"
        util={disp.compute} bottleneck={bn === 'compute'} idleNote={null} />

      {/* GPU Memory: capacity grid of resident KV caches, plus the queue */}
      <CapacityGrid x={690} y={140} w={240} h={235} requests={state.requests} capacity={TIMING.CAPACITY} util={disp.mem} bottleneck={bn === 'mem'} />
      <Queue x={690} y={416} queued={state.queued} saturated={state.phase === 'saturated'} />
    </>
  );
}

export function headerLabel(state) {
  return state.phase === 'ramp'
    ? `${Math.round(state.requests)} / ${TIMING.CAPACITY} requests admitted`
    : `${TIMING.CAPACITY} resident · ${state.queued} queued`;
}

/* Terminal panel: a scrolling admission log, one line per request as it's
   accepted (or queued once the batch is full) — the "watch requests come
   in" console feel of a real inference server. */
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
