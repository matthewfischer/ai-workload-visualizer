import { C, heat } from '../../engine/theme.js';
import { SmallNode, BigNode, FeedLine, Channel } from '../../engine/primitives.jsx';
import { PHASES, TIMING, TOKENS_PER_PAGE, ingestLogLines, revealedSummary } from './data.js';

/* This workload's physical story differs from chatbot's only in emphasis:
   the memory block holds a growing *context window* (filled during the long
   ingest pass) rather than a KV cache filled token-by-token during decode.
   Kept local to this file rather than the shared engine. */
function ContextWindow({ x, y, w, h, pages, util, bottleneck }) {
  const col = heat(util);
  const innerX = x + 14, innerW = w - 28;
  const innerTop = y + 64, innerBot = y + h - 16;
  const fillH = Math.max(6, (innerBot - innerTop) * (pages / TIMING.TOTAL_PAGES));
  return (
    <g>
      {bottleneck && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={13} fill="none" stroke={col} strokeWidth={2.5} filter="url(#hot)" />}
      <rect x={x} y={y} width={w} height={h} rx={11} fill={C.panel} stroke={bottleneck ? col : C.steel} strokeWidth={bottleneck ? 2 : 1.3} />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" fill={C.ink} fontSize={15} fontWeight={600}>
        GPU Memory <tspan fill={C.mut} fontSize={11} fontFamily={C.mono}>· HBM</tspan>
      </text>
      <text x={x + w / 2} y={y + 48} textAnchor="middle" fill="#bfe9ef" fontSize={12} fontFamily={C.mono}>
        Context window · {Math.round(pages)} / {TIMING.TOTAL_PAGES} pages
      </text>
      <rect x={innerX} y={innerTop} width={innerW} height={innerBot - innerTop} rx={6} fill="#1a2c40" stroke="#2f4c68" strokeWidth={1} />
      <rect x={innerX} y={innerBot - fillH} width={innerW} height={fillH} rx={6} fill={C.kv} opacity={0.3} />
      <rect x={innerX} y={innerBot - fillH} width={innerW} height={fillH} rx={6} fill="none" stroke={C.kvEdge} strokeWidth={1.2} />
    </g>
  );
}

export default function LongctxScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;

  return (
    <>
      {/* intake: network -> cpu -> compute (feeding the document in) */}
      <SmallNode x={20} y={26} w={112} h={48} label="Network" util={disp.nic} />
      <SmallNode x={150} y={26} w={112} h={48} label="Host CPU" util={disp.cpu} />
      <FeedLine from={[206, 74]} to={[240, 158]} util={disp.pcie} clock={state.clock} />

      {/* the bandwidth channel: memory -> compute, right to left */}
      <Channel x0={690} x1={350} top={206} bot={294} util={disp.hbmBw} clock={state.clock}
        bottleneck={bn === 'hbmBw'} label="HBM BANDWIDTH" directionHint="◄ context + weights read into compute" />

      {/* GPU Compute — the hero this time, pinned for the whole long ingest */}
      <BigNode x={150} y={158} w={200} h={168}
        title="GPU Compute" sub="tensor / matrix cores"
        util={disp.compute} bottleneck={bn === 'compute'}
        idleNote={state.phase === 'summarize' ? 'mostly waiting' : null} />

      {/* GPU Memory: the context window, filling as the document is ingested */}
      <ContextWindow x={690} y={140} w={280} h={250} pages={state.pages} util={disp.mem} bottleneck={bn === 'mem'} />
    </>
  );
}

export function headerLabel(state) {
  return state.phase === 'ingest' ? `${Math.round(state.pages)} / ${TIMING.TOTAL_PAGES} pages` : `token ${state.tokens}`;
}

/* Terminal panel: a scrolling fake "parsing" log during ingest (one line
   per page, sampled from a fixed snippet pool), then the canned summary
   revealed word-by-word during summarize — same mechanic as chatbot's
   Terminal, different content. */
export function Terminal({ state }) {
  if (state.phase === 'ingest') {
    const lines = ingestLogLines(state.pages).slice(-6);
    const tokens = Math.round(state.pages * TOKENS_PER_PAGE);
    return (
      <>
        <div style={{ color: C.mut }}>$ parsing document.pdf…</div>
        {lines.map((l, i) => <div key={i} style={{ color: C.mut }}>{l}</div>)}
        <div style={{ color: C.ink }}>{tokens.toLocaleString()} tokens extracted so far <span className="idle" style={{ color: C.cyan }}>▍</span></div>
      </>
    );
  }
  return (
    <>
      <div style={{ color: C.mut }}>&gt; summarize({TIMING.TOTAL_PAGES} pages)</div>
      <div style={{ marginTop: 6, color: C.ink }}>{revealedSummary(state.tokens)}<span className="idle" style={{ color: C.cyan }}>▍</span></div>
    </>
  );
}
