import { C, heat } from '../../engine/theme.js';
import { SmallNode, BigNode, HostPanel } from '../../engine/primitives.jsx';
import { PLATFORMS } from '../agentic/data.js';
import { RESOURCES, bottleneckKey, logLines } from './data.js';

const STEPS = [
  { key: 'webSearch', label: 'Web Search' },
  { key: 'docSearch', label: 'Internal Docs' },
  { key: 'synthesize', label: 'Synthesize' },
];
const STEP_W = 170, STEP_H = 96, GAP = 30, STEP_Y = 130;
const xAt = (i) => 44 + i * (STEP_W + GAP);

function Arrow({ x1, x2, y }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - 6} y2={y} stroke={C.steel} strokeWidth={1.5} strokeLinecap="round" />
      <polygon points={`${x2 - 6},${y - 4} ${x2},${y} ${x2 - 6},${y + 4}`} fill={C.steel} />
    </g>
  );
}

export default function ResearchScene({ state, disp }) {
  const platform = PLATFORMS[state.knobs.platform];
  const bn = bottleneckKey(state);
  const activeIdx = STEPS.findIndex((s) => s.key === state.phase);
  const rowMidY = STEP_Y + STEP_H / 2;

  return (
    <>
      <HostPanel x={24} y={14} w={952} h={64}
        label={`${platform.name.toUpperCase()} · ${platform.detail} · HOP ${Math.min(state.hopIndex + 1, state.knobs.hops)}/${state.knobs.hops}`} />

      {STEPS.map((step, i) => {
        const x = xAt(i);
        const key = step.key === 'webSearch' ? 'webNet' : step.key === 'docSearch' ? 'docNet' : 'compute';
        return (
          <g key={step.key}>
            {i > 0 && <Arrow x1={xAt(i - 1) + STEP_W} x2={x} y={rowMidY} />}
            <SmallNode x={x} y={STEP_Y} w={STEP_W} h={STEP_H} label={step.label} util={disp[key]} />
            {i === activeIdx && (
              <rect x={x - 5} y={STEP_Y - 5} width={STEP_W + 10} height={STEP_H + 10} rx={12} fill="none"
                stroke={heat(disp[key])} strokeWidth={2} strokeDasharray="4 3" opacity={0.8} />
            )}
            {key === bn && (
              <rect x={x - 5} y={STEP_Y - 5} width={STEP_W + 10} height={STEP_H + 10} rx={12} fill="none"
                stroke={heat(disp[key])} strokeWidth={2.5} filter="url(#hot)" />
            )}
          </g>
        );
      })}

      {/* loop-back: synthesize -> web search, repeated for `hops` total hops */}
      <path d={`M ${xAt(2) + STEP_W / 2} ${STEP_Y + STEP_H + 6} C ${xAt(2) + STEP_W / 2} ${STEP_Y + STEP_H + 50}, ${xAt(0) + STEP_W / 2} ${STEP_Y + STEP_H + 50}, ${xAt(0) + STEP_W / 2} ${STEP_Y + STEP_H + 6}`}
        fill="none" stroke={C.steel} strokeWidth={1.3} strokeDasharray="3 4" markerEnd="url(#loopArrow)" />
      <defs>
        <marker id="loopArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill={C.steel} />
        </marker>
      </defs>
      <text x={(xAt(0) + xAt(2) + STEP_W) / 2} y={STEP_Y + STEP_H + 68} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono}>
        × {state.knobs.hops} hops
      </text>

      <Arrow x1={xAt(2) + STEP_W} x2={664} y={rowMidY} />
      <BigNode x={664} y={STEP_Y - 10} w={312} h={116}
        title="Generate" sub="final-answer decode"
        util={disp.hbmBw} bottleneck={bn === 'hbmBw'} idleNote={null} />

      <BigNode x={664} y={280} w={312} h={116}
        title="Core Slots" sub="concurrent research tasks vs. capacity"
        util={disp.coreSlots} bottleneck={bn === 'coreSlots'} idleNote={null} />

      <SmallNode x={44} y={280} w={170} h={90} label={RESOURCES.mem.name} util={disp.mem} />

      <g>
        <rect x={244} y={280} width={170} height={90} rx={8} fill={C.panel}
          stroke={state.queue >= 0.5 ? heat(Math.min(1, state.queue / 20)) : C.steel} strokeWidth={1.3} />
        <text x={329} y={305} textAnchor="middle" fill={C.ink} fontSize={13} fontWeight={600}>Task Queue</text>
        <text x={329} y={340} textAnchor="middle"
          fill={state.queue >= 0.5 ? heat(Math.min(1, state.queue / 20)) : C.mut}
          fontSize={26} fontWeight={800} fontFamily={C.mono}>
          {Math.floor(state.queue)}
        </text>
        <text x={329} y={358} textAnchor="middle" fill={C.mut} fontSize={10} fontFamily={C.mono}>tasks waiting for a slot</text>
      </g>

      <text x={500} y={430} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono}>
        arrival: {1.2}/sec constant · hold time grows with hop count, same on every platform
      </text>
    </>
  );
}

export { headerLabel } from './data.js';

/* Terminal panel: current task/hop/phase, then queue-depth lines once the
   platform can't keep up with the hop-count-driven hold time. */
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
