import { useState } from 'react';
import { C } from './engine/theme.js';
import App from './App.jsx';
import LeverImpact from './levers/LeverImpact.jsx';

const TABS = [
  { id: 'sim', label: 'Workload Simulator' },
  { id: 'lever', label: 'Hardware Lever Impact' },
];

export default function Shell() {
  const [tab, setTab] = useState('sim');
  return (
    <div>
      <style>{`
        .btn{cursor:pointer;transition:all .15s ease;user-select:none}
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingTop: 20 }}>
        {TABS.map((t) => (
          <div key={t.id} className="btn" onClick={() => setTab(t.id)}
            style={{ padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              background: tab === t.id ? C.cyan : 'transparent', color: tab === t.id ? '#04222a' : C.mut,
              border: `1px solid ${tab === t.id ? C.cyan : C.edge}`, fontFamily: C.sans }}>
            {t.label}
          </div>
        ))}
      </div>
      {tab === 'sim' ? <App /> : <LeverImpact />}
    </div>
  );
}
