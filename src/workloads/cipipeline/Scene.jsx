import { C, heat, pct } from '../../engine/theme.js';
import { SmallNode } from '../../engine/primitives.jsx';
import { RESOURCES, bottleneckKey, logLines } from './data.js';

const QUEUE_AFTER = { ciBuild: true, ciTest: true, review: true, merge: true, postQA: true, release: true };

/* A horizontal arrow between two stage boxes, with a queue-depth badge
   above it when PRs are backing up waiting to enter the next stage —
   the visual "where's the backlog" cue this workload is built around. */
function Arrow({ x1, x2, y, queue }) {
  const backed = queue > 0.5;
  const col = backed ? heat(Math.min(1, 0.55 + queue / 40)) : C.steel;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - 6} y2={y} stroke={col} strokeWidth={backed ? 2.5 : 1.5} strokeLinecap="round" />
      <polygon points={`${x2 - 6},${y - 4} ${x2},${y} ${x2 - 6},${y + 4}`} fill={col} />
      {backed && (
        <text x={(x1 + x2) / 2} y={y - 10} textAnchor="middle" fill={col} fontSize={12} fontWeight={800} fontFamily={C.mono}>
          {Math.floor(queue)} queued
        </text>
      )}
    </g>
  );
}

// Two rows of 4 — an S-curve, left-to-right then wrapping — so each stage
// gets enough width for its label and queue badge without crowding.
const ROWS = [
  ['write', 'devtest', 'ciBuild', 'ciTest'],
  ['review', 'merge', 'postQA', 'release'],
];
const W = 190, GAP = 34, H = 92;
const X0 = (1000 - (ROWS[0].length * W + (ROWS[0].length - 1) * GAP)) / 2;
const ROW_Y = [96, 292];
const xAt = (col) => X0 + col * (W + GAP);

export default function CiPipelineScene({ state, disp }) {
  const bn = bottleneckKey(state);

  return (
    <>
      <text x={500} y={40} textAnchor="middle" fill={C.mut} fontSize={12} fontFamily={C.mono} letterSpacing={1}>
        WRITE CODE → DEV TEST → CI BUILD → CI TEST → PR REVIEW → MERGE → POST-MERGE QA → RELEASE
      </text>

      {/* wrap connector: bottom of CI Test (row 1, rightmost) down, across,
          then down into the top of PR Review (row 2, leftmost) */}
      {(() => {
        const cxFrom = xAt(3) + W / 2, cxTo = xAt(0) + W / 2;
        const yFrom = ROW_Y[0] + H, yTo = ROW_Y[1];
        const midY = (yFrom + yTo) / 2;
        const col = heat(Math.min(1, state.queues.review > 0 ? 0.7 : 0.2));
        return (
          <g>
            <path d={`M ${cxFrom} ${yFrom} V ${midY} H ${cxTo} V ${yTo - 6}`}
              fill="none" stroke={col} strokeWidth={1.5} strokeDasharray="4 5" />
            <polygon points={`${cxTo - 4},${yTo - 6} ${cxTo + 4},${yTo - 6} ${cxTo},${yTo}`} fill={col} />
            {state.queues.review > 0.5 && (
              <text x={(cxFrom + cxTo) / 2} y={midY - 8} textAnchor="middle"
                fill={col} fontSize={12} fontWeight={800} fontFamily={C.mono}>
                {Math.floor(state.queues.review)} queued for review
              </text>
            )}
          </g>
        );
      })()}

      {ROWS.map((row, r) => (
        <g key={r}>
          {row.map((key, i) => {
            const x = xAt(i), y = ROW_Y[r];
            return (
              <g key={key}>
                {i > 0 && (
                  <Arrow x1={xAt(i - 1) + W} x2={x} y={y + H / 2}
                    queue={QUEUE_AFTER[key] ? state.queues[key] : 0} />
                )}
                <SmallNode x={x} y={y} w={W} h={H} label={RESOURCES[key].name} util={disp[key]} />
                {key === bn && (
                  <rect x={x - 5} y={y - 5} width={W + 10} height={H + 10} rx={12} fill="none"
                    stroke={heat(disp[key])} strokeWidth={2.5} filter="url(#hot)" />
                )}
              </g>
            );
          })}
        </g>
      ))}

      <text x={500} y={412} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono}>
        bottleneck: {RESOURCES[bn].name} · {pct(disp[bn])}% of capacity
      </text>
    </>
  );
}

export { headerLabel } from './data.js';

/* Terminal panel: GitHub-Actions-flavored status lines, one per stage plus
   the latest PR opened — derived from state, no rendering-time randomness. */
export function Terminal({ state }) {
  const lines = logLines(state).slice(-9);
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} style={{ color: i === lines.length - 1 ? C.ink : C.mut }}>{l}</div>
      ))}
      <span className="idle" style={{ color: C.cyan }}>▍</span>
    </>
  );
}
