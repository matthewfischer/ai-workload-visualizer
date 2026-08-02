/* The oversubscribed-host workload: pile VMs onto one box until the
 * scheduler, not the silicon, is the wall. The point is a contrast, not a
 * bottleneck race — raw CPU utilization barely moves between the two
 * phases, because the physical cores were never really the constraint.
 * What explodes is CPU Ready: the time each vCPU spends queued for a
 * turn on a physical core once there are more vCPUs than cores to go
 * around. The newest, fastest CPU doesn't fix that; it just moves where
 * the queue starts. See src/engine/workloadContract.js for the interface
 * this implements. */

export const id = 'noisyneighbor';
export const label = 'Oversubscribing a host';
export const subtitle = "Right-sized → Oversubscribed · a faster CPU won't fix a scheduling queue";

export const RESOURCES = {
  storage: { name: 'Datastore I/O', helps: 'a faster shared array, spreading VMs across more datastores' },
  mem:     { name: 'Host Memory',   helps: 'more RAM, ballooning/compression tuning, right-sizing memory reservations' },
  cpu:     { name: 'Host CPU',      helps: "faster clock, more physical cores — but only helps if you aren't already oversubscribed" },
  ready:   { name: 'CPU Ready',     helps: 'fewer vCPUs per physical core, NUMA-aware scheduling, right-sizing VMs instead of over-provisioning' },
};
export const ORDER = ['storage', 'mem', 'cpu', 'ready'];

export const PHASES = {
  comfortable: {
    name: 'Right-sized host',
    bottleneck: 'cpu',
    caption: "A dozen VMs share the host comfortably — plenty of physical cores for every vCPU. Whatever's actually running inside them is irrelevant; the scheduler never has to make anyone wait.",
    loads: { storage: .15, mem: .30, cpu: .45, ready: .05 },
  },
  oversubscribed: {
    name: 'Oversubscribed host',
    bottleneck: 'ready',
    caption: "More VMs got piled on without adding cores. Raw CPU utilization barely moves — the newest, fastest chips wouldn't fix this — but every vCPU now queues for a turn on a physical core. That queue time, CPU Ready, is what the VMs actually feel as slowness.",
    loads: { storage: .25, mem: .55, cpu: .55, ready: .92 },
  },
};

export const TIMING = {
  RAMP_DUR: 3.0,       // seconds at 1x to fill the host to a comfortable count
  PILE_DUR: 4.0,       // seconds at 1x to keep piling past comfortable
  CORE_COUNT: 8,       // physical cores on the host — fixed, never changes
  COMFORTABLE_VMS: 8,  // roughly 1 vCPU per core, no contention
  MAX_VMS: 24,         // 3 vCPUs per core by the end — visibly oversubscribed
};

export function createState() {
  return {
    phase: 'comfortable', phaseStart: 0, vmCount: 0,
    disp: { storage: 0, mem: 0, cpu: 0, ready: 0 },
  };
}

export function step(s, dt, speed) {
  const elapsed = (s.clock - s.phaseStart) * speed;
  if (s.phase === 'comfortable') {
    s.vmCount = Math.min(TIMING.COMFORTABLE_VMS, (elapsed / TIMING.RAMP_DUR) * TIMING.COMFORTABLE_VMS);
    if (elapsed > TIMING.RAMP_DUR) { s.phase = 'oversubscribed'; s.phaseStart = s.clock; }
  } else {
    const over = Math.min(1, elapsed / TIMING.PILE_DUR);
    s.vmCount = TIMING.COMFORTABLE_VMS + over * (TIMING.MAX_VMS - TIMING.COMFORTABLE_VMS);
  }
}

export function targetLoads(s) {
  const target = { ...PHASES[s.phase].loads };
  if (s.phase === 'comfortable') {
    const frac = s.vmCount / TIMING.COMFORTABLE_VMS;
    target.cpu = 0.15 + frac * 0.35;
    target.ready = 0.03 + frac * 0.05;
  } else {
    const over = Math.max(0, s.vmCount - TIMING.COMFORTABLE_VMS) / (TIMING.MAX_VMS - TIMING.COMFORTABLE_VMS);
    target.cpu = 0.50 + over * 0.12;   // barely moves — that's the point
    target.ready = 0.10 + over * 0.85; // this is what actually explodes
  }
  return target;
}

export function reset(s) {
  s.phase = 'comfortable'; s.phaseStart = s.clock; s.vmCount = 0;
}

/** esxtop-flavored log lines for the terminal panel, given current state. */
export function logLines(s) {
  const lines = [];
  const n = Math.round(s.vmCount);
  const readyPct = Math.round(s.disp.ready * 100);
  const cpuPct = Math.round(s.disp.cpu * 100);
  if (s.phase === 'comfortable') {
    for (let i = Math.max(0, n - 8); i < n; i++) {
      lines.push(`vm-${String(i + 1).padStart(2, '0')} powered on · %RDY ~${readyPct}`);
    }
  } else {
    for (let i = Math.max(0, n - 6); i < n; i++) {
      lines.push(`vm-${String(i + 1).padStart(2, '0')} powered on · %RDY ~${readyPct + (i % 3) * 4}`);
    }
    lines.push(`esxtop: host CPU ${cpuPct}% util · aggregate %RDY climbing, ${n} vCPUs on ${TIMING.CORE_COUNT} cores`);
  }
  return lines;
}
