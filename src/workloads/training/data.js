/* The distributed-training workload: many GPUs each computing a shard of a
 * batch, then synchronizing gradients before the next step. Same
 * resource model, but network-bound rather than compute- or
 * bandwidth-bound: the forward/backward pass is a compute wall, but the
 * gradient all-reduce that follows saturates the cross-node fabric while
 * compute goes idle waiting. Unlike the other workloads (one run, done),
 * training loops compute <-> all-reduce forever, incrementing a step
 * counter — that repetition is the point. See
 * src/engine/workloadContract.js for the interface this implements. */

export const id = 'training';
export const label = 'Training at scale';
export const subtitle = 'Forward/backward -> All-reduce · 2-socket, 8-GPU hosts';

export const NODE_COUNT = 2;
export const SOCKETS_PER_NODE = 2;
export const GPUS_PER_SOCKET = 4;
export const GPUS_PER_NODE = SOCKETS_PER_NODE * GPUS_PER_SOCKET;
export const INTERCONNECT_PATHS = [
  { key: 'nvlink', label: 'NVLink / NVSwitch', note: 'socket-local GPU fabric', pressure: 0.48 },
  { key: 'pcieSwitch', label: 'PCIe switch', note: 'shared switch bandwidth', pressure: 0.76 },
  { key: 'cpuPath', label: 'CPU root path', note: 'GPU -> CPU/UPI -> GPU bounce', pressure: 0.97 },
];

export const RESOURCES = {
  compute: { name: 'GPU Compute',   helps: 'newer tensor cores, FP8/FP16 math, AMX-style matrix engines' },
  hbmBw:   { name: 'HBM Bandwidth', helps: 'faster HBM (HBM3e), quantization, bigger micro-batches' },
  mem:     { name: 'HBM Capacity',  helps: 'more VRAM, activation checkpointing, ZeRO-style optimizer sharding' },
  nic:     { name: 'Network',       helps: 'faster fabric, more NICs, RDMA, better all-reduce topology' },
  gpuLink: { name: 'GPU-GPU Link',  helps: 'NVLink/NVSwitch, topology-aware rank placement, avoiding CPU/root-complex bounce paths' },
  cpuLink: { name: 'CPU Interconnect', helps: 'NUMA-aware data placement, keeping GPU traffic socket-local, avoiding cross-socket CPU bounce paths' },
  cpu:     { name: 'Host CPU',      helps: 'balanced data loaders per socket, faster / more host cores, NUMA-aware pinning' },
  pcie:    { name: 'PCIe',          helps: 'PCIe 5->6, balanced roots/switches, or NVLink/NVSwitch to bypass the host entirely' },
};
export const ORDER = ['nic', 'gpuLink', 'cpuLink', 'cpu', 'pcie', 'compute', 'hbmBw', 'mem'];

export const PHASES = {
  compute: {
    name: 'Forward / backward pass',
    bottleneck: 'compute',
    caption: 'Each host is a two-socket system with four GPUs attached to each CPU/root complex. During forward/backward, all 16 GPUs crunch their local shards while host CPUs fan input batches to their attached GPUs.',
    loads: { nic: .10, gpuLink: .24, cpuLink: .18, cpu: .32, pcie: .40, compute: .94, hbmBw: .55, mem: .55 },
  },
  allreduce: {
    name: 'Gradient all-reduce',
    bottleneck: 'nic',
    caption: 'Every GPU shares gradients before the next step. Socket-local NVLink/NVSwitch handles the fast GPU exchange, UPI/QPI connects the two CPUs inside each host, and the cross-node RDMA fabric is pinned.',
    loads: { nic: .95, gpuLink: .78, cpuLink: .42, cpu: .22, pcie: .62, compute: .15, hbmBw: .40, mem: .55 },
  },
};

export const TIMING = {
  COMPUTE_DUR: 2.6,   // seconds at 1x per forward/backward pass
  ALLREDUCE_DUR: 2.0, // seconds at 1x per gradient sync
};

export function createState() {
  return {
    phase: 'compute', phaseStart: 0, trainStep: 0,
    disp: { nic: 0, gpuLink: 0, cpuLink: 0, cpu: 0, pcie: 0, compute: 0, hbmBw: 0, mem: 0 },
  };
}

export function step(s, dt, speed) {
  const dur = s.phase === 'compute' ? TIMING.COMPUTE_DUR : TIMING.ALLREDUCE_DUR;
  if (s.clock - s.phaseStart > dur / speed) {
    if (s.phase === 'compute') {
      s.phase = 'allreduce';
    } else {
      s.phase = 'compute';
      s.trainStep += 1;
    }
    s.phaseStart = s.clock;
  }
}

export function reset(s) {
  s.phase = 'compute'; s.phaseStart = s.clock; s.trainStep = 0;
}

// Fake (not measured) per-step loss curve and all-reduce sync duration —
// deterministic functions of the step number so the log reads the same on
// every run, in the spirit of a real training console.
function lossAt(step) {
  return Math.max(0.12, 2.4 * Math.exp(-step / 18) + 0.06 * Math.sin(step * 1.7));
}
function syncMsAt(step) {
  return 260 + (step % 5) * 18;
}

/** One "forward/backward" line per completed step, plus its "all-reduce" line, plus the in-flight step. */
export function logLines(s) {
  const lines = [];
  for (let i = 0; i < s.trainStep; i++) {
    lines.push(`step ${i} · forward/backward · loss ${lossAt(i).toFixed(3)}`);
    lines.push(`step ${i} · all-reduce · synced (${syncMsAt(i)}ms)`);
  }
  lines.push(`step ${s.trainStep} · forward/backward · loss ${lossAt(s.trainStep).toFixed(3)}`);
  if (s.phase === 'allreduce') lines.push(`step ${s.trainStep} · all-reduce · syncing…`);
  return lines;
}
