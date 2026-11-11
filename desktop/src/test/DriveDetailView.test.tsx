import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DriveDetailView } from '../components/DriveDetailView.tsx';
import { Library, Game, Job } from '../types/api.ts';

const mockLibrary: Library = {
  id: 'ssd-0',
  name: 'Steam Library (C: Drive)',
  path: 'C:\\SteamLibrary',
  type: 'ssd_cache',
  total_bytes: 1000000000000, // 1 TB
  free_bytes: 400000000000,   // 400 GB
};

const mockGames: Game[] = [
  {
    app_id: 105600,
    name: 'Terraria',
    current_library_id: 'ssd-0',
    install_dir: 'Terraria',
    size_bytes: 500000000,
    state: 'active_ssd',
    build_id: '123',
    last_backup_time: null,
    backup_clean: true,
  },
  {
    app_id: 3513350,
    name: 'Wuthering Waves',
    current_library_id: 'hdd-0',
    install_dir: 'Wuthering Waves',
    size_bytes: 100000000000,
    state: 'storage_hdd',
    build_id: '456',
    last_backup_time: null,
    backup_clean: true,
  },
];

const mockJobs: Job[] = [];

describe('DriveDetailView Component', () => {
  it('renders drive hardware details, space stats, and library id', () => {
    const onBack = vi.fn();
    const onUpdatePath = vi.fn().mockResolvedValue(undefined);

    render(
      <DriveDetailView
        library={mockLibrary}
        games={mockGames}
        allLibraries={[mockLibrary]}
        jobs={mockJobs}
        onBack={onBack}
        onUpdatePath={onUpdatePath}
      />
    );

    // Header & drive type
    expect(screen.getByText(/Fast Cache Storage \(SSD\)/i)).toBeInTheDocument();
    expect(screen.getByText(/ssd-0/i)).toBeInTheDocument();

    // Space stats
    expect(screen.getByText(/Hardware Capacity/i)).toBeInTheDocument();
    expect(screen.getByText(/Free Space:/i)).toBeInTheDocument();
    expect(screen.getByText(/Library Games Allocation/i)).toBeInTheDocument();

    // Back button works
    const backBtn = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });

  it('filters and displays games located on this drive', () => {
    render(
      <DriveDetailView
        library={mockLibrary}
        games={mockGames}
        allLibraries={[mockLibrary]}
        jobs={mockJobs}
        onBack={vi.fn()}
        onUpdatePath={vi.fn().mockResolvedValue(undefined)}
      />
    );

    // Terraria is on ssd-0, Wuthering Waves is on hdd-0
    expect(screen.getByText('Terraria')).toBeInTheDocument();
    expect(screen.queryByText('Wuthering Waves')).not.toBeInTheDocument();

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Filter drive games/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });
    expect(screen.queryByText('Terraria')).not.toBeInTheDocument();
    expect(screen.getByText(/No games match your search query/i)).toBeInTheDocument();
  });

  it('updates path when saved in settings section', async () => {
    const onUpdatePath = vi.fn().mockResolvedValue(undefined);

    render(
      <DriveDetailView
        library={mockLibrary}
        games={mockGames}
        allLibraries={[mockLibrary]}
        jobs={mockJobs}
        onBack={vi.fn()}
        onUpdatePath={onUpdatePath}
      />
    );

    const pathInput = screen.getByDisplayValue('C:\\SteamLibrary');
    fireEvent.change(pathInput, { target: { value: 'D:\\NewSteamLibrary' } });

    const saveBtn = screen.getByRole('button', { name: /Update Path/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onUpdatePath).toHaveBeenCalledWith('ssd-0', 'D:\\NewSteamLibrary');
    });
  });
});
