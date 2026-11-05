import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardView } from '../components/DashboardView.tsx';
import { Game, Job, Library } from '../types/api.ts';

const mockLibraries: Library[] = [
  { id: 'ssd1', name: 'Steam Library (C: Drive)', type: 'ssd_cache', total_bytes: 1000000000000, free_bytes: 500000000000 },
  { id: 'hdd1', name: 'Games Library (D: Drive)', type: 'hdd_master', total_bytes: 4000000000000, free_bytes: 2000000000000 },
];

const mockGames: Game[] = [
  {
    app_id: 105600,
    name: 'Terraria',
    install_dir: 'Terraria',
    size_bytes: 500 * 1024 * 1024,
    state: 'active_ssd',
    current_library_id: 'ssd1',
    build_id: '12345',
    last_backup_time: '2026-11-01T12:00:00Z',
    backup_clean: true,
  },
  {
    app_id: 221380,
    name: 'Age of Empires II HD',
    install_dir: 'Age2HD',
    size_bytes: 2000 * 1024 * 1024,
    state: 'storage_hdd',
    current_library_id: 'hdd1',
    build_id: '67890',
    last_backup_time: '2026-10-31T12:00:00Z',
    backup_clean: true,
  },
];

const mockJobs: Job[] = [
  {
    id: 'job-1',
    type: 'promote',
    app_id: '221380',
    target_library_id: 'ssd1',
    status: 'running',
    progress_percent: 50,
    bytes_transferred: 1000000,
    total_bytes: 2000000,
    error: null,
    created_at: '2026-11-04T12:00:00Z',
  },
];

describe('DashboardView Component', () => {
  it('renders stats, capacity cards, and fast SSD games preview', () => {
    const onNavigate = vi.fn();
    const onAction = vi.fn();
    const onOpenWizard = vi.fn();

    render(
      <DashboardView
        games={mockGames}
        libraries={mockLibraries}
        jobs={mockJobs}
        onNavigate={onNavigate}
        onAction={onAction}
        actionLoading={false}
        onOpenWizard={onOpenWizard}
      />
    );

    expect(screen.getByText('TOTAL GAMES')).toBeInTheDocument();
    expect(screen.getAllByText('Steam Library (C: Drive)')).toHaveLength(2);
    expect(screen.getAllByText('Games Library (D: Drive)')).toHaveLength(2);
    expect(screen.getByText('TRANSFER QUEUE')).toBeInTheDocument();

    // Check game preview
    expect(screen.getByText('Terraria')).toBeInTheDocument();

    // Test navigate click
    fireEvent.click(screen.getByText('Browse Games'));
    expect(onNavigate).toHaveBeenCalledWith('games');
  });
});
