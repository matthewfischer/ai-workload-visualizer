/* The chatbot workload: prefill -> decode token loop. This file (plus
   Scene.jsx) is the entire "model" half of this workload — it imports
   nothing from other workloads and the engine imports nothing from here.
   See src/engine/workloadContract.js for the interface this implements. */

export const id = 'chatbot';
export const label = 'Running a chatbot';
export const subtitle = 'Prefill -> Decode · single or sharded GPU';

export const GPU_SHARDS = 4;
export const DEFAULT_KNOBS = { multiGpu: 1 };
export const KNOBS = {
  multiGpu: { type: 'toggle', label: 'GPU topology', offLabel: 'Single GPU', onLabel: 'Multi GPU' },
};
export const INTERCONNECT_PATHS = [
  { key: 'nvlink', label: 'NVLink / NVSwitch', note: 'direct GPU fabric', pressure: 0.42 },
  { key: 'pcieSwitch', label: 'PCIe switch', note: 'shared switch hops', pressure: 0.70 },
  { key: 'cpuPath', label: 'CPU root path', note: 'GPU -> CPU -> GPU bounce', pressure: 0.94 },
];

export const RESOURCES = {
  compute: { name: 'GPU Compute',   helps: 'newer tensor cores, FP8/FP16 math, AMX-style matrix engines' },
  hbmBw:   { name: 'HBM Bandwidth', helps: 'faster HBM (HBM3e), quantization (fewer bytes/token), bigger batches' },
  mem:     { name: 'HBM Capacity',  helps: 'more VRAM, quantization, KV-cache compression, CXL / host offload' },
  nic:     { name: 'Network',       helps: 'faster fabric, more NICs, RDMA' },
  cpu:     { name: 'Host CPU',      helps: 'faster / more host cores' },
  hostMem: { name: 'Host Memory',   helps: 'more system RAM, pinned-buffer transfers, larger request queues' },
  pcie:    { name: 'PCIe',          helps: 'PCIe 5->6 for host ingress, pinned buffers, fewer host-device copies' },
  gpuLink: { name: 'GPU-GPU Link',  helps: 'NVLink/NVSwitch, shard placement on the same switch domain, avoiding CPU-bounce transfers' },
};
export const ORDER = ['nic', 'cpu', 'hostMem', 'pcie', 'gpuLink', 'compute', 'hbmBw', 'mem'];

// The two phases we animate. loads are 0..1 targets; the engine eases toward them.
export const PHASES = {
  prefill: {
    name: 'Prefill',
    bottleneck: 'compute',
    caption: 'Reading the whole prompt in one parallel pass across four model shards. Tensor cores do the work, while the GPU-GPU link carries layer collectives between shards.',
    loads: { nic: .20, cpu: .35, hostMem: .30, pcie: .25, gpuLink: .44, compute: .85, hbmBw: .50, mem: .35 },
  },
  decode: {
    name: 'Decode',
    bottleneck: 'hbmBw',
    caption: 'One token at a time. Every shard rereads its weights and KV cache from HBM; NVLink keeps the shard exchange tolerable, but the same traffic over a PCIe switch or CPU bounce path can turn communication into the wall.',
    // mem grows with the conversation, so it's filled in live from KV size (see targetLoads).
    loads: { nic: .18, cpu: .22, hostMem: .24, pcie: .12, gpuLink: .55, compute: .18, hbmBw: .95, mem: .40 },
  },
};

const SINGLE_GPU_LOADS = {
  prefill: { nic: .20, cpu: .35, hostMem: .30, pcie: .25, gpuLink: 0, compute: .85, hbmBw: .50, mem: .35 },
  decode: { nic: .18, cpu: .22, hostMem: .24, pcie: .12, gpuLink: 0, compute: .18, hbmBw: .95, mem: .40 },
};

const SINGLE_GPU_CAPTIONS = {
  prefill: 'Reading your whole prompt in one parallel pass on one GPU. The matrix engine is doing real work and seeding the KV cache.',
  decode: 'One token at a time. Every token drags the entire model plus KV cache out of local HBM. The cores mostly wait; the memory bus is the wall.',
};

export const TIMING = {
  PREFILL_DUR: 3.2, // seconds at 1x
  BEAT: 0.9,         // seconds per generated token at 1x
};

export function createState() {
  return {
    phase: 'prefill', phaseStart: 0, decodeStart: 0, tokens: 0, kv: 0,
    knobs: { ...DEFAULT_KNOBS },
    disp: { nic: 0, cpu: 0, hostMem: 0, pcie: 0, gpuLink: 0, compute: 0, hbmBw: 0, mem: 0 },
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
  const phaseLoads = isMultiGpu(s) ? PHASES[s.phase].loads : SINGLE_GPU_LOADS[s.phase];
  const target = { ...phaseLoads };
  if (s.phase === 'decode') target.mem = 0.35 + s.kv * 0.55;
  return target;
}

export function isMultiGpu(s) {
  return (s.knobs?.multiGpu ?? DEFAULT_KNOBS.multiGpu) === 1;
}

export function caption(s) {
  return isMultiGpu(s) ? PHASES[s.phase].caption : SINGLE_GPU_CAPTIONS[s.phase];
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
