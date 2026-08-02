import { useRef, useReducer, useEffect } from 'react';
import { lerp } from './theme.js';

const EASE_RATE = 3.5; // higher = snappier tracking of displayed load toward target

/**
 * Generic rAF-driven engine loop: advances a workload's state each frame,
 * then eases `state.disp[resource]` toward that phase's target load. Knows
 * nothing about tokens, KV caches, or redo logs — all of that lives in the
 * workload module passed in (see workloadContract.js).
 */
export function useEngineClock(workload) {
  const [, force] = useReducer((x) => x + 1, 0);
  const st = useRef(null);
  const loadedId = useRef(null);
  if (st.current === null || loadedId.current !== workload.id) {
    st.current = { playing: true, speed: 1, clock: 0, ...workload.createState() };
    loadedId.current = workload.id;
  }

  useEffect(() => {
    let raf, last = performance.now();
    const tick = (now) => {
      const s = st.current;
      const dt = Math.min(0.05, (now - last) / 1000) * (s.playing ? 1 : 0);
      last = now;
      s.clock += dt;

      workload.step(s, dt, s.speed);

      const target = workload.targetLoads ? workload.targetLoads(s) : workload.PHASES[s.phase].loads;
      for (const k of workload.ORDER) {
        s.disp[k] = lerp(s.disp[k], target[k], Math.min(1, dt * EASE_RATE + (s.playing ? 0 : 1)));
      }

      force();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [workload]);

  const s = st.current;
  const setPlay = (p) => { st.current.playing = p; force(); };
  const setSpeed = (sp) => { st.current.speed = sp; force(); };
  const resetRun = () => { workload.reset(st.current); force(); };

  return { state: s, setPlay, setSpeed, resetRun };
}
