import { useState } from 'react';
import { C, heat, pct } from '../engine/theme.js';
import { LEVERS, impactRows, notModeled, targetFactor } from './data.js';
import { agenticCoreCountCurves, batchLeverCurve } from './curves.js';
import SweepChart from './SweepChart.jsx';

const VERDICT = {
  relieved: { label: 'Bottleneck relieved', color: '#4ad991' },
  'new-wall': { label: 'Becomes the new bottleneck', color: heat(0.95) },
  'still-wall': { label: 'Still the wall', color: heat(0.95) },
  'eased-not-wall': { label: "Eased, wasn't the wall anyway", color: '#e0b84a' },
  'worsened-not-wall': { label: "Worse, but still wasn't the wall", color: '#e0b84a' },
  'no-effect': { label: 'No real effect', color: C.mut },
};

// Workloads with a real load-swept chart for a given lever — excluded from
// the static single-point table below and rendered as a chart instead. Only
// agentic and batch have genuine concurrency math in their own data.js;
// every other workload is a single-request loop with no load axis to sweep.
const CHARTED = {
  coreCount: ['agentic', 'batch'],
  pcieLanes: ['batch'],
  pcieGen: ['batch'],
};

function Bar({ v, dim }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#182231', overflow: 'hidden', minWidth: 70 }}>
      <div style={{ height: '100%', width: `${pct(v)}%`, background: heat(v), opacity: dim ? 0.4 : 1, borderRadius: 3 }} />
    </div>
  );
}

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6, fontSize: 11, fontFamily: C.mono, color: C.mut }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display: 'inline-block', width: 16, height: 0, borderTop: `2px ${it.dashed ? 'dashed' : 'solid'} ${it.dashed ? C.mut : C.cyan}` }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function AgenticCoreCountSection() {
  const { xLabel, loadMax, configs } = agenticCoreCountCurves();
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.edge}`, borderRadius: 9, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Running an agent fleet</div>
      <div style={{ fontSize: 11, color: C.mut, fontFamily: C.mono, marginBottom: 8 }}>Turin (128c) vs. Venice (256c-dense) — real platform data, not a synthetic factor</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: C.ink, marginBottom: 2 }}>Core Slots — this is what saturates</div>
          <SweepChart xLabel={xLabel} loadMax={loadMax}
            series={configs.map((c) => ({ key: c.key, dashed: c.dashed, points: c.coreSlots, saturatesAt: c.saturatesAt }))} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.ink, marginBottom: 2 }}>Per-Session Compute — flat, load-independent</div>
          <SweepChart xLabel={xLabel} loadMax={loadMax}
            series={configs.map((c) => ({ key: c.key, dashed: c.dashed, points: c.perTaskSpeed }))} />
        </div>
      </div>
      <Legend items={configs.map((c) => ({ label: `${c.label} · ${c.detail}`, dashed: c.dashed }))} />
      <div style={{ fontSize: 12, color: C.mut, marginTop: 8, lineHeight: 1.5 }}>
        At low arrival rates both platforms coast — that's not "cores don't matter," it's "not enough load yet
        to reach either one's ceiling." Turin saturates at ~5.3 sessions/sec; Venice not until ~10.7. The coupled
        cost is visible too: Venice's lower clock nudges Per-Session Compute up (22%→31%), it just never
        approaches the wall the way Core Slots does.
      </div>
    </div>
  );
}

function BatchSection({ leverId }) {
  const key = leverId === 'coreCount' ? 'cpu' : 'pcie';
  const resourceName = leverId === 'coreCount' ? 'Host CPU' : 'PCIe';
  const factor = targetFactor(leverId, 'batch', key);
  const { xLabel, loadMax, capacityMark, configs, memReference } = batchLeverCurve(key, factor);
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.edge}`, borderRadius: 9, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Serving many requests</div>
      <div style={{ fontSize: 11, color: C.mut, fontFamily: C.mono, marginBottom: 8 }}>{resourceName} vs. concurrent requests, with HBM Capacity (the real bottleneck) shown for reference</div>
      <SweepChart xLabel={xLabel} loadMax={loadMax} capacityMark={capacityMark}
        refLine={{ value: memReference[memReference.length - 1].value, label: `HBM Capacity · ${pct(memReference[memReference.length - 1].value)}%` }}
        series={configs.map((c) => ({ key: c.key, dashed: c.dashed, points: c.points }))} />
      <Legend items={[...configs.map((c) => ({ label: c.label, dashed: c.dashed })), { label: 'HBM Capacity (unaffected)', dashed: false }]} />
      <div style={{ fontSize: 12, color: C.mut, marginTop: 8, lineHeight: 1.5 }}>
        {resourceName} tracks concurrency but never gets close to the wall, at any request count — the dashed
        capacity line marks where admission stops and requests start queueing instead. HBM Capacity (amber,
        flat) is the real ceiling here, and this lever doesn't touch it at all: the wall doesn't move, because
        this resource was never anywhere near it to begin with.
      </div>
    </div>
  );
}

export default function LeverImpact() {
  const [leverId, setLeverId] = useState('coreCount');
  const lever = LEVERS[leverId];
  const charted = CHARTED[leverId] || [];
  const rows = impactRows(leverId).filter((r) => !charted.includes(r.workloadId));
  const skipped = notModeled(leverId);

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: C.sans, padding: '20px 22px 22px', borderRadius: 14, border: `1px solid ${C.edge}`, maxWidth: 1040, margin: '24px auto' }}>
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: 2, color: C.cyan, textTransform: 'uppercase' }}>
        Hardware Lever Impact
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2, marginBottom: 4 }}>
        "What does this actually help, and for what workloads?"
      </div>
      <div style={{ fontSize: 13, color: C.mut, marginBottom: 6 }}>
        Pick one hardware change. Where a workload's own model has real concurrency math (agentic, batch), the
        effect is plotted against load, not just one snapshot — so "no effect" and "not enough load yet" don't
        get confused with each other. Every number here is this project's existing convention: a hand-authored
        0–100% relative load, directionally honest, not a measured benchmark result.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 14 }}>
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

      {leverId === 'coreCount' && <AgenticCoreCountSection />}
      {(leverId === 'coreCount' || leverId === 'pcieLanes' || leverId === 'pcieGen') && <BatchSection leverId={leverId} />}

      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1.3fr 1.8fr', gap: 10, padding: '0 10px', fontSize: 10, fontFamily: C.mono, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <span>Workload · phase</span>
            <span>Resource</span>
            <span>Before → after</span>
            <span>Verdict (single operating point)</span>
          </div>
          {rows.map((r, i) => {
            const v = VERDICT[r.verdict];
            const deltaPP = pct(r.upgraded) - pct(r.baseline);
            const deltaStr = `${deltaPP > 0 ? '+' : ''}${deltaPP}pp`;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1.3fr 1.8fr', gap: 10, alignItems: 'center',
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
                <div style={{ fontSize: 12, fontWeight: 700, color: v.color }}>{v.label} ({deltaStr})</div>
              </div>
            );
          })}
          <div style={{ fontSize: 11.5, color: C.mut, marginTop: 4, lineHeight: 1.5 }}>
            These rows have no concurrency model in this project yet (single-request prefill/decode loops, not
            a function of load) — one fixed operating point, not swept. Treat "no real effect" here as "not at
            this load level, in this workload's current model," not a general claim.
          </div>
        </div>
      )}

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
