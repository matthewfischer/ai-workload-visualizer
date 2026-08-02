import { C, heat, lerp } from '../../engine/theme.js';
import { SmallNode, BigNode, Channel, HostPanel } from '../../engine/primitives.jsx';
import { PHASES, TIMING, logLines } from './data.js';

const SRC_X = 170, DST_X = 840, TRACK_Y = 136;

/* The VM itself, riding along a fixed track between the two hosts. It only
   actually moves during switchover (stunT 0->1); through all of precopy it
   sits parked at the source, which is where it's still executing. */
function VMMarker({ phase, stunT }) {
  const t = phase === 'switchover' ? stunT : 0;
  const cx = lerp(SRC_X, DST_X, t);
  const paused = phase === 'switchover' && stunT < 1;
  return (
    <g>
      <line x1={SRC_X} y1={TRACK_Y} x2={DST_X} y2={TRACK_Y} stroke={C.steel} strokeWidth={1} strokeDasharray="2 6" opacity={0.4} />
      <circle cx={cx} cy={TRACK_Y} r={8} fill={paused ? heat(0.95) : C.cyan} filter={paused ? 'url(#hot)' : undefined} />
      <text x={cx} y={TRACK_Y - 14} textAnchor="middle" fill={C.mut} fontSize={10} fontFamily={C.mono}>
        {paused ? 'VM stunned' : 'VM running'}
      </text>
    </g>
  );
}

export default function VmotionScene({ state, disp }) {
  const bn = PHASES[state.phase].bottleneck;
  const netHint = state.phase === 'precopy'
    ? `► pass ${state.pass}/${TIMING.PASS_COUNT} · ${Math.round(state.dirtyPct * 100)}% dirty`
    : '► final delta + device state';

  return (
    <>
      {/* the two hosts, source and destination, each with their own CPU */}
      <HostPanel x={24} y={14} w={280} h={104} label="SOURCE · esx-01" />
      <SmallNode x={90} y={48} w={150} h={48} label="Src CPU" util={disp.srcCpu} />

      <HostPanel x={696} y={14} w={280} h={104} label="DEST · esx-02" />
      <SmallNode x={762} y={48} w={150} h={48} label="Dst CPU" util={disp.dstCpu} />

      {/* the migration link (HERO): every dirty page has to cross this */}
      <Channel x0={330} x1={666} top={46} bot={100} util={disp.net} clock={state.clock}
        bottleneck={bn === 'net'} label="VMOTION NETWORK" directionHint={netHint} />

      <VMMarker phase={state.phase} stunT={state.stunT} />

      {/* guest memory: the working set precopy is racing to converge on */}
      <BigNode x={380} y={170} w={240} h={170}
        title="Guest Memory" sub={`pass ${state.pass}/${TIMING.PASS_COUNT} · ${Math.round(state.dirtyPct * 100)}% dirty`}
        util={disp.mem} bottleneck={bn === 'mem'} idleNote={null} />

      {/* shared storage: sits underneath both hosts already, untouched by a pure vMotion */}
      <SmallNode x={430} y={362} w={140} h={48} label="Shared Storage" util={disp.storage} />
      <text x={500} y={424} textAnchor="middle" fill={C.mut} fontSize={10} fontFamily={C.mono}>
        both hosts already mount this — nothing moves here
      </text>
    </>
  );
}

export function headerLabel(state) {
  if (state.phase === 'precopy') {
    return `pass ${state.pass}/${TIMING.PASS_COUNT} · ${Math.round(state.dirtyPct * 100)}% dirty`;
  }
  return state.stunT >= 1
    ? 'migration complete — running on esx-02'
    : `stunned · switching over (${Math.round(state.stunT * 100)}%)`;
}

/* Terminal panel: a scrolling vMotion progress log, one line per precopy
   pass, then the switchover/cutover lines. */
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
