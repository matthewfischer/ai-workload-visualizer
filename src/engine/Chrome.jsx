import { C, heat, pct } from './theme.js';

/* The UI chrome around the scene: telemetry strip, bottleneck narration,
   and playback controls. Driven entirely by RESOURCES/PHASES data + engine
   state, so it works unmodified for any workload. */

export function TelemetryStrip({ RESOURCES, ORDER, disp, bottleneckKey }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 8, marginTop: 14 }}>
      {ORDER.map((k) => {
        const v = disp[k], on = k === bottleneckKey;
        return (
          <div key={k} style={{ background: C.panel, border: `1px solid ${on ? heat(v) : C.edge}`, borderRadius: 9, padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, color: on ? C.ink : C.mut, fontWeight: on ? 700 : 500 }}>{on ? '▲ ' : ''}{RESOURCES[k].name}</span>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: heat(v), fontWeight: 700 }}>{pct(v)}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: '#182231', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct(v)}%`, background: heat(v), borderRadius: 3, transition: 'width .12s linear' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Narration({ RESOURCES, bottleneckKey, bottleneckPct, caption }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14 }}>
      <div style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, background: heat(bottleneckPct) }} />
      <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.55 }}>
        <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: 1, color: C.mut, textTransform: 'uppercase' }}>
          Bottleneck · {RESOURCES[bottleneckKey].name} {pct(bottleneckPct)}%
        </span>
        <div style={{ marginTop: 4 }}>{caption}</div>
        <div style={{ marginTop: 6, color: C.mut, fontSize: 12.5 }}>
          <span style={{ color: heat(bottleneckPct) }}>What helps here:</span> {RESOURCES[bottleneckKey].helps}.
        </div>
      </div>
    </div>
  );
}

export function Controls({ playing, speed, onPlay, onSpeed, onReset, resetLabel, speeds = [0.5, 1, 2] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
      <div className="btn" onClick={() => onPlay(!playing)}
        style={{ padding: '8px 16px', borderRadius: 9, background: C.cyan, color: '#04222a', fontWeight: 700, fontSize: 13 }}>
        {playing ? '❚❚ Pause' : '▶ Play'}
      </div>
      <div className="btn" onClick={onReset}
        style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.edge}`, color: C.ink, fontSize: 13, fontWeight: 600 }}>
        ↺ {resetLabel}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontFamily: C.mono, fontSize: 11, color: C.mut }}>
        speed
        {speeds.map((sp) => (
          <div key={sp} className="btn" onClick={() => onSpeed(sp)}
            style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${speed === sp ? C.cyan : C.edge}`, color: speed === sp ? C.ink : C.mut }}>{sp}×</div>
        ))}
      </div>
    </div>
  );
}
