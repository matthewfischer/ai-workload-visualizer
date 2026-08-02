import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App.jsx';
import { WORKLOAD_LIST } from '../workloads/index.js';

describe('App', () => {
  it('mounts and shows the default workload without crashing', () => {
    render(<App />);
    expect(screen.getByText('Prefill')).toBeInTheDocument();
    expect(screen.getByText(/❚❚ Pause|▶ Play/)).toBeInTheDocument();
  });

  it.each(WORKLOAD_LIST)('switching to $id renders without crashing', (w) => {
    render(<App />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: w.id } });
    const initialPhase = w.PHASES[w.createState().phase];
    expect(screen.getByText(initialPhase.name)).toBeInTheDocument();
  });
});
