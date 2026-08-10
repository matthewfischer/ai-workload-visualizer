/* The CI/CD pipeline workload: a pull request flows through eight stages
 * — write code, dev testing, CI build, CI test, PR review, merge, post-
 * merge QA, release — each with its own capacity. Unlike every other
 * workload here, the bottleneck isn't authored per phase, it's *computed*
 * live from knobs the viewer tunes (devs, PR rate, per-stage time and
 * capacity): a classic Theory-of-Constraints pipeline. Arrival rate is set
 * by how fast developers produce PRs; each downstream stage either keeps
 * up or queues. Whichever stage's queue is growing fastest is the
 * bottleneck, and — the point of the exercise — everything *after* it
 * looks comfortably idle, starved rather than fast. See
 * src/engine/workloadContract.js for the interface this implements
 * (including the optional KNOBS / bottleneckKey / caption extension). */

export const id = 'cipipeline';
export const label = 'Shipping a pull request';
export const subtitle = 'Live-tunable · slide the knobs, watch the bottleneck flip';

export const RESOURCES = {
  write:   { name: 'Write Code',    helps: 'more devs, smaller-scoped PRs, less context switching' },
  devtest: { name: 'Dev Testing',   helps: 'faster local test suite, better dev tooling' },
  ciBuild: { name: 'CI Build',      helps: 'more parallel build runners, build caching, incremental builds' },
  ciTest:  { name: 'CI Test',       helps: 'more parallel test runners/shards, faster suite, less flakiness' },
  review:  { name: 'PR Review',     helps: 'more reviewers, smaller PRs, review SLAs, async review tooling' },
  merge:   { name: 'Merge Queue',   helps: 'merge-train automation, trunk-based dev, fewer required approvals' },
  postQA:  { name: 'Post-merge QA', helps: 'more QA environments in parallel, feature flags, faster smoke tests' },
  release: { name: 'Release',       helps: 'more frequent/smaller releases, progressive delivery, fewer manual gates' },
};
export const ORDER = ['write', 'devtest', 'ciBuild', 'ciTest', 'review', 'merge', 'postQA', 'release'];

// Only one phase: this workload doesn't tell an authored story, it computes
// one from live knobs. The contract still needs a valid PHASES entry —
// `bottleneck`/`loads` here are unused fallbacks (see bottleneckKey/caption
// below, and targetLoads which overrides `loads` every tick).
export const PHASES = {
  flowing: {
    name: 'CI Pipeline · live',
    bottleneck: 'review',
    caption: 'Tune the knobs below and watch which stage backs up.',
    loads: { write: .3, devtest: .3, ciBuild: .3, ciTest: .3, review: .3, merge: .3, postQA: .3, release: .3 },
  },
};

// Stages that can hold a growing backlog (write/devtest are paced by the
// same developers who define the arrival rate, so they can never queue —
// see stageStats below).
const QUEUE_STAGES = ['ciBuild', 'ciTest', 'review', 'merge', 'postQA', 'release'];

const STAGE_LABEL = {
  ciBuild: 'CI Build', ciTest: 'CI Test', review: 'PR Review',
  merge: 'the merge queue', postQA: 'post-merge QA', release: 'release',
};

export const DEFAULT_KNOBS = {
  numDevs: 10,
  codingHrs: 6,
  devTestHrs: 1,
  ciBuildMin: 8,
  ciBuildRunners: 6,
  ciTestMin: 20,
  ciTestRunners: 6,
  reviewers: 3,
  reviewHrs: 3,
  mergeMin: 5,
  postQAHrs: 0.5,
  qaParallel: 4,
  releaseCadenceHrs: 24,
  releaseBatch: 50,
};

export const KNOBS = {
  numDevs:           { label: 'Developers',              min: 1,    max: 400, step: 1,    unit: '' },
  codingHrs:         { label: 'Write code (hrs/PR)',     min: 0.5,  max: 24,  step: 0.5,  unit: 'h' },
  devTestHrs:        { label: 'Dev testing (hrs/PR)',    min: 0.25, max: 8,   step: 0.25, unit: 'h' },
  ciBuildMin:        { label: 'CI build time',            min: 1,    max: 360, step: 5,    unit: 'm' },
  ciBuildRunners:    { label: 'CI build runners',         min: 1,    max: 30,  step: 1,    unit: '' },
  ciTestMin:         { label: 'CI test time',             min: 1,    max: 90,  step: 1,    unit: 'm' },
  ciTestRunners:     { label: 'CI test runners',          min: 1,    max: 30,  step: 1,    unit: '' },
  reviewers:         { label: 'Reviewers',                min: 1,    max: 50,  step: 1,    unit: '' },
  reviewHrs:         { label: 'Review turnaround (hrs/PR)', min: 0.25, max: 336, step: 1,  unit: 'h' },
  mergeMin:          { label: 'Time to merge',            min: 1,    max: 60,  step: 1,    unit: 'm' },
  postQAHrs:         { label: 'Post-merge QA',            min: 0.1,  max: 168, step: 1,    unit: 'h' },
  qaParallel:        { label: 'QA parallelism',           min: 1,    max: 20,  step: 1,    unit: '' },
  releaseCadenceHrs: { label: 'Release cadence',          min: 1,    max: 672, step: 4,    unit: 'h' },
  releaseBatch:      { label: 'PRs per release',          min: 1,    max: 200, step: 1,    unit: '' },
};

