/* The RAG workload: answering a question by first retrieving supporting
 * context, then generating over it. Three acts, three different walls —
 * retrieve never touches the GPU at all (it's a round trip to a vector
 * database and an ANN index scan), prefill is the usual compute wall
 * ingesting the query + retrieved chunks, and decode is the usual HBM
 * bandwidth wall generating the answer one token at a time. The first act
 * is what makes this workload different from chatbot/longctx: a real
 * subsystem (network + vector index) that the GPU sits completely idle
 * for. See src/engine/workloadContract.js for the interface this
 * implements. */

export const id = 'rag';
export const label = 'Answering with retrieval (RAG)';
export const subtitle = 'Retrieve → Prefill → Decode · the GPU sits idle for the first act';

export const RESOURCES = {
  vecNet:  { name: 'Vector DB Network', helps: 'colocate the vector DB, a faster network hop, batching queries instead of one round trip per chunk' },
  vecDisk: { name: 'Vector Index I/O',  helps: 'an in-memory ANN index (HNSW), faster NVMe for on-disk indexes, more RAM to cache the index' },
  cpu:     { name: 'Host CPU',          helps: 'faster / more host cores for embedding the query, reranking, prompt assembly' },
  compute: { name: 'GPU Compute',       helps: 'newer tensor cores, FP8/FP16 math, AMX-style matrix engines' },
  hbmBw:   { name: 'HBM Bandwidth',     helps: 'faster HBM (HBM3e), quantization (fewer bytes/token), bigger batches' },
  mem:     { name: 'HBM Capacity',      helps: 'more VRAM, quantization, KV-cache compression, CXL / host offload' },
};
export const ORDER = ['vecNet', 'vecDisk', 'cpu', 'compute', 'hbmBw', 'mem'];

export const PHASES = {
  retrieve: {
    name: 'Retrieving context',
    bottleneck: 'vecNet',
    caption: "Before generation can start, the query gets embedded and sent to the vector database, which scans its ANN index for the nearest chunks. The GPU sits completely idle — this entire step never touches it.",
    loads: { vecNet: .85, vecDisk: .55, cpu: .30, compute: .08, hbmBw: .05, mem: .10 },
  },
  prefill: {
    name: 'Prefill',
    bottleneck: 'compute',
    caption: 'Reading the query plus every retrieved chunk in one parallel pass. More context from retrieval means more matmul work before a single output token exists — compute is the wall.',
    loads: { vecNet: .10, vecDisk: .08, cpu: .35, compute: .88, hbmBw: .50, mem: .35 },
  },
  decode: {
    name: 'Decode',
    bottleneck: 'hbmBw',
    caption: 'One token at a time. Every token drags the model plus the KV cache — now carrying the retrieved chunks too — out of HBM. The cores mostly wait; the memory bus is the wall.',
    loads: { vecNet: .05, vecDisk: .05, cpu: .20, compute: .18, hbmBw: .95, mem: .40 },
  },
};

export const TIMING = {
  RETRIEVE_DUR: 1.6,  // seconds at 1x for the vector search round trip
  PREFILL_DUR: 2.4,   // seconds at 1x to ingest query + retrieved chunks
  BEAT: 0.85,          // seconds per generated token at 1x
  CHUNK_TARGET: 6,    // chunks retrieved by the end of the retrieve phase
};

export function createState() {
  return {
    phase: 'retrieve', phaseStart: 0, decodeStart: 0,
    chunks: 0, tokens: 0, kv: 0,
    disp: { vecNet: 0, vecDisk: 0, cpu: 0, compute: 0, hbmBw: 0, mem: 0 },
  };
}

export function step(s, dt, speed) {
  if (s.phase === 'retrieve') {
    const elapsed = (s.clock - s.phaseStart) * speed;
    s.chunks = Math.min(TIMING.CHUNK_TARGET, Math.floor((elapsed / TIMING.RETRIEVE_DUR) * TIMING.CHUNK_TARGET));
    if (elapsed > TIMING.RETRIEVE_DUR) {
      s.phase = 'prefill'; s.phaseStart = s.clock;
    }
  } else if (s.phase === 'prefill') {
    s.kv = Math.min(0.25, s.kv + dt * (0.25 / TIMING.PREFILL_DUR) * speed);
    if (s.clock - s.phaseStart > TIMING.PREFILL_DUR / speed) {
      s.phase = 'decode'; s.decodeStart = s.clock; s.tokens = 0;
    }
  } else {
    s.tokens = Math.floor((s.clock - s.decodeStart) * speed / TIMING.BEAT);
    s.kv = Math.min(0.9, 0.25 + s.tokens * 0.012);
  }
}

export function targetLoads(s) {
  const target = { ...PHASES[s.phase].loads };
  if (s.phase === 'decode') target.mem = 0.35 + s.kv * 0.55;
  return target;
}

export function reset(s) {
  s.phase = 'retrieve'; s.phaseStart = s.clock; s.decodeStart = 0;
  s.chunks = 0; s.tokens = 0; s.kv = 0;
}

/** beatT: 0..1 progress through the current token's decode beat, or -1 outside decode. */
export function beatProgress(s, speed) {
  if (s.phase !== 'decode') return -1;
  return (((s.clock - s.decodeStart) * speed) / TIMING.BEAT) % 1;
}

// A fixed sample question + sources, revealed as retrieval/generation
// progress — not measured, just a plausible RAG exchange about itself.
export const QUERY = 'Why does retrieval-augmented generation reduce hallucination?';
export const SOURCES = [
  'kb://docs/rag-overview.md',
  'kb://docs/vector-search-tuning.md',
  'kb://papers/lewis-2020-rag.pdf',
  'kb://docs/ann-index-hnsw.md',
  'kb://docs/prompt-grounding.md',
  'kb://faq/rag-vs-finetuning.md',
];
const RESPONSE = "Because the model answers from chunks retrieved at request time instead of purely from "
  + "parametric memory, it can ground claims in text that's actually in front of it — and cite where each "
  + "claim came from — rather than pattern-matching to something it half-remembers from training.";
export const RESPONSE_WORDS = RESPONSE.split(' ');

/** The response text revealed so far, given a token count (clamped to the full response). */
export function revealedResponse(tokens) {
  return RESPONSE_WORDS.slice(0, Math.min(tokens, RESPONSE_WORDS.length)).join(' ');
}
