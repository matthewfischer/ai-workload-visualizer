/* The vMotion workload: live-migrating a running VM from one host to
 * another with (effectively) zero downtime. Two very differently shaped
 * phases: precopy is a convergence race, iteratively shipping whatever
 * memory got dirtied since the last pass over the migration network,
 * while the VM keeps running and dirtying more of it — the link is the
 * wall. Switchover is the opposite: a brief, unavoidable stun where the
 * VM is suspended on the source, the last sliver of state moves, and the
 * destination host powers it on and takes over its network identity —
 * that's the one moment the guest (and anyone pinging it) can notice.
 * See src/engine/workloadContract.js for the interface this implements. */

export const id = 'vmotion';
export const label = 'Live-migrating a VM';
export const subtitle = 'Precopy → Switchover · the link is the wall, until the very last moment';

export const RESOURCES = {
  storage: { name: 'Shared Storage',        helps: "irrelevant here — pure vMotion never touches it, only Storage vMotion would" },
  srcCpu:  { name: 'Source Host CPU',       helps: 'faster / more cores, less contention from other VMs on the source' },
  mem:     { name: 'Guest Memory',          helps: 'smaller VM memory footprint, dirty-page throttling, faster convergence tuning' },
  dstCpu:  { name: 'Destination Host CPU',  helps: 'faster / more cores, a pre-warmed destination host' },
  net:     { name: 'vMotion Network',       helps: 'a dedicated vMotion NIC (10G→25/100G), multi-NIC vMotion, RDMA' },
};
export const ORDER = ['storage', 'srcCpu', 'mem', 'dstCpu', 'net'];

export const PHASES = {
  precopy: {
    name: 'Precopy — iterative memory copy',
    bottleneck: 'net',
    caption: "The VM keeps running on the source host while its memory copies over in passes. Each pass only has to ship what got dirtied since the last one — but the migration link is what's saturated doing it; nothing else is close.",
    loads: { storage: .05, srcCpu: .42, mem: .55, dstCpu: .28, net: .93 },
  },
  switchover: {
    name: 'Switchover',
    bottleneck: 'dstCpu',
    caption: "The VM is briefly suspended on the source, the last sliver of state moves over, and the destination host powers it on and takes over its network identity. This is the only moment anyone notices — everything before this was invisible.",
    loads: { storage: .05, srcCpu: .55, mem: .60, dstCpu: .95, net: .35 },
  },
};

export const TIMING = {
  PRECOPY_DUR: 4.0,    // seconds at 1x for the whole precopy convergence
  PASS_COUNT: 4,       // number of copy passes visualized during precopy
  SWITCHOVER_DUR: 1.0, // seconds at 1x for the stun window (real life: ms)
};

export function createState() {
  return {
    phase: 'precopy', phaseStart: 0,
    pass: 1, dirtyPct: 1, stunT: 0,
    disp: { storage: 0, srcCpu: 0, mem: 0, dstCpu: 0, net: 0 },
  };
}

export function step(s, dt, speed) {
  if (s.phase === 'precopy') {
    const elapsed = (s.clock - s.phaseStart) * speed;
    const passDur = TIMING.PRECOPY_DUR / TIMING.PASS_COUNT;
    s.pass = Math.min(TIMING.PASS_COUNT, Math.floor(elapsed / passDur) + 1);
    s.dirtyPct = Math.max(0.03, Math.pow(0.35, s.pass - 1));
    if (elapsed > TIMING.PRECOPY_DUR) {
      s.phase = 'switchover'; s.phaseStart = s.clock; s.stunT = 0;
    }
  } else {
    s.stunT = Math.min(1, (s.clock - s.phaseStart) * speed / TIMING.SWITCHOVER_DUR);
  }
}

export function targetLoads(s) {
  const target = { ...PHASES[s.phase].loads };
  if (s.phase === 'precopy') target.mem = 0.20 + s.dirtyPct * 0.65;
  return target;
}

export function reset(s) {
  s.phase = 'precopy'; s.phaseStart = s.clock;
  s.pass = 1; s.dirtyPct = 1; s.stunT = 0;
}

/** Scrolling log lines for the terminal panel, given current state. */
export function logLines(s) {
  const lines = [];
  if (s.phase === 'precopy') {
    for (let p = 1; p < s.pass; p++) {
      const dirty = Math.round(Math.pow(0.35, p - 1) * 100);
      lines.push(`vMotion: pass ${p}/${TIMING.PASS_COUNT} complete — shipped ${dirty}% of guest memory`);
    }
    lines.push(`vMotion: pass ${s.pass}/${TIMING.PASS_COUNT} in progress — ${Math.round(s.dirtyPct * 100)}% still dirty`);
  } else {
    lines.push('vMotion: quiescing VM on esx-01');
    if (s.stunT < 1) {
      lines.push(`vMotion: transferring device state + final delta (${Math.round(s.stunT * 100)}%)`);
    } else {
      lines.push('vMotion: VM resumed on esx-02');
      lines.push(`vMotion: migration complete — stun time ~${Math.round(TIMING.SWITCHOVER_DUR * 1000)}ms`);
    }
  }
  return lines;
}
