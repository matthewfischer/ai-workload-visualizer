/* The OLTP redo-log workload: sessions execute SQL against the buffer
 * cache, queuing redo entries in the log buffer, then COMMIT. Unlike the
 * GPU workloads, the wall here isn't throughput, it's synchronous write
 * latency: LGWR must physically flush the log buffer to the redo log and
 * get the write acknowledged before any of those COMMITs can return —
 * Oracle's classic "log file sync" wait. Loops compute <-> flush forever,
 * incrementing a committed-transaction counter, the same shape as the
 * training workload's step loop. See src/engine/workloadContract.js for
 * the interface this implements. */

export const id = 'redolog';
export const label = 'Committing OLTP transactions';
export const subtitle = 'Execute → Commit · every COMMIT waits on the redo log write';

export const RESOURCES = {
  netClient:   { name: 'Client Network', helps: 'fewer round trips per transaction, connection pooling, statement batching' },
  cpu:         { name: 'DB CPU',         helps: 'faster / more cores, bind variables to cut parsing, better execution plans' },
  bufferCache: { name: 'Buffer Cache',   helps: 'larger SGA, higher cache hit ratio, fewer physical reads' },
  dataDisk:    { name: 'Data File I/O',  helps: 'faster data disks, more DBWR processes, longer checkpoint intervals' },
  logBuf:      { name: 'Log Buffer',     helps: 'larger log buffer, commit batching / group commit to reduce flush frequency' },
  redoDisk:    { name: 'Redo Log I/O',   helps: 'dedicated low-latency disk for redo, multiplexed log members, fewer log switches' },
};
export const ORDER = ['netClient', 'cpu', 'bufferCache', 'dataDisk', 'logBuf', 'redoDisk'];

export const PHASES = {
  executing: {
    name: 'Executing transactions',
    bottleneck: 'cpu',
    caption: 'Sessions parse and execute SQL against the buffer cache, queuing their redo entries in the log buffer. Nothing has to touch disk yet — CPU is the busy one.',
    loads: { netClient: .35, cpu: .82, bufferCache: .55, dataDisk: .18, logBuf: .10, redoDisk: .08 },
  },
  commit: {
    name: 'Committing · log file sync',
    bottleneck: 'redoDisk',
    caption: "Every session's COMMIT blocks until LGWR physically flushes the log buffer to the redo log and the write is acknowledged. However fast the CPU finished, the transaction isn't durable — and the client isn't released — until that fsync lands.",
    loads: { netClient: .40, cpu: .25, bufferCache: .30, dataDisk: .20, logBuf: .90, redoDisk: .97 },
  },
};

export const TIMING = {
  EXEC_DUR: 2.6,     // seconds at 1x to fill the log buffer with a batch of work
  COMMIT_DUR: 2.2,   // seconds at 1x for LGWR to flush + fsync
  BATCH_SIZE: 220,   // transactions committed per flush
  MAX_BLOCKED: 9,     // sessions shown queued on log file sync at full commit
};

export function createState() {
  return {
    phase: 'executing', phaseStart: 0, commitStart: 0,
    txns: 0, logFill: 0, flushT: 0, blocked: 0,
    disp: { netClient: 0, cpu: 0, bufferCache: 0, dataDisk: 0, logBuf: 0, redoDisk: 0 },
  };
}

export function step(s, dt, speed) {
  if (s.phase === 'executing') {
    s.logFill = Math.min(1, s.logFill + dt * (1 / TIMING.EXEC_DUR) * speed);
    if (s.clock - s.phaseStart > TIMING.EXEC_DUR / speed) {
      s.phase = 'commit'; s.commitStart = s.clock; s.flushT = 0; s.blocked = 0;
    }
  } else {
    s.flushT = Math.min(1, (s.clock - s.commitStart) * speed / TIMING.COMMIT_DUR);
    s.blocked = Math.min(TIMING.MAX_BLOCKED, Math.floor(s.flushT * TIMING.MAX_BLOCKED));
    if (s.flushT >= 1) {
      s.txns += TIMING.BATCH_SIZE;
      s.phase = 'executing'; s.phaseStart = s.clock; s.logFill = 0; s.blocked = 0;
    }
  }
}

export function targetLoads(s) {
  const target = { ...PHASES[s.phase].loads };
  if (s.phase === 'executing') target.logBuf = 0.10 + s.logFill * 0.80;
  else target.logBuf = Math.max(0.08, 0.85 * (1 - s.flushT));
  return target;
}

export function reset(s) {
  s.phase = 'executing'; s.phaseStart = s.clock; s.commitStart = 0;
  s.txns = 0; s.logFill = 0; s.flushT = 0; s.blocked = 0;
}

// Sample OLTP statements, revealed in the terminal panel as the log buffer
// fills — a plausible bank-ledger workload, not measured, just concrete.
export const SESSIONS = [
  'sess:14 UPDATE accounts SET balance = balance - 120 WHERE id = 88231',
  'sess:22 INSERT INTO orders (id, total) VALUES (55210, 44.90)',
  'sess:09 UPDATE inventory SET qty = qty - 1 WHERE sku = 4471',
  'sess:31 UPDATE accounts SET balance = balance + 120 WHERE id = 90144',
  'sess:18 INSERT INTO audit_log (txn, ts) VALUES (55211, SYSTIMESTAMP)',
  'sess:05 UPDATE accounts SET balance = balance - 9 WHERE id = 12290',
];

/** Scrolling log lines for the terminal panel, given current state. */
export function logLines(s) {
  const lines = [];
  if (s.phase === 'executing') {
    const n = Math.max(1, Math.round(s.logFill * SESSIONS.length));
    for (let i = 0; i < n; i++) lines.push(`${SESSIONS[i % SESSIONS.length]}  · redo queued`);
    lines.push(`log buffer ${Math.round(s.logFill * 100)}% full — ${n} session(s) holding a COMMIT`);
  } else {
    lines.push(`LGWR: flushing log buffer → redo log (${Math.round(s.flushT * 100)}%)`);
    lines.push(`${s.blocked} session(s) waiting on 'log file sync'`);
    if (s.flushT >= 1) lines.push(`LGWR: write complete — ${s.txns} txns committed total`);
  }
  return lines;
}
