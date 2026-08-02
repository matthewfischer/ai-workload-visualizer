import { useState } from 'react';
import { C, heat, pct } from './engine/theme.js';
import { useEngineClock } from './engine/useEngineClock.js';
import { TelemetryStrip, Narration, Controls } from './engine/Chrome.jsx';
import { WORKLOADS, WORKLOAD_LIST, DEFAULT_WORKLOAD_ID } from './workloads/index.js';

export default function App() {
  const [workloadId, setWorkloadId] = useState(DEFAULT_WORKLOAD_ID);
  const workload = WORKLOADS[workloadId];
  const { state, setPlay, setSpeed, resetRun } = useEngineClock(workload);

  const phase = workload.PHASES[state.phase];
  const bn = phase.bottleneck;
  const Scene = workload.Scene;

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: C.sans, padding: '20px 22px 22px', borderRadius: 14, border: `1px solid ${C.edge}`, maxWidth: 1040, margin: '24px auto' }}>
      <style>{`
        @keyframes idlePulse{0%,100%{opacity:.4}50%{opacity:.75}}
        .idle{animation:idlePulse 2.4s ease-in-out infinite}
        .btn{cursor:pointer;transition:all .15s ease;user-select:none}
        @media (prefers-reduced-motion: reduce){.idle{animation:none}}
      `}</style>

      {/* workload picker — always visible, even with one workload, so it's
          never ambiguous which model you're looking at. Doubles as the
          visible proof that code and models are separate. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontFamily: C.mono, color: C.mut, textTransform: 'uppercase', letterSpacing: 1 }}>Model:</span>
        {WORKLOAD_LIST.map((w) => (
          <div key={w.id} className="btn" onClick={() => setWorkloadId(w.id)}
            style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, fontFamily: C.mono,
              border: `1px solid ${w.id === workloadId ? C.cyan : C.edge}`, color: w.id === workloadId ? C.ink : C.mut }}>
            {w.label}
          </div>
        ))}
      </div>

      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: 2, color: C.cyan, textTransform: 'uppercase' }}>{workload.subtitle}</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
            {phase.name}
            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.mut, fontWeight: 400, marginLeft: 10 }}>
              {workload.headerLabel(state)}
            </span>
          </div>
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.mut, textAlign: 'right', maxWidth: 300 }}>
          hotter = busier · the hot part is the bottleneck
        </div>
      </div>

      {/* scene */}
      <div style={{ background: C.panel, borderRadius: 12, border: `1px solid ${C.edge}`, padding: 6, marginTop: 8 }}>
        <svg viewBox="0 0 1000 440" style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <filter id="hot" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="7" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <Scene state={state} disp={state.disp} />
        </svg>
      </div>

      <Narration RESOURCES={workload.RESOURCES} bottleneckKey={bn} bottleneckPct={state.disp[bn]} caption={phase.caption} />

      <TelemetryStrip RESOURCES={workload.RESOURCES} ORDER={workload.ORDER} disp={state.disp} bottleneckKey={bn} />

      <Controls playing={state.playing} speed={state.speed} onPlay={setPlay} onSpeed={setSpeed} onReset={resetRun} resetLabel="New run" />
    </div>
  );
}
