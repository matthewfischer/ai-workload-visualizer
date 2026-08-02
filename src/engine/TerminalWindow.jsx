import { C } from './theme.js';

/* Generic terminal-style chrome: a title bar with traffic-light dots and a
   monospace body. Content is entirely supplied by the workload (its
   optional `Terminal` export) — this file knows nothing about tokens,
   prompts, or log lines. Not every workload has to implement one. */
export function TerminalWindow({ title = 'output', children }) {
  return (
    <div style={{ background: '#0c1017', border: `1px solid ${C.edge}`, borderRadius: 10, marginTop: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: '#111826', borderBottom: `1px solid ${C.edge}` }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e', display: 'inline-block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840', display: 'inline-block' }} />
        <span style={{ marginLeft: 8, fontFamily: C.mono, fontSize: 11, color: C.mut }}>{title}</span>
      </div>
      <div style={{ padding: '10px 14px', fontFamily: C.mono, fontSize: 12.5, lineHeight: 1.6, color: '#c9e9d8', minHeight: 92, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {children}
      </div>
    </div>
  );
}
