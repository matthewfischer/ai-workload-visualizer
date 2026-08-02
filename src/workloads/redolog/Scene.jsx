import { C, heat } from '../../engine/theme.js';
import { SmallNode, BigNode, FeedLine, Channel, HostPanel } from '../../engine/primitives.jsx';
import { PHASES, TIMING, logLines } from './data.js';

/* Sessions piling up on 'log file sync' during the commit phase — the
   database analogue of batch's request queue, but here it drains back to
   zero every cycle once LGWR's flush completes rather than persisting. */
function BlockedSessions({ x, y, blocked, committing }) {
  const dots = [];
  for (let i = 0; i < blocked; i++) {
    dots.push(<circle key={i} cx={x + 14 + i * 16} cy={y} r={6} fill={committing ? heat(0.9) : C.steel} />);
  }
  return (
    <g>
      <text x={x} y={y - 16} textAnchor="start" fill={C.mut} fontSize={11} fontFamily={C.mono}>
        {committing ? `${blocked} session(s) blocked on log file sync` : 'sessions · not committing'}
      </text>
      {dots}
    </g>
  );
}

export default function RedologScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;
  const committing = state.phase === 'commit';

  return (
    <>
      {/* intake: the app tier's SQL and commits arrive over the network,
          routed through the DB host's CPU and buffer cache */}
      <HostPanel x={44} y={14} w={400} h={104} label="DATABASE HOST" />
      <SmallNode x={140} y={44} w={110} h={48} label="DB CPU" util={disp.cpu} />
      <SmallNode x={266} y={44} w={160} h={48} label="Buffer Cache" util={disp.bufferCache} />
      <SmallNode x={8} y={44} w={100} h={44} label="Client Net" util={disp.netClient} />
      <FeedLine from={[195, 92]} to={[250, 158]} util={disp.cpu} clock={state.clock} label="parse / execute" />

      {/* the write channel (HERO): the fsync in flight, not storage itself —
          log buffer -> [pipe] -> redo log disk. Dashed connectors on each
          side make clear it's plugged into the boxes it sits between,
          despite the gap. */}
      <line x1={350} y1={250} x2={380} y2={250} stroke={C.steel} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.6} />
      <line x1={720} y1={250} x2={750} y2={192} stroke={C.steel} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.6} />
      <Channel x0={380} x1={720} top={206} bot={294} util={disp.redoDisk} clock={state.clock}
        bottleneck={bn === 'redoDisk'} label="LGWR WRITE" directionHint="► fsync to redo log disk" />

      {/* Log Buffer: fills while executing, drains as LGWR flushes it */}
      <BigNode x={150} y={158} w={200} h={168}
        title="Log Buffer" sub="redo entries queued in SGA"
        util={disp.logBuf} bottleneck={bn === 'logBuf'}
        idleNote={committing ? 'draining to disk' : null} />

      {/* Redo Log: the disk LGWR is writing to */}
      <SmallNode x={750} y={160} w={190} h={64} label="redo03.log" util={disp.redoDisk} />
      {/* Data Files: DBWR's background writes, calm by contrast with LGWR's synchronous one */}
      <SmallNode x={750} y={250} w={190} h={64} label="Data Files · DBWR" util={disp.dataDisk} />

      <BlockedSessions x={150} y={380} blocked={state.blocked} committing={committing} />
    </>
  );
}

export function headerLabel(state) {
  return state.phase === 'executing'
    ? `${state.txns} txns committed · log buffer ${Math.round(state.logFill * 100)}% full`
    : `flushing to redo log · ${Math.round(state.flushT * 100)}% · ${state.blocked} blocked`;
}

/* Terminal panel: a scrolling alert-log-style feed of session activity and
   LGWR flush status, the "watch the database work" console feel. */
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
