import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DrivesOverview } from '../components/DrivesOverview.tsx';
import { Library } from '../types/api.ts';

const mockLibraries: Library[] = [
  {
    id: 'ssd1',
    name: 'Samsung 980 Pro (Cache)',
    type: 'ssd_cache',
    total_bytes: 1000 * 1024 * 1024 * 1024,
    free_bytes: 250 * 1024 * 1024 * 1024,
  },
  {
    id: 'hdd1',
    name: 'Seagate Barracuda (Master)',
    type: 'hdd_master',
    total_bytes: 4000 * 1024 * 1024 * 1024,
    free_bytes: 1000 * 1024 * 1024 * 1024,
  },
];

describe('DrivesOverview Component', () => {
  it('displays library drive information and metrics', () => {
    render(<DrivesOverview libraries={mockLibraries} />);

    expect(screen.getByText('Samsung 980 Pro (Cache)')).toBeInTheDocument();
    expect(screen.getByText('Seagate Barracuda (Master)')).toBeInTheDocument();
    expect(screen.getByText('SSD Cache (Fast)')).toBeInTheDocument();
    expect(screen.getByText('HDD Master (Cold)')).toBeInTheDocument();
    expect(screen.getAllByText('75%')).toHaveLength(2);
  });

  it('renders empty placeholder when no libraries exist', () => {
    render(<DrivesOverview libraries={[]} />);
    expect(screen.getByText(/No Steam libraries discovered/)).toBeInTheDocument();
  });
});
