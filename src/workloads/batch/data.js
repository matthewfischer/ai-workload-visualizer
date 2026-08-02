/* The batch-serving workload: many concurrent chat requests sharing one
 * GPU. Same six-resource machine, a different shape of wall: it's not
 * compute or bandwidth that caps things, it's capacity — every concurrent
 * request holds its own KV cache in HBM, so once that memory fills up, new
 * requests queue no matter how much headroom compute or bandwidth have
 * left. See src/engine/workloadContract.js for the interface this
 * implements. */

export const id = 'batch';
export const label = 'Serving many requests';
export const subtitle = 'Capacity-bound · every request needs its own KV cache';

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
  ramp: {
    name: 'Admitting requests',
    bottleneck: 'compute',
    caption: 'A handful of requests share the GPU. Plenty of memory headroom — compute is the busy one, scheduling batched matmuls across them.',
    loads: { nic: .30, cpu: .35, hostMem: .32, pcie: .20, compute: .65, hbmBw: .50, mem: .30 },
  },
  saturated: {
    name: 'Batch at capacity',
    bottleneck: 'mem',
    caption: "Every concurrent request holds its own KV cache in HBM. Once that memory fills up, the ceiling isn't compute or bandwidth — it's how many KV caches fit. New requests queue.",
    loads: { nic: .20, cpu: .30, hostMem: .35, pcie: .15, compute: .55, hbmBw: .60, mem: .95 },
  },
};

export const TIMING = {
  RAMP_DUR: 4.0,     // seconds at 1x to admit a full batch
  CAPACITY: 24,      // concurrent requests the KV cache pool can hold
  ARRIVAL_BEAT: 0.6, // seconds per new arrival queuing, at 1x, once saturated
  MAX_QUEUE: 14,
};

export function createState() {
  return {
    phase: 'ramp', phaseStart: 0, saturatedStart: 0, requests: 0, queued: 0,
    disp: { nic: 0, cpu: 0, hostMem: 0, pcie: 0, compute: 0, hbmBw: 0, mem: 0 },
  };
}

export function step(s, dt, speed) {
  if (s.phase === 'ramp') {
    s.requests = Math.min(TIMING.CAPACITY, s.requests + dt * (TIMING.CAPACITY / TIMING.RAMP_DUR) * speed);
    if (s.requests >= TIMING.CAPACITY) {
      s.phase = 'saturated'; s.saturatedStart = s.clock; s.queued = 0;
    }
  } else {
    s.queued = Math.min(TIMING.MAX_QUEUE, Math.floor((s.clock - s.saturatedStart) * speed / TIMING.ARRIVAL_BEAT));
  }
}

export function targetLoads(s) {
  const target = { ...PHASES[s.phase].loads };
  if (s.phase === 'ramp') target.mem = 0.12 + (s.requests / TIMING.CAPACITY) * 0.6; // slots filling
  return target;
}

export function reset(s) {
  s.phase = 'ramp'; s.phaseStart = s.clock; s.saturatedStart = 0; s.requests = 0; s.queued = 0;
}

/** One log line per admitted request, then one per queued arrival once saturated. */
export function logLines(s) {
  const lines = [];
  const filled = Math.round(s.requests);
  for (let i = 0; i < filled; i++) {
    lines.push(`req-${String(i + 1).padStart(4, '0')} admitted · KV cache allocated (${i + 1}/${TIMING.CAPACITY})`);
  }
  for (let i = 0; i < s.queued; i++) {
    lines.push(`req-${String(TIMING.CAPACITY + i + 1).padStart(4, '0')} queued — waiting for a slot`);
  }
  return lines;
}
