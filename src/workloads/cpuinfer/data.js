/* The CPU-only inference workload: same prefill -> decode token loop as
 * chatbot, but with no GPU in the picture at all — a quantized model
 * running on a CPU's AMX (or AVX-512) matrix tiles instead of tensor
 * cores. The point isn't a new bottleneck shape (prefill is still
 * compute-bound, decode is still bandwidth-bound — the textbook result
 * holds either way), it's scale: AMX genuinely accelerates prefill, same
 * as tensor cores do on a GPU, but DDR5 system memory bandwidth is
 * roughly an order of magnitude below HBM, so even a fully saturated,
 * AMX-accelerated machine tops out far below what the same shape of
 * workload does on a GPU. See src/engine/workloadContract.js for the
 * interface this implements. */

export const id = 'cpuinfer';
export const label = 'Running inference on CPU';
export const subtitle = 'Prefill → Decode · same wall, a much lower ceiling';

export const RESOURCES = {
  nic:    { name: 'Network',                helps: 'faster fabric, more NICs — rarely the wall here' },
  compute: { name: 'CPU Matrix Engine',     helps: 'AMX / AVX-512 tiles, more cores, BF16/INT8 quantization' },
  memBw:  { name: 'System Memory Bandwidth', helps: 'faster DDR5, more memory channels, NUMA-local placement' },
  mem:    { name: 'System Memory Capacity', helps: 'more RAM, quantization, smaller KV-cache footprint' },
};
export const ORDER = ['nic', 'compute', 'memBw', 'mem'];

export const PHASES = {
  prefill: {
    name: 'Prefill',
    bottleneck: 'compute',
    caption: "Reading the whole prompt in one parallel pass. AMX tiles are doing real BF16/INT8 matmul work here — this is the one phase where AMX genuinely earns its keep. It's just earning it against a much smaller ceiling: a CPU socket's matrix tiles aren't in the same league as a GPU's tensor cores.",
    loads: { nic: .15, compute: .82, memBw: .45, mem: .30 },
  },
  decode: {
    name: 'Decode',
    bottleneck: 'memBw',
    caption: "One token at a time, the same wall as any decode: every token drags the whole model + KV cache out of memory. Except this memory is DDR5 system RAM, not HBM — on the order of 30-40x less bandwidth. AMX can't do anything about a wall it was never built to move.",
    loads: { nic: .10, compute: .12, memBw: .90, mem: .40 },
  },
};

export const TIMING = {
  // Deliberately longer than chatbot's 3.2s: same matmul work, on AMX
  // tiles instead of tensor cores, against a much lower FLOPs ceiling.
  PREFILL_DUR: 5.5,
  // Deliberately slower than chatbot's 0.9s/token: DDR bandwidth is a
  // fraction of HBM, so dragging weights + KV out of memory just takes
  // longer, even though it's the identical bandwidth-bound shape.
  BEAT: 2.6,
};

export function createState() {
  return {
    phase: 'prefill', phaseStart: 0, decodeStart: 0, tokens: 0, kv: 0,
    disp: { nic: 0, compute: 0, memBw: 0, mem: 0 },
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
// panel in lockstep with `tokens` — an edge/on-prem framing to match the
// "no GPU available" story. Not measured, just a plausible answer.
export const PROMPT = 'No GPU on this box — summarize the incident in one sentence.';
const RESPONSE = "Running on AMX instead of tensor cores doesn't change the shape of the wall, "
  + "just how far away it is: prefill still leans on the matrix engine and decode is still "
  + "bandwidth-bound, but DDR5 moves a fraction of what HBM does, so the whole thing tops out "
  + "far below a GPU running the identical workload.";
export const RESPONSE_WORDS = RESPONSE.split(' ');

/** The response text revealed so far, given a token count (clamped to the full response). */
export function revealedResponse(tokens) {
  return RESPONSE_WORDS.slice(0, Math.min(tokens, RESPONSE_WORDS.length)).join(' ');
}
