import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameList } from '../components/GameList.tsx';
import { Game, Library } from '../types/api.ts';

const mockLibraries: Library[] = [
  { id: 'ssd1', name: 'Fast SSD', type: 'ssd_cache', total_bytes: 1000000000000, free_bytes: 500000000000 },
  { id: 'hdd1', name: 'Master HDD', type: 'hdd_master', total_bytes: 4000000000000, free_bytes: 2000000000000 },
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

describe('GameList Component', () => {
  it('renders all games and allows filtering', () => {
    render(
      <GameList
        games={mockGames}
        libraries={mockLibraries}
        onPromote={vi.fn()}
        onEvict={vi.fn()}
        onBackup={vi.fn()}
        actionLoading={false}
      />
    );

    expect(screen.getByText('Terraria')).toBeInTheDocument();
    expect(screen.getByText('Age of Empires II HD')).toBeInTheDocument();

    // Filter to On SSD
    fireEvent.click(screen.getByText('On SSD'));
    expect(screen.getByText('Terraria')).toBeInTheDocument();
    expect(screen.queryByText('Age of Empires II HD')).not.toBeInTheDocument();

    // Filter to On HDD
    fireEvent.click(screen.getByText('On HDD'));
    expect(screen.queryByText('Terraria')).not.toBeInTheDocument();
    expect(screen.getByText('Age of Empires II HD')).toBeInTheDocument();
  });

  it('triggers promote callback for HDD game', () => {
    const onPromoteMock = vi.fn();
    render(
      <GameList
        games={mockGames}
        libraries={mockLibraries}
        onPromote={onPromoteMock}
        onEvict={vi.fn()}
        onBackup={vi.fn()}
        actionLoading={false}
      />
    );

    const promoteButton = screen.getByText('Promote');
    fireEvent.click(promoteButton);

    expect(onPromoteMock).toHaveBeenCalledWith('221380', 'ssd1');
  });

  it('triggers evict and backup callbacks for SSD game', () => {
    const onEvictMock = vi.fn();
    const onBackupMock = vi.fn();
    render(
      <GameList
        games={mockGames}
        libraries={mockLibraries}
        onPromote={vi.fn()}
        onEvict={onEvictMock}
        onBackup={onBackupMock}
        actionLoading={false}
      />
    );

    const backupButton = screen.getByText('Backup');
    fireEvent.click(backupButton);
    expect(onBackupMock).toHaveBeenCalledWith('105600', 'hdd1');

    const evictButton = screen.getByText('Evict');
    fireEvent.click(evictButton);
    expect(onEvictMock).toHaveBeenCalledWith('105600', 'hdd1');
  });
});
