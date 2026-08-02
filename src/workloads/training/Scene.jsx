import { C } from '../../engine/theme.js';
import { SmallNode, BigNode, FeedLine, Channel } from '../../engine/primitives.jsx';
import { PHASES, logLines } from './data.js';

/* HANDOFF.md flagged that training needs a different visual mode than the
   single-pipeline inference token-loop — this is that mode: several GPU
   nodes in parallel, all wired into a shared network fabric that only
   lights up during all-reduce. Nothing here is reused by other workloads. */
const GPU_COUNT = 4;
const GPU_X = [40, 270, 500, 730];
const GPU_Y = 100, GPU_W = 200, GPU_H = 120;
const FABRIC_TOP = 260, FABRIC_BOT = 330;

export default function TrainingScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;

  return (
    <>
      {/* data loader feeding the first GPU's batch shard */}
      <SmallNode x={20} y={16} w={140} h={44} label="Data Loader" util={disp.cpu} />
      <FeedLine from={[90, 60]} to={[140, 100]} util={disp.pcie} clock={state.clock} />

      {/* GPU cluster: identical nodes, each computing its own shard */}
      {GPU_X.map((x, i) => (
        <BigNode key={i} x={x} y={GPU_Y} w={GPU_W} h={GPU_H}
          title={`GPU ${i}`} sub="tensor cores"
          util={disp.compute} bottleneck={bn === 'compute'}
          idleNote={state.phase === 'allreduce' ? 'waiting on sync' : null} />
      ))}

      {/* each GPU's link down into the shared fabric */}
      {GPU_X.map((x, i) => (
        <FeedLine key={i} from={[x + GPU_W / 2, GPU_Y + GPU_H]} to={[x + GPU_W / 2, FABRIC_TOP]} util={disp.pcie} clock={state.clock} />
      ))}

      {/* the network fabric (HERO during all-reduce): every GPU exchanges gradients */}
      <Channel x0={40} x1={930} top={FABRIC_TOP} bot={FABRIC_BOT} util={disp.nic} clock={state.clock}
        bottleneck={bn === 'nic'} label="NETWORK FABRIC" directionHint="⇄ gradients exchanged across every GPU" />

      {/* optimizer states / activations resident in HBM */}
      <SmallNode x={380} y={358} w={240} h={56} label="Optimizer / Activations" util={disp.mem} />
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
