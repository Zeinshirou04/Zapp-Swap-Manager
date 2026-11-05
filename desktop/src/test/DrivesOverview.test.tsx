import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrivesOverview } from '../components/DrivesOverview.tsx';
import { Library } from '../types/api.ts';

const mockLibraries: Library[] = [
  {
    id: 'ssd1',
    name: 'Steam Library (C: Drive)',
    type: 'ssd_cache',
    total_bytes: 1000 * 1024 * 1024 * 1024,
    free_bytes: 250 * 1024 * 1024 * 1024,
  },
  {
    id: 'hdd1',
    name: 'Games Library (D: Drive)',
    type: 'hdd_master',
    total_bytes: 4000 * 1024 * 1024 * 1024,
    free_bytes: 1000 * 1024 * 1024 * 1024,
  },
];

describe('DrivesOverview Component', () => {
  it('displays library drive information and metrics', () => {
    render(<DrivesOverview libraries={mockLibraries} />);

    expect(screen.getByText('Steam Library (C: Drive)')).toBeInTheDocument();
    expect(screen.getByText('Games Library (D: Drive)')).toBeInTheDocument();
    expect(screen.getAllByText('Library Games Storage')).toHaveLength(2);
    expect(screen.getAllByText('75%')).toHaveLength(2);
  });

  it('renders empty placeholder when no libraries exist', () => {
    render(<DrivesOverview libraries={[]} />);
    expect(screen.getByText(/No game libraries discovered/)).toBeInTheDocument();
  });
});
