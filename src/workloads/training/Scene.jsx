import { C, heat, pct } from '../../engine/theme.js';
import { FeedLine, Channel, HostPanel, PathComparison } from '../../engine/primitives.jsx';
import { GPUS_PER_NODE, GPUS_PER_SOCKET, INTERCONNECT_PATHS, NODE_COUNT, PHASES, SOCKETS_PER_NODE, logLines } from './data.js';

/* HANDOFF.md flagged that training needs a different visual mode than the
   single-pipeline inference token-loop: several GPUs per host node, then a
   cross-node all-reduce fabric. Nothing here is reused by other workloads. */
const NODE_W = 430;
const NODE_H = 238;
const NODE_Y = 10;
const NODE_X = [34, 536];
const SOCKET_W = 190;
const SOCKET_H = 182;
const SOCKET_Y = NODE_Y + 42;
const SOCKET_GAP = 18;
const CPU_W = 78;
const CPU_H = 32;
const CPU_OFFSET_X = 10;
const CPU_OFFSET_Y = 24;
const GPU_W = 38;
const GPU_H = 40;
const FABRIC_TOP = 260;
const FABRIC_BOT = 314;

function TinyNode({ x, y, w, h, label, util }) {
  const col = heat(util);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill={C.panel} stroke={util > 0.25 ? col : C.steel} strokeWidth={1.1} />
      <text x={x + w / 2} y={y + 14} textAnchor="middle" fill={C.ink} fontSize={10.5} fontWeight={700}>{label}</text>
      <text x={x + w / 2} y={y + 27} textAnchor="middle" fill={col} fontSize={10} fontWeight={800} fontFamily={C.mono}>{pct(util)}%</text>
    </g>
  );
}

function MiniGpu({ x, y, label, util, bottleneck, idleNote }) {
  const col = heat(util);
  return (
    <g>
      {bottleneck && <rect x={x - 2} y={y - 2} width={GPU_W + 4} height={GPU_H + 4} rx={8} fill="none" stroke={col} strokeWidth={1.8} filter="url(#hot)" />}
      <rect x={x} y={y} width={GPU_W} height={GPU_H} rx={7} fill={C.panel} stroke={bottleneck ? col : C.steel} strokeWidth={bottleneck ? 1.5 : 1.1} />
      <text x={x + GPU_W / 2} y={y + 15} textAnchor="middle" fill={C.ink} fontSize={10} fontWeight={700}>{label}</text>
      <text x={x + GPU_W / 2} y={y + 31} textAnchor="middle" fill={col} fontSize={10} fontWeight={800} fontFamily={C.mono}>{pct(util)}%</text>
      {idleNote && <text className="idle" x={x + GPU_W / 2} y={y + GPU_H + 11} textAnchor="middle" fill={C.mut} fontSize={7.5} fontFamily={C.mono}>{idleNote}</text>}
    </g>
  );
}

function pathPressure(state) {
  const factor = state.phase === 'allreduce' ? 1 : 0.38;
  return INTERCONNECT_PATHS.map((p) => ({ ...p, util: Math.min(1, p.pressure * factor) }));
}

function LinkRail({ x0, x1, y, util, clock }) {
  const col = heat(util);
  const dots = [];
  const n = Math.max(1, Math.round(util * 6));
  for (let i = 0; i < n; i++) {
    dots.push(x0 + ((clock * (0.2 + util * 0.45) + i / n) % 1) * (x1 - x0));
  }

  return (
    <g>
      <rect x={x0} y={y} width={x1 - x0} height={22} rx={7} fill="#0c131d" stroke={C.steel} strokeWidth={1.1} />
      <rect x={x0} y={y} width={(x1 - x0) * util} height={22} rx={7} fill={col} opacity={0.16} />
      {dots.map((cx, i) => <circle key={i} cx={cx} cy={y + 11} r={2.2} fill={col} opacity={0.55 + util * 0.35} />)}
      <text x={(x0 + x1) / 2} y={y + 14} textAnchor="middle" fill={C.mut} fontSize={8.5} fontFamily={C.mono}>NVLINK DOMAIN</text>
    </g>
  );
}

function CpuInterconnect({ nodeX, util, clock }) {
  const col = heat(util);
  const cpuY = SOCKET_Y + CPU_OFFSET_Y;
  const yTop = SOCKET_Y - 8;
  const socket0X = nodeX + 16;
  const socket1X = socket0X + SOCKET_W + SOCKET_GAP;
  const x0 = socket0X + CPU_OFFSET_X + CPU_W / 2;
  const x1 = socket1X + CPU_OFFSET_X + CPU_W / 2;
  const dots = [];
  const n = Math.max(1, Math.round(util * 5));
  for (let i = 0; i < n; i++) {
    dots.push(x0 + ((clock * (0.16 + util * 0.35) + i / n) % 1) * (x1 - x0));
  }

  return (
    <g>
      <path d={`M ${x0} ${cpuY} V ${yTop} H ${x1} V ${cpuY}`} fill="none" stroke={C.steel} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.78} />
      <path d={`M ${x0} ${yTop} H ${x1}`} fill="none" stroke={col} strokeWidth={1.8} strokeLinecap="round" opacity={0.32 + util * 0.42} />
      {dots.map((cx, i) => <circle key={i} cx={cx} cy={yTop} r={2.1} fill={col} opacity={0.55 + util * 0.35} />)}
      <text x={(x0 + x1) / 2} y={yTop - 5} textAnchor="middle" fill={C.mut} fontSize={8.5} fontFamily={C.mono}>UPI / QPI</text>
    </g>
  );
}

