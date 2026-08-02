import { C, heat, lerp, bez, pct } from '../../engine/theme.js';
import { SmallNode, BigNode, FeedLine, Channel, HostPanel } from '../../engine/primitives.jsx';
import { PHASES, TIMING, beatProgress, QUERY, SOURCES, revealedResponse } from './data.js';

/* Retrieval never touches the GPU, so it gets its own diagram entirely:
   query goes out over the network, the vector index scans for nearest
   chunks, chunks come back. Kept local to this file. */
function RetrievalScene({ state, disp, bn }) {
  const hint = `► query embedding out · ${state.chunks}/${TIMING.CHUNK_TARGET} chunks back`;
  return (
    <>
      <HostPanel x={24} y={14} w={300} h={104} label="APPLICATION" />
      <SmallNode x={90} y={48} w={170} h={48} label="Host CPU" util={disp.cpu} />
      <line x1={175} y1={96} x2={220} y2={170} stroke={C.steel} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.6} />

      <Channel x0={220} x1={760} top={170} bot={260} util={disp.vecNet} clock={state.clock}
        bottleneck={bn === 'vecNet'} label="VECTOR DB NETWORK" directionHint={hint} />
      <line x1={800} y1={260} x2={830} y2={300} stroke={C.steel} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.6} />

      <BigNode x={700} y={300} w={260} h={110}
        title="Vector Index" sub={`ANN search (HNSW) · ${state.chunks}/${TIMING.CHUNK_TARGET} chunks`}
        util={disp.vecDisk} bottleneck={bn === 'vecDisk'} idleNote={null} />
    </>
  );
}

/* Everything below is the ordinary chatbot-style generation story (compute
   -> HBM bandwidth), just carrying retrieved chunks into the KV cache
   instead of a bare prompt. Kept local rather than importing from the
   chatbot workload — each workload module is self-contained. */
function AppendArc({ beatT }) {
  const p0 = [250, 158], p1 = [500, 42], p2 = [770, 150];
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

function Memory({ x, y, w, h, kv, util, bottleneck, tokens, chunks, phase }) {
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
        KV cache · {chunks} chunks{phase === 'decode' ? ` + ${tokens} tok` : ''}
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

function GenerationScene({ state, disp, bn }) {
  const beatT = beatProgress(state, state.speed);
  return (
    <>
      <HostPanel x={44} y={14} w={280} h={104} label="HOST" />
      <SmallNode x={100} y={48} w={170} h={48} label="Host CPU" util={disp.cpu} />
      <FeedLine from={[185, 96]} to={[250, 158]} util={disp.cpu} clock={state.clock} label="query + chunks" />

      <Channel x0={690} x1={350} top={206} bot={294} util={disp.hbmBw} clock={state.clock}
        bottleneck={bn === 'hbmBw'} label="HBM BANDWIDTH" directionHint="◄ weights + KV read into compute" />

      <AppendArc beatT={beatT} />

      <BigNode x={150} y={158} w={200} h={168}
        title="GPU Compute" sub="tensor / matrix cores"
        util={disp.compute} bottleneck={bn === 'compute'}
        idleNote={state.phase === 'decode' ? 'mostly waiting' : null} />

      <Memory x={690} y={140} w={224} h={206} kv={state.kv} util={disp.mem} bottleneck={bn === 'mem'}
        tokens={state.tokens} chunks={state.chunks} phase={state.phase} />

      <Output x={250} yTop={326} yBot={372} beatT={beatT} />
    </>
  );
}

export default function RagScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;
  return state.phase === 'retrieve'
    ? <RetrievalScene state={state} disp={disp} bn={bn} />
    : <GenerationScene state={state} disp={disp} bn={bn} />;
}

export function headerLabel(state) {
  if (state.phase === 'retrieve') return `${state.chunks}/${TIMING.CHUNK_TARGET} chunks retrieved…`;
  return state.phase === 'decode' ? `token ${state.tokens}` : 'reading query + chunks…';
}

/* Terminal panel: the query and retrieved sources during retrieve, then
   the canned answer revealed word-by-word during decode, same as chatbot. */
export function Terminal({ state }) {
  if (state.phase === 'retrieve') {
    const found = SOURCES.slice(0, state.chunks);
    return (
      <>
        <span style={{ color: C.ink }}>&gt; {QUERY}</span>{'\n'}
        {found.map((s, i) => (
          <div key={i} style={{ color: C.mut }}>[{i + 1}] {s}</div>
        ))}
        <span className="idle" style={{ color: C.cyan }}>▍</span>
      </>
    );
  }
  if (state.phase === 'prefill') {
    const dots = '.'.repeat(1 + Math.floor(state.clock * 2) % 3);
    return (
      <>
        <span style={{ color: C.mut }}>&gt; {QUERY}</span>{'\n'}
        <span style={{ color: C.mut }}>$ reading {TIMING.CHUNK_TARGET} retrieved chunks{dots}</span>
      </>
    );
  }
  return (
    <>
      <span style={{ color: C.mut }}>&gt; {QUERY}</span>{'\n\n'}
      <span style={{ color: C.ink }}>{revealedResponse(state.tokens)}</span>
      <span className="idle" style={{ color: C.cyan }}>▍</span>
    </>
  );
}

export { pct };
