import { C, heat, lerp, bez, pct } from '../../engine/theme.js';
import { SmallNode, BigNode, FeedLine, Channel, HostPanel, PathComparison } from '../../engine/primitives.jsx';
import { beatProgress, GPU_SHARDS, INTERCONNECT_PATHS, PHASES, PROMPT, isMultiGpu, revealedResponse } from './data.js';

/* Pieces below are specific to this workload's physical story (weights +
   KV cache living in HBM, one append per generated token) and stay local
   to this file rather than living in the shared engine. */

const SHARD_W = 178;
const SHARD_H = 134;
const SHARD_Y = 150;
const SHARD_LEFT = 70;
const SHARD_GAP = (1000 - SHARD_LEFT * 2 - GPU_SHARDS * SHARD_W) / (GPU_SHARDS - 1);
const SHARD_X = Array.from({ length: GPU_SHARDS }, (_, i) => SHARD_LEFT + i * (SHARD_W + SHARD_GAP));

function AppendArc({ beatT }) {
  const p0 = [250, 158], p1 = [500, 42], p2 = [770, 150];
  const active = beatT >= 0;
  const pt = active ? bez(p0, p1, p2, beatT) : null;
  const d = `M ${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
  return (
    <g>
      <path d={d} fill="none" stroke={C.kvEdge} strokeWidth={1.4} strokeDasharray="3 6" opacity={0.5} />
      <text x={p1[0]} y={p1[1] - 6} textAnchor="middle" fill={C.mut} fontSize={10} fontFamily={C.mono}>append new token {'->'} KV cache</text>
      {pt && <circle cx={pt[0]} cy={pt[1]} r={4.5} fill={C.kv} filter="url(#hot)" />}
    </g>
  );
}

function Memory({ x, y, w, h, kv, util, bottleneck, tokens, phase }) {
  const col = heat(util);
  const innerX = x + 12, innerW = w - 24;
  const innerTop = y + 40, innerBot = y + h - 14;
  const wTop = innerBot - 80;
  const kvAvail = wTop - innerTop - 6;
  const kvH = Math.max(6, kvAvail * kv);
  return (
    <g>
      {bottleneck && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={13} fill="none" stroke={col} strokeWidth={2.5} filter="url(#hot)" />}
      <rect x={x} y={y} width={w} height={h} rx={11} fill={C.panel} stroke={bottleneck ? col : C.steel} strokeWidth={bottleneck ? 2 : 1.3} />
      <text x={x + w / 2} y={y + 24} textAnchor="middle" fill={C.ink} fontSize={15} fontWeight={600}>
        GPU Memory <tspan fill={C.mut} fontSize={11} fontFamily={C.mono}>· HBM</tspan>
      </text>
      <rect x={innerX} y={wTop} width={innerW} height={80} rx={6} fill="#1a2c40" stroke="#2f4c68" strokeWidth={1} />
      <text x={innerX + innerW / 2} y={wTop + 46} textAnchor="middle" fill="#9db9d6" fontSize={12} fontFamily={C.mono}>Weights</text>
      <text x={innerX + innerW / 2} y={wTop + 28} textAnchor="middle" fill="#6c88a6" fontSize={10} fontFamily={C.mono}>the model</text>
      <rect x={innerX} y={wTop - 6 - kvH} width={innerW} height={kvH} rx={6} fill={C.kv} opacity={0.28} />
      <rect x={innerX} y={wTop - 6 - kvH} width={innerW} height={kvH} rx={6} fill="none" stroke={C.kvEdge} strokeWidth={1.2} />
      <text x={innerX + innerW / 2} y={wTop - 14} textAnchor="middle" fill="#bfe9ef" fontSize={11} fontFamily={C.mono}>
        KV cache{phase === 'decode' ? ` · ${tokens} tok` : ''}
      </text>
    </g>
  );
}

function ShardGpu({ x, y, idx, state, disp, bottleneck, beatT }) {
  const computeCol = heat(disp.compute);
  const memCol = heat(disp.mem);
  const bwCol = heat(disp.hbmBw);
  const kvW = (SHARD_W - 28) * state.kv;
  const tokenX = x + 14 + Math.max(4, kvW);
  const tokenY = y + 102 + (beatT >= 0 ? beatT * 10 : 0);

  return (
    <g>
      {bottleneck && <rect x={x - 4} y={y - 4} width={SHARD_W + 8} height={SHARD_H + 8} rx={13} fill="none" stroke={bottleneck === 'compute' ? computeCol : bwCol} strokeWidth={2.3} filter="url(#hot)" />}
      <rect x={x} y={y} width={SHARD_W} height={SHARD_H} rx={11} fill={C.panel} stroke={bottleneck ? (bottleneck === 'compute' ? computeCol : bwCol) : C.steel} strokeWidth={bottleneck ? 1.8 : 1.2} />
      <text x={x + SHARD_W / 2} y={y + 23} textAnchor="middle" fill={C.ink} fontSize={14} fontWeight={700}>GPU {idx}</text>
      <text x={x + SHARD_W / 2} y={y + 39} textAnchor="middle" fill={C.mut} fontSize={10} fontFamily={C.mono}>model shard {idx + 1}/{GPU_SHARDS}</text>

      <rect x={x + 14} y={y + 50} width={SHARD_W - 28} height={32} rx={7} fill="#111a27" stroke={bottleneck === 'compute' ? computeCol : C.steel} strokeWidth={1.1} />
      <text x={x + 26} y={y + 70} textAnchor="start" fill={C.mut} fontSize={10} fontFamily={C.mono}>compute</text>
      <text x={x + SHARD_W - 26} y={y + 70} textAnchor="end" fill={computeCol} fontSize={13} fontWeight={800} fontFamily={C.mono}>{pct(disp.compute)}%</text>

      <rect x={x + 14} y={y + 92} width={SHARD_W - 28} height={30} rx={7} fill="#1a2c40" stroke={bottleneck === 'hbmBw' ? bwCol : C.steel} strokeWidth={1.1} />
      <rect x={x + 14} y={y + 92} width={kvW} height={30} rx={7} fill={C.kv} opacity={0.30} />
      <text x={x + 26} y={y + 111} textAnchor="start" fill="#9db9d6" fontSize={10} fontFamily={C.mono}>HBM + KV</text>
      <text x={x + SHARD_W - 26} y={y + 111} textAnchor="end" fill={memCol} fontSize={13} fontWeight={800} fontFamily={C.mono}>{pct(disp.mem)}%</text>
      {beatT >= 0 && <circle cx={tokenX} cy={tokenY} r={3.8} fill={C.kv} filter="url(#hot)" />}
    </g>
  );
}

function pathPressure(state) {
  const factor = state.phase === 'decode' ? 1 : 0.72;
  return INTERCONNECT_PATHS.map((p) => ({ ...p, util: Math.min(1, p.pressure * factor) }));
}

function Output({ x, yTop, yBot, beatT }) {
  const active = beatT >= 0;
  const y = active ? lerp(yTop, yBot, beatT) : null;
  return (
    <g>
      <line x1={x} y1={yTop} x2={x} y2={yBot} stroke={C.steel} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.6} />
      <text x={x + 10} y={yBot + 2} textAnchor="start" fill={C.mut} fontSize={11} fontFamily={C.mono}>→ token out</text>
      {y !== null && <circle cx={x} cy={y} r={4} fill={C.cyan} filter="url(#hot)" />}
    </g>
  );
}

function HostIngress({ state, disp, to }) {
  return (
    <>
      <HostPanel x={44} y={14} w={312} h={100} />
      <SmallNode x={132} y={28} w={96} h={42} label="Host CPU" util={disp.cpu} />
      <SmallNode x={246} y={28} w={96} h={42} label="Host Mem" util={disp.hostMem} />
      <SmallNode x={8} y={42} w={100} h={44} label="Network" util={disp.nic} />
      <FeedLine from={[180, 70]} to={to} util={disp.pcie} clock={state.clock} label="PCIe ingress" />
    </>
  );
}

function SingleGpuScene({ state, disp, beatT, bottleneckKey }) {
  return (
    <>
      <HostIngress state={state} disp={disp} to={[250, 158]} />

      <Channel x0={690} x1={350} top={206} bot={294} util={disp.hbmBw} clock={state.clock}
        bottleneck={bottleneckKey === 'hbmBw'} label="HBM BANDWIDTH" directionHint="weights + KV read into compute" />

      <AppendArc beatT={beatT} />

      <BigNode x={150} y={158} w={200} h={168}
        title="GPU Compute" sub="tensor / matrix cores"
        util={disp.compute} bottleneck={bottleneckKey === 'compute'}
        idleNote={state.phase === 'decode' ? 'mostly waiting' : null} />

      <Memory x={690} y={140} w={224} h={206} kv={state.kv} util={disp.mem}
        bottleneck={bottleneckKey === 'mem'} tokens={state.tokens} phase={state.phase} />

      <Output x={250} yTop={326} yBot={372} beatT={beatT} />
    </>
  );
}

function MultiGpuScene({ state, disp, beatT, bottleneckKey }) {
  return (
    <>
      <HostIngress state={state} disp={disp} to={[SHARD_X[0] + SHARD_W / 2, SHARD_Y]} />

      <PathComparison x={382} y={14} w={570} title="GPU-GPU path pressure for the same shard exchange" paths={pathPressure(state)} clock={state.clock} />

      <text x={500} y={143} textAnchor="middle" fill={C.mut} fontSize={10} fontFamily={C.mono} letterSpacing={0.8}>tensor-parallel GPU-GPU collectives</text>

      {SHARD_X.map((x, i) => (
        <ShardGpu key={i} x={x} y={SHARD_Y} idx={i} state={state} disp={disp}
          bottleneck={bottleneckKey === 'compute' || bottleneckKey === 'hbmBw' ? bottleneckKey : null} beatT={beatT} />
      ))}

      {SHARD_X.slice(0, -1).map((x, i) => (
        <FeedLine key={i} from={[x + SHARD_W, SHARD_Y + 66]} to={[SHARD_X[i + 1], SHARD_Y + 66]}
          util={disp.gpuLink} clock={state.clock} />
      ))}

      <Channel x0={80} x1={920} top={300} bot={354} util={disp.hbmBw} clock={state.clock}
        bottleneck={bottleneckKey === 'hbmBw'} label="HBM BANDWIDTH ON EACH SHARD" directionHint="weights + KV reread before each token" />

      <Output x={500} yTop={354} yBot={394} beatT={beatT} />
    </>
  );
}

export default function ChatbotScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;
  const beatT = beatProgress(state, state.speed);

  return isMultiGpu(state)
    ? <MultiGpuScene state={state} disp={disp} beatT={beatT} bottleneckKey={bn} />
    : <SingleGpuScene state={state} disp={disp} beatT={beatT} bottleneckKey={bn} />;
}

export function headerLabel(state) {
  return state.phase === 'decode' ? `token ${state.tokens}` : 'reading prompt…';
}

/* Terminal panel content — plain HTML/text (not SVG), rendered by App.jsx
   inside the shared engine/TerminalWindow chrome. During prefill it shows
   the prompt "loading"; during decode the canned response is revealed
   word-by-word as `state.tokens` climbs, matching the KV shard pulses. */
export function Terminal({ state }) {
  if (state.phase === 'prefill') {
    const dots = '.'.repeat(1 + Math.floor(state.clock * 2) % 3);
    return (
      <>
        <span style={{ color: C.mut }}>$ loading prompt{dots}</span>{'\n'}
        <span style={{ color: C.ink }}>&gt; {PROMPT}</span>
      </>
    );
  }
  return (
    <>
      <span style={{ color: C.mut }}>&gt; {PROMPT}</span>{'\n\n'}
      <span style={{ color: C.ink }}>{revealedResponse(state.tokens)}</span>
      <span className="idle" style={{ color: C.cyan }}>▍</span>
    </>
  );
}

export { pct };
