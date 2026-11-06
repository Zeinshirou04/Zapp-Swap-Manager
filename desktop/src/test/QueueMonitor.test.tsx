import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueueMonitor } from '../components/QueueMonitor.tsx';
import { Job, Game } from '../types/api.ts';

const mockGames: Game[] = [
  {
    app_id: 3513350,
    name: 'Wuthering Waves',
    current_library_id: 'hdd-0',
    install_dir: 'Wuthering Waves',
    size_bytes: 100000000000,
    state: 'storage_hdd',
    build_id: '123',
    last_backup_time: null,
    backup_clean: true,
  },
  {
    app_id: 105600,
    name: 'Terraria',
    current_library_id: 'ssd-0',
    install_dir: 'Terraria',
    size_bytes: 500000000,
    state: 'active_ssd',
    build_id: '456',
    last_backup_time: null,
    backup_clean: true,
  },
];

const mockJobs: Job[] = [
  {
    id: 'job-1',
    type: 'promote',
    app_id: '3513350',
    target_library_id: 'ssd-0',
    status: 'running',
    progress_percent: 45.5,
    bytes_transferred: 45500000000,
    total_bytes: 100000000000,
    error: null,
    created_at: '2026-11-06T12:00:00Z',
    started_at: '2026-11-06T12:00:01Z',
    completed_at: null,
  },
  {
    id: 'job-2',
    type: 'backup',
    app_id: '105600',
    target_library_id: 'hdd-0',
    status: 'succeeded',
    progress_percent: 100.0,
    bytes_transferred: 500000000,
    total_bytes: 500000000,
    error: null,
    created_at: '2026-11-06T11:50:00Z',
    started_at: '2026-11-06T11:50:01Z',
    completed_at: '2026-11-06T11:51:00Z',
  },
];

describe('QueueMonitor Component', () => {
  it('renders game name, friendly action pill, and progress without redundant status pills', () => {
    const onCancel = vi.fn();
    render(
      <QueueMonitor
        jobs={mockJobs}
        games={mockGames}
        onCancelJob={onCancel}
        cancelling={false}
      />
    );

    // Shows friendly game names
    expect(screen.getByText('Wuthering Waves')).toBeInTheDocument();
    expect(screen.getByText('Terraria')).toBeInTheDocument();

    // Friendly action pills
    expect(screen.getByText('Move to SSD')).toBeInTheDocument();
    expect(screen.getByText('Backup to HDD')).toBeInTheDocument();

    // Redundant status badges like "succeeded" or "running" as text badges should not be present
    expect(screen.queryByText('succeeded')).not.toBeInTheDocument();

    // Running job shows percent and progress info
    expect(screen.getAllByText('46%').length).toBeGreaterThan(0);
    expect(screen.getByText(/42\.38 GB \/ 93\.13 GB/i)).toBeInTheDocument();

    // Cancel button for running job
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    expect(cancelBtn).toBeInTheDocument();
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledWith('job-1');
  });

  it('renders clean empty state when no jobs exist', () => {
    render(
      <QueueMonitor
        jobs={[]}
        games={mockGames}
        onCancelJob={vi.fn()}
        cancelling={false}
      />
    );

    expect(screen.getByText(/No transfer jobs in queue or history/i)).toBeInTheDocument();
  });
});
