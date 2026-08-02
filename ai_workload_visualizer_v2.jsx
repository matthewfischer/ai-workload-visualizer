import React, { useRef, useReducer, useEffect } from 'react';

/* ============================================================================
   AI WORKLOAD VISUALIZER v2  —  "watch where the machine runs hot"

   FOCUS: one use case done well — running a chatbot (prefill → decode loop).
   The whole scene is cool steel at rest; UTILIZATION IS RENDERED AS HEAT.
   The one part everything waits on glows hot = the bottleneck.

   Data model kept minimal & separable so more workloads slot in later:
     RESOURCES  : each part of the machine + what actually helps it
     CHATBOT    : the phases we animate, each with a 0..1 load per resource
   ============================================================================ */

const RESOURCES = {
  compute: { name: 'GPU Compute',   helps: 'newer tensor cores, FP8/FP16 math, AMX-style matrix engines' },
  hbmBw:   { name: 'HBM Bandwidth', helps: 'faster HBM (HBM3e), quantization (fewer bytes/token), bigger batches' },
  mem:     { name: 'HBM Capacity',  helps: 'more VRAM, quantization, KV-cache compression, CXL / host offload' },
  nic:     { name: 'Network',       helps: 'faster fabric, more NICs, RDMA' },
  cpu:     { name: 'Host CPU',      helps: 'faster / more host cores' },
  pcie:    { name: 'PCIe',          helps: 'PCIe 5→6, or NVLink to bypass the host' },
};
const ORDER = ['nic', 'cpu', 'pcie', 'compute', 'hbmBw', 'mem'];

// The two phases we animate. loads are 0..1 targets; the engine eases toward them.
const PHASES = {
  prefill: {
    name: 'Prefill',
    bottleneck: 'compute',
    caption: 'Reading your whole prompt in one parallel pass. The matrix engine is doing real work and seeding the KV cache.',
    loads: { nic: .20, cpu: .35, pcie: .25, compute: .85, hbmBw: .50, mem: .35 },
  },
  decode: {
    name: 'Decode',
    bottleneck: 'hbmBw',
    caption: 'One token at a time. Every token drags the entire model + KV cache out of HBM. The cores mostly wait — the memory bus is the wall.',
    // mem grows with the conversation, so it's filled in live from KV size.
    loads: { nic: .18, cpu: .22, pcie: .12, compute: .18, hbmBw: .95, mem: .40 },
  },
};