function SocketGroup({ nodeIndex, socketIndex, x, state, disp, bottleneckKey }) {
  const gpuGap = (SOCKET_W - 20 - GPUS_PER_SOCKET * GPU_W) / (GPUS_PER_SOCKET - 1);
  const gpuY = SOCKET_Y + 82;
  const gpuXs = Array.from({ length: GPUS_PER_SOCKET }, (_, i) => x + 10 + i * (GPU_W + gpuGap));
  const cpuX = x + CPU_OFFSET_X;
  const switchX = x + 100;
  const ioY = SOCKET_Y + CPU_OFFSET_Y;
  const railY = SOCKET_Y + 144;
  const gpuOffset = nodeIndex * GPUS_PER_NODE + socketIndex * GPUS_PER_SOCKET;

  return (
    <g>
      <rect x={x} y={SOCKET_Y} width={SOCKET_W} height={SOCKET_H} rx={10} fill={C.bg} stroke={C.edge} strokeWidth={1.1} />
      <text x={x + 10} y={SOCKET_Y + 16} textAnchor="start" fill={C.mut} fontSize={9} fontWeight={700} fontFamily={C.mono}>SOCKET {socketIndex}</text>
      <TinyNode x={cpuX} y={ioY} w={CPU_W} h={CPU_H} label={`CPU ${socketIndex}`} util={disp.cpu} />
      <TinyNode x={switchX} y={ioY} w={78} h={32} label="PCIe SW" util={disp.pcie} />
      <FeedLine from={[cpuX + CPU_W, ioY + CPU_H / 2]} to={[switchX, ioY + CPU_H / 2]} util={disp.pcie} clock={state.clock} />

      {gpuXs.map((gx, i) => (
        <FeedLine key={`pcie-${i}`} from={[switchX + 39, ioY + CPU_H]} to={[gx + GPU_W / 2, gpuY]} util={disp.pcie} clock={state.clock} />
      ))}
      <text x={x + SOCKET_W / 2} y={gpuY - 8} textAnchor="middle" fill={C.mut} fontSize={8.5} fontFamily={C.mono}>PCIe fan-out to all 4 GPUs</text>

      {gpuXs.map((gx, i) => (
        <MiniGpu key={i} x={gx} y={gpuY} label={`G${gpuOffset + i}`}
          util={disp.compute} bottleneck={bottleneckKey === 'compute'}
          idleNote={state.phase === 'allreduce' ? 'wait' : null} />
      ))}

      {gpuXs.map((gx, i) => (
        <FeedLine key={`link-${i}`} from={[gx + GPU_W / 2, gpuY + GPU_H]} to={[gx + GPU_W / 2, railY]} util={disp.gpuLink} clock={state.clock} />
      ))}
      <LinkRail x0={x + 10} x1={x + SOCKET_W - 10} y={railY} util={disp.gpuLink} clock={state.clock} />
    </g>
  );
}

function NodeGroup({ nodeIndex, x, state, disp, bottleneckKey }) {
  const nodeLabel = `NODE ${nodeIndex + 1} · 2 CPUs · ${GPUS_PER_NODE} GPUs`;
  const socketXs = Array.from({ length: SOCKETS_PER_NODE }, (_, i) => x + 16 + i * (SOCKET_W + SOCKET_GAP));

  return (
    <g>
      <HostPanel x={x} y={NODE_Y} w={NODE_W} h={NODE_H} label={nodeLabel} />
      {socketXs.map((sx, i) => (
        <SocketGroup key={i} nodeIndex={nodeIndex} socketIndex={i} x={sx} state={state} disp={disp} bottleneckKey={bottleneckKey} />
      ))}
      <CpuInterconnect nodeX={x} util={disp.cpuLink} clock={state.clock} />
    </g>
  );
}

export default function TrainingScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;

  return (
    <>
      {NODE_X.slice(0, NODE_COUNT).map((x, i) => (
        <NodeGroup key={i} nodeIndex={i} x={x} state={state} disp={disp} bottleneckKey={bn} />
      ))}

      {NODE_X.slice(0, NODE_COUNT).map((x, i) => (
        <FeedLine key={i} from={[x + NODE_W / 2, NODE_Y + NODE_H]} to={[x + NODE_W / 2, FABRIC_TOP]} util={disp.nic} clock={state.clock} />
      ))}

      {/* cross-node network fabric (HERO during all-reduce) */}
      <Channel x0={80} x1={920} top={FABRIC_TOP} bot={FABRIC_BOT} util={disp.nic} clock={state.clock}
        bottleneck={bn === 'nic'} label="CROSS-NODE NETWORK FABRIC" />

      <PathComparison x={150} y={326} w={700} rowHeight={24}
        title="GPU-GPU path pressure for the same gradient chunk" paths={pathPressure(state)} clock={state.clock} />
    </>
  );
}

export function headerLabel(state) {
  return `step ${state.trainStep} · ${state.phase === 'compute' ? 'computing' : 'syncing gradients'}`;
}

/* Terminal panel: a classic training-loop console — loss ticking down per
   step, alternating with an all-reduce sync line. Loss/timing are fake
   (not measured), same spirit as the hand-authored load profiles. */
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
