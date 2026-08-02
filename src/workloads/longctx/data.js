/* The long-context workload: ingesting a big document, then summarizing it.
 * Same six-resource machine as the chatbot workload, different story: here
 * the *ingest* pass is the long, hot phase — compute-bound, because more
 * context tokens means more matmul work before a single output token
 * exists. Summarizing afterward is an ordinary decode loop: same bandwidth
 * wall as any decode, just sitting on top of a much bigger context already
 * resident in memory. See src/engine/workloadContract.js for the interface
 * this implements. */

export const id = 'longctx';
export const label = 'Summarizing a long document';
export const subtitle = 'Ingest → Summarize · this time the wall is compute';

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

export const PHASES = {
  ingest: {
    name: 'Ingesting document',
    bottleneck: 'compute',
    caption: 'Reading a 200-page document in one long parallel pass. Every extra token of context multiplies the matmul work — compute is the wall here, not memory bandwidth.',
    loads: { nic: .18, cpu: .30, hostMem: .34, pcie: .22, compute: .96, hbmBw: .55, mem: .40 },
  },
  summarize: {
    name: 'Summarizing',
    bottleneck: 'hbmBw',
    caption: "Now it's an ordinary decode loop, one token at a time. Same bandwidth wall as any decode — it's just dragging a much bigger context out of HBM every step.",
    loads: { nic: .12, cpu: .18, hostMem: .22, pcie: .10, compute: .15, hbmBw: .93, mem: .88 },
  },
};

export const TIMING = {
  INGEST_DUR: 5.5, // seconds at 1x — deliberately longer than chatbot's prefill: that's the point
  BEAT: 0.9,
  TOTAL_PAGES: 200,
};

export function createState() {
  return {
    phase: 'ingest', phaseStart: 0, summarizeStart: 0, pages: 0, tokens: 0,
    disp: { nic: 0, cpu: 0, hostMem: 0, pcie: 0, compute: 0, hbmBw: 0, mem: 0 },
  };
}

export function step(s, dt, speed) {
  if (s.phase === 'ingest') {
    s.pages = Math.min(TIMING.TOTAL_PAGES, s.pages + dt * (TIMING.TOTAL_PAGES / TIMING.INGEST_DUR) * speed);
    if (s.clock - s.phaseStart > TIMING.INGEST_DUR / speed) {
      s.phase = 'summarize'; s.summarizeStart = s.clock; s.tokens = 0;
    }
  } else {
    s.tokens = Math.floor((s.clock - s.summarizeStart) * speed / TIMING.BEAT);
  }
}

export function targetLoads(s) {
  const target = { ...PHASES[s.phase].loads };
  if (s.phase === 'ingest') target.mem = 0.15 + (s.pages / TIMING.TOTAL_PAGES) * 0.55; // context window filling
  return target;
}

export function reset(s) {
  s.phase = 'ingest'; s.phaseStart = s.clock; s.summarizeStart = 0; s.pages = 0; s.tokens = 0;
}

/** beatT: 0..1 progress through the current token's summarize beat, or -1 during ingest. */
export function beatProgress(s, speed) {
  if (s.phase !== 'summarize') return -1;
  return (((s.clock - s.summarizeStart) * speed) / TIMING.BEAT) % 1;
}

// Fake (not measured) terminal-panel content. During ingest, a scrolling
// "parsing" log — one line per page, sampled from a fixed pool of
// plausible-sounding document snippets — plus a running extracted-token
// count. During summarize, a canned summary revealed word-by-word in
// lockstep with `tokens`, same mechanic as chatbot's response reveal.
export const TOKENS_PER_PAGE = 640;
const SNIPPETS = [
  'quarterly revenue growth outpaced guidance',
  'appendix B details the risk-adjustment methodology',
  'section 4.2 covers supply-chain exposure',
  'management commentary on margin compression',
  'forward-looking statements regarding capacity expansion',
  'footnote 12 reconciles non-GAAP adjustments',
  'customer concentration disclosed across three segments',
  'capex guidance revised for the coming fiscal year',
];

/** One "[page N/TOTAL] ... snippet" line per whole page ingested so far. */
export function ingestLogLines(pages) {
  const n = Math.floor(pages);
  const lines = [];
  for (let i = 1; i <= n; i++) {
    lines.push(`[page ${i}/${TIMING.TOTAL_PAGES}] … ${SNIPPETS[i % SNIPPETS.length]}`);
  }
  return lines;
}

const SUMMARY = "The document is a 200-page quarterly report. Revenue grew steadily while margins "
  + "compressed slightly on input costs, and the appendix flags supply-chain concentration as the "
  + "main watch item for next quarter.";
export const SUMMARY_WORDS = SUMMARY.split(' ');

/** The summary text revealed so far, given a token count (clamped to the full summary). */
export function revealedSummary(tokens) {
  return SUMMARY_WORDS.slice(0, Math.min(tokens, SUMMARY_WORDS.length)).join(' ');
}