/* ---- thermal color ramp: cool steel (idle) → amber → red → white-hot ---- */
const STOPS = [
  [0.00, [58, 84, 112]], [0.35, [96, 112, 120]], [0.55, [196, 132, 62]],
  [0.72, [236, 142, 56]], [0.86, [255, 92, 56]], [1.00, [255, 178, 140]],
];
function heat(v) {
  v = Math.max(0, Math.min(1, v));
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], t = (v - a) / (b - a);
      return `rgb(${(ca[0] + (cb[0] - ca[0]) * t) | 0},${(ca[1] + (cb[1] - ca[1]) * t) | 0},${(ca[2] + (cb[2] - ca[2]) * t) | 0})`;
    }
  }
  return 'rgb(255,178,140)';
}
const lerp = (a, b, t) => a + (b - a) * t;
const bez = (p0, p1, p2, t) => [
  (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
  (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
];
const pct = (v) => Math.round((v || 0) * 100);

const PREFILL_DUR = 2.2;   // seconds at 1x
const BEAT = 0.5;          // seconds per generated token at 1x

// palette
const C = {
  bg: '#0a0e15', panel: '#0f141d', edge: '#1e2c3e', steel: '#2a3d54',
  ink: '#e8eef6', mut: '#6f8199', cyan: '#54cdda', kv: '#39b3c2', kvEdge: '#2b8c99',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  sans: 'Inter, system-ui, -apple-system, sans-serif',
};

export default function AIWorkloadVisualizer() {
  const [, force] = useReducer((x) => x + 1, 0);
  const st = useRef({
    clock: 0, playing: true, speed: 1,
    phase: 'prefill', phaseStart: 0, decodeStart: 0, tokens: 0, kv: 0,
    disp: { nic: 0, cpu: 0, pcie: 0, compute: 0, hbmBw: 0, mem: 0 },
  });

  useEffect(() => {
    let raf, last = performance.now();
    const tick = (now) => {
      const s = st.current;
      const dt = Math.min(0.05, (now - last) / 1000) * (s.playing ? 1 : 0);
      last = now;
      s.clock += dt;

      // phase progression
      if (s.phase === 'prefill') {
        s.kv = Math.min(0.20, s.kv + dt * (0.20 / PREFILL_DUR) * s.speed);
        if (s.clock - s.phaseStart > PREFILL_DUR / s.speed) {
          s.phase = 'decode'; s.decodeStart = s.clock; s.tokens = 0;
        }
      } else {
        const newTokens = Math.floor((s.clock - s.decodeStart) * s.speed / BEAT);
        s.tokens = newTokens;
        s.kv = Math.min(0.9, 0.20 + newTokens * 0.012);
      }

      // eased target loads (mem tracks KV capacity growth in decode)
      const target = { ...PHASES[s.phase].loads };
      if (s.phase === 'decode') target.mem = 0.35 + s.kv * 0.55;
      for (const k of ORDER) s.disp[k] = lerp(s.disp[k], target[k], Math.min(1, dt * 6 + (s.playing ? 0 : 1)));

      force();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const s = st.current;
  const phase = PHASES[s.phase];
  const bn = phase.bottleneck;
  const beatT = s.phase === 'decode' ? (((s.clock - s.decodeStart) * s.speed) / BEAT) % 1 : -1;

  const setPlay = (p) => { st.current.playing = p; force(); };
  const setSpeed = (sp) => { st.current.speed = sp; force(); };
  const newPrompt = () => {
    const c = st.current;
    c.phase = 'prefill'; c.phaseStart = c.clock; c.decodeStart = 0; c.tokens = 0; c.kv = 0; force();
  };

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: C.sans, padding: '20px 22px 22px', borderRadius: 14, border: `1px solid ${C.edge}` }}>
      <style>{`
        @keyframes idlePulse{0%,100%{opacity:.4}50%{opacity:.75}}
        .idle{animation:idlePulse 2.4s ease-in-out infinite}
        .btn{cursor:pointer;transition:all .15s ease;user-select:none}
        @media (prefers-reduced-motion: reduce){.idle{animation:none}}
      `}</style>

      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: 2, color: C.cyan, textTransform: 'uppercase' }}>Running a chatbot · watch where it runs hot</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 2 }}>
            {phase.name}
            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.mut, fontWeight: 400, marginLeft: 10 }}>
              {s.phase === 'decode' ? `token ${s.tokens}` : 'reading prompt…'}
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

          {/* ---- intake: network → cpu → compute (active in prefill) ---- */}
          <SmallNode x={20} y={26} w={112} h={48} label="Network" util={s.disp.nic} />
          <SmallNode x={150} y={26} w={112} h={48} label="Host CPU" util={s.disp.cpu} />
          <FeedLine from={[206, 74]} to={[240, 158]} util={s.disp.pcie} clock={s.clock} label="PCIe" />

          {/* ---- the bandwidth channel (HERO): memory → compute, right to left ---- */}
          <Channel util={s.disp.hbmBw} clock={s.clock} bottleneck={bn === 'hbmBw'} />

          {/* ---- append arc: compute → KV cache, one pulse per token ---- */}
          <AppendArc beatT={beatT} />

          {/* ---- GPU Compute ---- */}
          <BigNode x={150} y={158} w={200} h={168}
            title="GPU Compute" sub="tensor / matrix cores"
            util={s.disp.compute} bottleneck={bn === 'compute'}
            idleNote={s.phase === 'decode' ? 'mostly waiting' : null} />

          {/* ---- GPU Memory (weights + KV cache) ---- */}
          <Memory x={690} y={140} w={224} h={206} kv={s.kv} util={s.disp.mem} bottleneck={bn === 'mem'} tokens={s.tokens} phase={s.phase} />

          {/* ---- output: one token drops out per beat ---- */}
          <Output x={250} yTop={326} yBot={372} beatT={beatT} />
        </svg>
      </div>

      {/* narration */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14 }}>
        <div style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, background: heat(s.disp[bn]) }} />
        <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.55 }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: 1, color: C.mut, textTransform: 'uppercase' }}>Bottleneck · {RESOURCES[bn].name} {pct(s.disp[bn])}%</span>
          <div style={{ marginTop: 4 }}>{phase.caption}</div>
          <div style={{ marginTop: 6, color: C.mut, fontSize: 12.5 }}>
            <span style={{ color: heat(s.disp[bn]) }}>What helps here:</span> {RESOURCES[bn].helps}.
          </div>
        </div>
      </div>

      {/* telemetry strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 8, marginTop: 14 }}>
        {ORDER.map((k) => {
          const v = s.disp[k], on = k === bn;
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

      {/* controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <div className="btn" onClick={() => setPlay(!s.playing)}
          style={{ padding: '8px 16px', borderRadius: 9, background: C.cyan, color: '#04222a', fontWeight: 700, fontSize: 13 }}>
          {s.playing ? '❚❚ Pause' : '▶ Play'}
        </div>
        <div className="btn" onClick={newPrompt}
          style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.edge}`, color: C.ink, fontSize: 13, fontWeight: 600 }}>
          ↺ New prompt
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', fontFamily: C.mono, fontSize: 11, color: C.mut }}>
          speed
          {[0.5, 1, 2].map((sp) => (
            <div key={sp} className="btn" onClick={() => setSpeed(sp)}
              style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${s.speed === sp ? C.cyan : C.edge}`, color: s.speed === sp ? C.ink : C.mut }}>{sp}×</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- pieces --------------------------------- */

function SmallNode({ x, y, w, h, label, util }) {
  const col = heat(util);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={C.panel} stroke={util > 0.25 ? col : C.steel} strokeWidth={1.3} />
      <text x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle" fill={C.ink} fontSize={14} fontWeight={600} fontFamily={C.sans}>{label}</text>
      <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fill={col} fontSize={11} fontFamily={C.mono} fontWeight={700}>{pct(util)}%</text>
    </g>
  );
}

