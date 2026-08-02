import { C, heat, lerp, bez, pct } from '../../engine/theme.js';
import { SmallNode, BigNode, FeedLine, Channel, HostPanel } from '../../engine/primitives.jsx';
import { beatProgress, PHASES, PROMPT, revealedResponse } from './data.js';

/* Pieces below are specific to this workload's physical story (weights +
   KV cache living in HBM, one append per generated token) and stay local
   to this file rather than living in the shared engine. */

function AppendArc({ beatT }) {
  const p0 = [250, 158], p1 = [500, 42], p2 = [770, 150]; // compute-top → arc → KV-top
  const active = beatT >= 0;
  const pt = active ? bez(p0, p1, p2, beatT) : null;
  const d = `M ${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
  return (
    <g>
      <path d={d} fill="none" stroke={C.kvEdge} strokeWidth={1.4} strokeDasharray="3 6" opacity={0.5} />
      <text x={p1[0]} y={p1[1] - 6} textAnchor="middle" fill={C.mut} fontSize={10} fontFamily={C.mono}>append new token → KV cache</text>
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

export default function ChatbotScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;
  const beatT = beatProgress(state, state.speed);

  return (
    <>
      {/* intake: network → host (cpu + memory) → compute (active in prefill).
          Network straddles the host box's left edge — it's the boundary
          traffic crosses in from, not a resource the host owns. */}
      <HostPanel x={44} y={14} w={312} h={100} />
      <SmallNode x={132} y={28} w={96} h={42} label="Host CPU" util={disp.cpu} />
      <SmallNode x={246} y={28} w={96} h={42} label="Host Mem" util={disp.hostMem} />
      <SmallNode x={8} y={42} w={100} h={44} label="Network" util={disp.nic} />
      <FeedLine from={[180, 70]} to={[250, 158]} util={disp.pcie} clock={state.clock} label="PCIe" />

      {/* the bandwidth channel (HERO): memory → compute, right to left */}
      <Channel x0={690} x1={350} top={206} bot={294} util={disp.hbmBw} clock={state.clock}
        bottleneck={bn === 'hbmBw'} label="HBM BANDWIDTH" directionHint="◄ weights + KV read into compute" />

      {/* append arc: compute → KV cache, one pulse per token */}
      <AppendArc beatT={beatT} />

      {/* GPU Compute */}
      <BigNode x={150} y={158} w={200} h={168}
        title="GPU Compute" sub="tensor / matrix cores"
        util={disp.compute} bottleneck={bn === 'compute'}
        idleNote={state.phase === 'decode' ? 'mostly waiting' : null} />

      {/* GPU Memory (weights + KV cache) */}
      <Memory x={690} y={140} w={224} h={206} kv={state.kv} util={disp.mem} bottleneck={bn === 'mem'} tokens={state.tokens} phase={state.phase} />

      {/* output: one token drops out per beat */}
      <Output x={250} yTop={326} yBot={372} beatT={beatT} />
    </>
  );
}

export function headerLabel(state) {
  return state.phase === 'decode' ? `token ${state.tokens}` : 'reading prompt…';
}

/* Terminal panel content — plain HTML/text (not SVG), rendered by App.jsx
   inside the shared engine/TerminalWindow chrome. During prefill it shows
   the prompt "loading"; during decode the canned response is revealed
   word-by-word as `state.tokens` climbs, matching the append-arc pulses. */
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
