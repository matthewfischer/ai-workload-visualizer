import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App.jsx';

describe('App', () => {
  it('mounts and shows the default workload without crashing', () => {
    render(<App />);
    expect(screen.getByText('Prefill')).toBeInTheDocument();
    expect(screen.getByText(/❚❚ Pause|▶ Play/)).toBeInTheDocument();
  });
});
