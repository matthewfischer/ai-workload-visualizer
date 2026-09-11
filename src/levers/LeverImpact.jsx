import { useState } from 'react';
import { C, heat, pct } from '../engine/theme.js';
import { LEVERS, impactRows, notModeled } from './data.js';

const VERDICT = {
  relieved: { label: 'Bottleneck relieved', color: '#4ad991' },
  'still-wall': { label: 'Still the wall', color: heat(0.95) },
  'eased-not-wall': { label: "Eased, wasn't the wall anyway", color: '#e0b84a' },
  'no-effect': { label: 'No real effect', color: C.mut },
};

function Bar({ v, dim }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#182231', overflow: 'hidden', minWidth: 70 }}>
      <div style={{ height: '100%', width: `${pct(v)}%`, background: heat(v), opacity: dim ? 0.4 : 1, borderRadius: 3 }} />
    </div>
  );
}

export default function LeverImpact() {
  const [leverId, setLeverId] = useState('pcieLanes');
  const lever = LEVERS[leverId];
  const rows = impactRows(leverId);
  const skipped = notModeled(leverId);

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: C.sans, padding: '20px 22px 22px', borderRadius: 14, border: `1px solid ${C.edge}`, maxWidth: 1040, margin: '24px auto' }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: 2, color: C.cyan, textTransform: 'uppercase' }}>
        Hardware Lever Impact
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2, marginBottom: 4 }}>
        "What does this actually help, and for what workloads?"
      </div>
      <div style={{ fontSize: 13, color: C.mut, marginBottom: 14 }}>
        Pick one hardware change. Every row below is a real workload phase, its authored resource loads, and
        whether this change ever moves who the bottleneck is — not a simulation, a direct read of the same
        data the animated workloads use.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {Object.values(LEVERS).map((l) => (
          <div key={l.id} className="btn" onClick={() => setLeverId(l.id)}
            style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${leverId === l.id ? C.cyan : C.edge}`,
              background: leverId === l.id ? '#12313a' : C.panel, color: leverId === l.id ? C.ink : C.mut,
              fontSize: 13, fontWeight: leverId === l.id ? 800 : 600 }}>
            {l.label}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12.5, color: C.mut, marginBottom: 16, lineHeight: 1.5 }}>{lever.note}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1.3fr 1.6fr', gap: 10, padding: '0 10px', fontSize: 10, fontFamily: C.mono, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <span>Workload · phase</span>
          <span>Resource</span>
          <span>Before → after</span>
          <span>Verdict</span>
        </div>
        {rows.map((r, i) => {
          const v = VERDICT[r.verdict];
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1.3fr 1.6fr', gap: 10, alignItems: 'center',
              background: C.panel, border: `1px solid ${C.edge}`, borderRadius: 9, padding: '10px 10px' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.workloadLabel}</div>
                <div style={{ fontSize: 11, color: C.mut, fontFamily: C.mono }}>{r.phaseName}</div>
              </div>
              <div style={{ fontSize: 12.5 }}>{r.resourceName}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.mut }}>{pct(r.baseline)}% → {pct(r.upgraded)}%</div>
                <Bar v={r.baseline} dim />
                <Bar v={r.upgraded} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: v.color }}>{v.label}</div>
            </div>
          );
        })}
      </div>

      {skipped.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 12, color: C.mut, borderTop: `1px solid ${C.edge}`, paddingTop: 12 }}>
          <span style={{ color: C.ink, fontWeight: 700 }}>Not modeled here:</span> {skipped.join(', ')} —
          no resource in these workloads' model maps to this lever at all (no such physical path exists in
          their story), so there's nothing to report rather than an assumed zero.
        </div>
      )}
    </div>
  );
}