function FeedLine({ from, to, util, clock, label }) {
  const col = heat(util);
  const n = Math.round(util * 5);
  const dots = [];
  for (let i = 0; i < n; i++) {
    const t = (clock * 0.5 + i / Math.max(1, n)) % 1;
    dots.push([lerp(from[0], to[0], t), lerp(from[1], to[1], t)]);
  }
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={C.steel} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
      {dots.map((d, i) => <circle key={i} cx={d[0]} cy={d[1]} r={2.4} fill={col} />)}
    </g>
  );
}

function Channel({ util, clock, bottleneck }) {
  const col = heat(util);
  const x0 = 690, x1 = 350, top = 206, bot = 294, cy = 250; // memory-left → compute-right
  const lanes = [214, 228, 242, 256, 270, 284];
  const perLane = Math.round(util * 5);
  const speed = 0.35 + util * 0.7;
  const dots = [];
  lanes.forEach((ly, li) => {
    for (let i = 0; i < perLane; i++) {
      const t = (clock * speed + i / Math.max(1, perLane) + li * 0.13) % 1;
      dots.push([lerp(x0, x1, t), ly, t]); // right→left = reading weights out of memory
    }
  });
  return (
    <g>
      {/* channel walls */}
      <rect x={x1} y={top} width={x0 - x1} height={bot - top} rx={10} fill="#0c131d" stroke={bottleneck ? col : C.steel} strokeWidth={bottleneck ? 2 : 1.2}
        filter={util > 0.8 ? 'url(#hot)' : undefined} opacity={0.95} />
      {/* heat wash */}
      <rect x={x1} y={top} width={x0 - x1} height={bot - top} rx={10} fill={col} opacity={0.10 + 0.14 * util} />
      {/* weight-stream particles */}
      {dots.map((d, i) => <circle key={i} cx={d[0]} cy={d[1]} r={2.8} fill={col} opacity={0.55 + 0.45 * util} />)}
      {/* label + hero stat */}
      <text x={(x0 + x1) / 2} y={cy - 6} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono} letterSpacing={1}>HBM BANDWIDTH</text>
      <text x={(x0 + x1) / 2} y={cy + 22} textAnchor="middle" fill={col} fontSize={30} fontWeight={800} fontFamily={C.mono}>{pct(util)}%</text>
      {/* direction hint */}
      <text x={x1 + 14} y={bot + 15} textAnchor="start" fill={C.mut} fontSize={10} fontFamily={C.mono}>◄ weights + KV read into compute</text>
    </g>
  );
}

