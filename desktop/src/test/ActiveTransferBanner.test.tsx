import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveTransferBanner } from '../components/ActiveTransferBanner.tsx';
import { Game, Job } from '../types/api.ts';

describe('ActiveTransferBanner Component', () => {
  const mockGames: Game[] = [
    {
      app_id: 105600,
      name: 'Terraria',
      state: 'active_ssd',
      size_bytes: 500000000,
      current_library_id: 'ssd0',
      build_id: '105600',
      backup_clean: true,
      last_backup_time: null,
      install_dir: 'Terraria',
    },
  ];

  const mockRunningJob: Job = {
    id: 'job-123',
    type: 'backup',
    app_id: '105600',
    target_library_id: 'hdd0',
    status: 'running',
    progress_percent: 65,
    bytes_transferred: 325000000,
    total_bytes: 500000000,
    error: null,
    created_at: '2026-11-05T00:00:00Z',
    started_at: '2026-11-05T00:00:01Z',
    completed_at: null,
  };

  it('renders nothing when there is no running job', () => {
    const { container } = render(
      <ActiveTransferBanner
        runningJob={undefined}
        games={mockGames}
        onCancel={vi.fn()}
        onNavigateQueue={vi.fn()}
        cancelling={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders active transfer banner with progress and game name', () => {
    const onCancel = vi.fn();
    const onNavigateQueue = vi.fn();

    render(
      <ActiveTransferBanner
        runningJob={mockRunningJob}
        games={mockGames}
        onCancel={onCancel}
        onNavigateQueue={onNavigateQueue}
        cancelling={false}
      />
    );

    expect(screen.getByText('Terraria')).toBeInTheDocument();
    expect(screen.getByText('Backing up to HDD Master')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Queue'));
    expect(onNavigateQueue).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledWith('job-123');
  });
});
