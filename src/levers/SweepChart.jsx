import { C, heat } from '../engine/theme.js';

/** A small hand-rolled line chart: utilization (0-100%) vs. a load axis,
 * one or more series. No charting library — matches the rest of this
 * project's hand-rolled SVG primitives (engine/primitives.jsx). */
export default function SweepChart({ xLabel, loadMax, series, refLine, capacityMark, width = 440, height = 150 }) {
  const padL = 32, padR = 10, padT = 10, padB = 22;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const xAt = (load) => padL + (load / loadMax) * plotW;
  const yAt = (v) => padT + (1 - Math.max(0, Math.min(1, v))) * plotH;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={yAt(v)} y2={yAt(v)} stroke={C.edge} strokeWidth={1} />
          <text x={padL - 5} y={yAt(v) + 3} textAnchor="end" fill={C.mut} fontSize={9} fontFamily={C.mono}>{Math.round(v * 100)}</text>
        </g>
      ))}
      {capacityMark != null && (
        <line x1={xAt(capacityMark)} x2={xAt(capacityMark)} y1={padT} y2={height - padB} stroke={C.steel} strokeDasharray="2 3" strokeWidth={1} />
      )}
      {refLine && (
        <g>
          <line x1={xAt(0)} x2={xAt(loadMax)} y1={yAt(refLine.value)} y2={yAt(refLine.value)}
            stroke="#e0b84a" strokeDasharray="4 3" strokeWidth={1.3} opacity={0.85} />
          <text x={width - padR} y={yAt(refLine.value) - 4} textAnchor="end" fill="#e0b84a" fontSize={9} fontFamily={C.mono}>
            {refLine.label}
          </text>
        </g>
      )}
      {series.map((s, i) => {
        const pts = s.points.map((p) => `${xAt(p.load)},${yAt(p.value)}`).join(' ');
        const color = s.dashed ? C.mut : C.cyan;
        return (
          <g key={s.key || i}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} />
            {s.saturatesAt != null && (
              <circle cx={xAt(s.saturatesAt)} cy={yAt(1)} r={3.5} fill={heat(1)} />
            )}
          </g>
        );
      })}
      <text x={width / 2} y={height - 4} textAnchor="middle" fill={C.mut} fontSize={9.5} fontFamily={C.mono}>{xLabel} →</text>
    </svg>
  );
}