function AppendArc({ beatT }) {
  const p0 = [250, 158], p1 = [500, 42], p2 = [770, 150]; // compute-top → arc → KV-top
  const active = beatT >= 0;
  const pt = active ? bez(p0, p1, p2, beatT) : null;
  const d = `M ${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
  return (
    <g>
      <path d={d} fill="none" stroke={C.kvEdge} strokeWidth={1.4} strokeDasharray="3 6" opacity={0.5} />
      <text x={p1[0]} y={p1[1] - 6} textAnchor="middle" fill={C.mut} fontSize={10} fontFamily={C.mono}>append new token → KV cache</text>
      {pt && <circle cx={pt[0]} cy={pt[1]} r={4.5} fill={C.kv} filter="url(#hot)" />}
    </g>
  );
}

function BigNode({ x, y, w, h, title, sub, util, bottleneck, idleNote }) {
  const col = heat(util);
  const cx = x + w / 2;
  return (
    <g>
      {bottleneck && <rect className="" x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={13} fill="none" stroke={col} strokeWidth={2.5} filter="url(#hot)" />}
      <rect x={x} y={y} width={w} height={h} rx={11} fill={C.panel} stroke={bottleneck ? col : C.steel} strokeWidth={bottleneck ? 2 : 1.3} />
      <text x={cx} y={y + 30} textAnchor="middle" fill={C.ink} fontSize={16} fontWeight={600}>{title}</text>
      <text x={cx} y={y + 48} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono}>{sub}</text>
      <text x={cx} y={y + h / 2 + 26} textAnchor="middle" fill={col} fontSize={32} fontWeight={800} fontFamily={C.mono}>{pct(util)}%</text>
      {idleNote && <text className="idle" x={cx} y={y + h - 16} textAnchor="middle" fill={C.mut} fontSize={11} fontFamily={C.mono}>◷ {idleNote}</text>}
    </g>
  );
}

function Memory({ x, y, w, h, kv, util, bottleneck, tokens, phase }) {
  const col = heat(util);
  const innerX = x + 12, innerW = w - 24;
  const innerTop = y + 40, innerBot = y + h - 14;
  const wTop = innerBot - 80;                       // weights block top
  const kvAvail = wTop - innerTop - 6;
  const kvH = Math.max(6, kvAvail * kv);
  return (
    <g>
      {bottleneck && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={13} fill="none" stroke={col} strokeWidth={2.5} filter="url(#hot)" />}
      <rect x={x} y={y} width={w} height={h} rx={11} fill={C.panel} stroke={bottleneck ? col : C.steel} strokeWidth={bottleneck ? 2 : 1.3} />
      <text x={x + w / 2} y={y + 24} textAnchor="middle" fill={C.ink} fontSize={15} fontWeight={600}>
        GPU Memory <tspan fill={C.mut} fontSize={11} fontFamily={C.mono}>· HBM</tspan>
      </text>
      {/* weights (static) */}
      <rect x={innerX} y={wTop} width={innerW} height={80} rx={6} fill="#1a2c40" stroke="#2f4c68" strokeWidth={1} />
      <text x={innerX + innerW / 2} y={wTop + 46} textAnchor="middle" fill="#9db9d6" fontSize={12} fontFamily={C.mono}>Weights</text>
      <text x={innerX + innerW / 2} y={wTop + 28} textAnchor="middle" fill="#6c88a6" fontSize={10} fontFamily={C.mono}>the model</text>
      {/* KV cache (grows up) */}
      <rect x={innerX} y={wTop - 6 - kvH} width={innerW} height={kvH} rx={6} fill={C.kv} opacity={0.28} />
      <rect x={innerX} y={wTop - 6 - kvH} width={innerW} height={kvH} rx={6} fill="none" stroke={C.kvEdge} strokeWidth={1.2} />
      <text x={innerX + innerW / 2} y={wTop - 14} textAnchor="middle" fill="#bfe9ef" fontSize={11} fontFamily={C.mono}>
        KV cache{phase === 'decode' ? ` · ${tokens} tok` : ''}
      </text>
    </g>
  );
}

function Output({ x, yTop, yBot, beatT }) {
  const active = beatT >= 0;
  const y = active ? lerp(yTop, yBot, beatT) : null;
  return (
    <g>
      <line x1={x} y1={yTop} x2={x} y2={yBot} stroke={C.steel} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.6} />
      <text x={x + 10} y={yBot + 2} textAnchor="start" fill={C.mut} fontSize={11} fontFamily={C.mono}>→ token out</text>
      {y !== null && <circle cx={x} cy={y} r={4} fill={C.cyan} filter="url(#hot)" />}
    </g>
  );
}
