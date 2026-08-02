/* The chatbot workload: prefill -> decode token loop. This file (plus
   Scene.jsx) is the entire "model" half of this workload — it imports
   nothing from other workloads and the engine imports nothing from here.
   See src/engine/workloadContract.js for the interface this implements. */

export const id = 'chatbot';
export const label = 'Running a chatbot';
export const subtitle = 'Prefill → Decode · watch where it runs hot';

export const RESOURCES = {
  compute: { name: 'GPU Compute',   helps: 'newer tensor cores, FP8/FP16 math, AMX-style matrix engines' },
  hbmBw:   { name: 'HBM Bandwidth', helps: 'faster HBM (HBM3e), quantization (fewer bytes/token), bigger batches' },
  mem:     { name: 'HBM Capacity',  helps: 'more VRAM, quantization, KV-cache compression, CXL / host offload' },
  nic:     { name: 'Network',       helps: 'faster fabric, more NICs, RDMA' },
  cpu:     { name: 'Host CPU',      helps: 'faster / more host cores' },
  hostMem: { name: 'Host Memory',   helps: 'more system RAM, pinned-buffer transfers, larger request queues' },
  pcie:    { name: 'PCIe',          helps: 'PCIe 5→6, or NVLink to bypass the host' },
};
export const ORDER = ['nic', 'cpu', 'hostMem', 'pcie', 'compute', 'hbmBw', 'mem'];

// The two phases we animate. loads are 0..1 targets; the engine eases toward them.
export const PHASES = {
  prefill: {
    name: 'Prefill',
    bottleneck: 'compute',
    caption: 'Reading your whole prompt in one parallel pass. The matrix engine is doing real work and seeding the KV cache.',
    loads: { nic: .20, cpu: .35, hostMem: .30, pcie: .25, compute: .85, hbmBw: .50, mem: .35 },
  },
  decode: {
    name: 'Decode',
    bottleneck: 'hbmBw',
    caption: 'One token at a time. Every token drags the entire model + KV cache out of HBM. The cores mostly wait — the memory bus is the wall.',
    // mem grows with the conversation, so it's filled in live from KV size (see targetLoads).
    loads: { nic: .18, cpu: .22, hostMem: .24, pcie: .12, compute: .18, hbmBw: .95, mem: .40 },
  },
};

export const TIMING = {
  PREFILL_DUR: 3.2, // seconds at 1x
  BEAT: 0.9,         // seconds per generated token at 1x
};

export function createState() {
  return {
    phase: 'prefill', phaseStart: 0, decodeStart: 0, tokens: 0, kv: 0,
    disp: { nic: 0, cpu: 0, hostMem: 0, pcie: 0, compute: 0, hbmBw: 0, mem: 0 },
  };
}

export function step(s, dt, speed) {
  if (s.phase === 'prefill') {
    s.kv = Math.min(0.20, s.kv + dt * (0.20 / TIMING.PREFILL_DUR) * speed);
    if (s.clock - s.phaseStart > TIMING.PREFILL_DUR / speed) {
      s.phase = 'decode'; s.decodeStart = s.clock; s.tokens = 0;
    }
  } else {
    s.tokens = Math.floor((s.clock - s.decodeStart) * speed / TIMING.BEAT);
    s.kv = Math.min(0.9, 0.20 + s.tokens * 0.012);
  }
}

export function targetLoads(s) {
  const target = { ...PHASES[s.phase].loads };
  if (s.phase === 'decode') target.mem = 0.35 + s.kv * 0.55;
  return target;
}

export function reset(s) {
  s.phase = 'prefill'; s.phaseStart = s.clock; s.decodeStart = 0; s.tokens = 0; s.kv = 0;
}

/** beatT: 0..1 progress through the current token's decode beat, or -1 during prefill. */
export function beatProgress(s, speed) {
  if (s.phase !== 'decode') return -1;
  return (((s.clock - s.decodeStart) * speed) / TIMING.BEAT) % 1;
}

// A single fixed sample exchange, revealed word-by-word in the terminal
// panel in lockstep with `tokens` — ties the abstract diagram to a concrete
// chat transcript. Not measured, just a plausible chatbot answer about
// itself.
export const PROMPT = 'Explain why decoding is bandwidth-bound, in two sentences.';
const RESPONSE = "Because each new token forces the GPU to re-read every model weight and the "
  + "entire KV cache out of HBM, decode moves a huge volume of data through memory for very "
  + "little arithmetic. The compute cores end up mostly idle, waiting on the memory bus instead "
  + "of crunching numbers.";
export const RESPONSE_WORDS = RESPONSE.split(' ');

/** The response text revealed so far, given a token count (clamped to the full response). */
export function revealedResponse(tokens) {
  return RESPONSE_WORDS.slice(0, Math.min(tokens, RESPONSE_WORDS.length)).join(' ');
}
