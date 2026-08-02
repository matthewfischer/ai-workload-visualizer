import { C, heat } from '../../engine/theme.js';
import { SmallNode, BigNode, HostPanel } from '../../engine/primitives.jsx';
import { PHASES, TIMING, logLines } from './data.js';

/* The fleet: one tile per VM. The first CORE_COUNT tiles have a physical
   core to themselves and stay a calm, contented color; anything beyond
   that is contending for a turn, and heats up with the ready-time load
   once the host is oversubscribed. */
function VMGrid({ x, y, w, h, vmCount, readyUtil, oversubscribed }) {
  const cols = 6, rows = 4;
  const pad = 16, gap = 8;
  const cellW = (w - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = (h - 46 - gap * (rows - 1)) / rows;
  const filled = Math.round(vmCount);
  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    const cx = x + pad + (i % cols) * (cellW + gap);
    const cy = y + 40 + Math.floor(i / cols) * (cellH + gap);
    const on = i < filled;
    const contending = on && oversubscribed && i >= TIMING.COMFORTABLE_VMS;
    const col = contending ? heat(readyUtil) : C.cyan;
    cells.push(
      <rect key={i} x={cx} y={cy} width={cellW} height={cellH} rx={5}
        fill={on ? col : '#141d29'} opacity={on ? (contending ? 0.85 : 0.55) : 1}
        stroke={on ? col : '#233047'} strokeWidth={1} />
    );
  }
  return (
    <g>
      <text x={x + w / 2} y={y + 24} textAnchor="middle" fill={C.ink} fontSize={15} fontWeight={600}>
        VM Fleet <tspan fill={C.mut} fontSize={11} fontFamily={C.mono}>· {filled} / {TIMING.MAX_VMS} powered on</tspan>
      </text>
      {cells}
    </g>
  );
}

export default function NoisyNeighborScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;
  const oversubscribed = state.phase === 'oversubscribed';

  return (
    <>
      <HostPanel x={24} y={14} w={952} h={90} label="PHYSICAL HOST · 8 CORES, FIXED" />
      <SmallNode x={610} y={44} w={170} h={42} label="Host Memory" util={disp.mem} />
      <SmallNode x={796} y={44} w={170} h={42} label="Datastore I/O" util={disp.storage} />

      <VMGrid x={44} y={130} w={520} h={270} vmCount={state.vmCount} readyUtil={disp.ready} oversubscribed={oversubscribed} />

      <BigNode x={610} y={130} w={356} h={170}
        title="CPU Ready" sub="scheduler queue time per vCPU"
        util={disp.ready} bottleneck={bn === 'ready'} idleNote={null} />

      <BigNode x={610} y={320} w={356} h={100}
        title="Host CPU" sub="raw utilization — barely moves"
        util={disp.cpu} bottleneck={bn === 'cpu'} idleNote={null} />
    </>
  );
}

export function headerLabel(state) {
  return state.phase === 'comfortable'
    ? `${Math.round(state.vmCount)} / ${TIMING.COMFORTABLE_VMS} VMs · settling in`
    : `${Math.round(state.vmCount)} / ${TIMING.MAX_VMS} VMs on ${TIMING.CORE_COUNT} cores`;
}

/* Terminal panel: an esxtop-flavored feed of VMs powering on, then their
   %RDY climbing once the host is oversubscribed. */
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