// 1 realtime second at 1x = this many simulated pipeline hours — fast
// enough that a backlog visibly builds within well under a minute.
export const SIM_HOURS_PER_SEC = 0.6;

function capacities(k) {
  return {
    write:   k.numDevs / k.codingHrs,
    devtest: k.numDevs / k.devTestHrs,
    ciBuild: k.ciBuildRunners / (k.ciBuildMin / 60),
    ciTest:  k.ciTestRunners / (k.ciTestMin / 60),
    review:  k.reviewers / k.reviewHrs,
    merge:   1 / (k.mergeMin / 60), // merges serialize, one at a time
    postQA:  k.qaParallel / k.postQAHrs,
    release: k.releaseBatch / k.releaseCadenceHrs,
  };
}

function arrivalRate(k) {
  return k.numDevs / (k.codingHrs + k.devTestHrs); // PRs/hour entering the pipeline
}

/** Per-stage capacity (PRs/hr), arrival rate, and utilization — utilization
 * can exceed 1 (that stage's queue is growing); everything downstream only
 * ever sees the running-minimum capacity so far, so it can't queue faster
 * than the true constraint upstream of it. */
function stageStats(knobs) {
  const cap = capacities(knobs);
  const R = arrivalRate(knobs);
  const util = { write: R / cap.write, devtest: R / cap.devtest };
  let inflow = R;
  for (const key of QUEUE_STAGES) {
    util[key] = inflow / cap[key];
    inflow = Math.min(inflow, cap[key]);
  }
  return { cap, R, util };
}

export function createState() {
  return {
    phase: 'flowing', phaseStart: 0,
    knobs: { ...DEFAULT_KNOBS },
    queues: { ciBuild: 0, ciTest: 0, review: 0, merge: 0, postQA: 0, release: 0 },
    completed: { ciBuild: 0, ciTest: 0, review: 0, merge: 0, postQA: 0, release: 0 },
    prCounter: 0,
    disp: { write: 0, devtest: 0, ciBuild: 0, ciTest: 0, review: 0, merge: 0, postQA: 0, release: 0 },
  };
}

export function step(s, dt, speed) {
  const dtHours = dt * speed * SIM_HOURS_PER_SEC;
  if (dtHours <= 0) return;
  const { cap, R } = stageStats(s.knobs);
  s.prCounter += R * dtHours;

  let inflow = R;
  for (const key of QUEUE_STAGES) {
    const c = cap[key];
    s.queues[key] = Math.max(0, s.queues[key] + (inflow - c) * dtHours);
    const throughput = Math.min(inflow, c);
    s.completed[key] += throughput * dtHours;
    inflow = throughput;
  }
}

export function targetLoads(s) {
  const { util } = stageStats(s.knobs);
  const target = {};
  for (const key of ORDER) target[key] = Math.max(0, Math.min(1, util[key]));
  return target;
}

/** The stage with the highest utilization is the bottleneck — computed,
 * not authored. write/devtest can never win: they're paced by the same
 * devs who set the arrival rate, so their utilization is always <= 1 and
 * generally low. */
export function bottleneckKey(s) {
  const { util } = stageStats(s.knobs);
  let best = ORDER[0], bestV = -Infinity;
  for (const key of ORDER) {
    if (util[key] > bestV) { bestV = util[key]; best = key; }
  }
  return best;
}

export function caption(s) {
  const bn = bottleneckKey(s);
  const { util } = stageStats(s.knobs);
  const pctStr = Math.round(util[bn] * 100);
  const queued = s.queues[bn] ? ` ${Math.floor(s.queues[bn])} PR(s) queued and climbing.` : '';
  if (bn === 'write' || bn === 'devtest') {
    return `Every stage has spare capacity — developers themselves are pacing the pipeline (${pctStr}% of their own output rate). Nothing downstream is waiting.`;
  }
  return `${STAGE_LABEL[bn]} is the wall at ${pctStr}% of capacity.${queued} Every stage after it is comfortably idle — not because it's fast, but because it's starved.`;
}

export function reset(s) {
  s.phase = 'flowing'; s.phaseStart = s.clock;
  s.queues = { ciBuild: 0, ciTest: 0, review: 0, merge: 0, postQA: 0, release: 0 };
  s.completed = { ciBuild: 0, ciTest: 0, review: 0, merge: 0, postQA: 0, release: 0 };
  s.prCounter = 0;
}

export function headerLabel(s) {
  return `${Math.floor(s.prCounter)} PRs opened · ${Math.floor(s.completed.release)} released`;
}

/** GitHub-style status lines for the terminal panel, one per queueable
 * stage plus the latest PR opened, all derived from state (deterministic). */
export function logLines(s) {
  const { cap } = stageStats(s.knobs);
  const opened = Math.floor(s.prCounter);
  const lines = [`PR #${1000 + opened} opened by dev-${opened === 0 ? 1 : (opened % s.knobs.numDevs) + 1}`];
  for (const key of QUEUE_STAGES) {
    const done = Math.floor(s.completed[key]);
    const q = Math.floor(s.queues[key]);
    if (q > 0) {
      lines.push(`${STAGE_LABEL[key]}: ${q} PR(s) queued — capacity ${cap[key].toFixed(1)}/hr`);
    } else if (done > 0) {
      lines.push(`PR #${1000 + done} → ${STAGE_LABEL[key]} passed`);
    } else {
      lines.push(`${STAGE_LABEL[key]}: idle`);
    }
  }
  return lines;
}
