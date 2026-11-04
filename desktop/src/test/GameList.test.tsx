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
  {
    app_id: 9876543210,
    name: 'Genshin Impact',
    install_dir: 'GenshinImpact',
    size_bytes: 80 * 1024 * 1024 * 1024,
    state: 'storage_hdd',
    current_library_id: 'hdd1',
    build_id: 'custom',
    last_backup_time: null,
    backup_clean: false,
    is_custom: true,
  },
];

describe('GameList Component', () => {
  it('renders all games and allows filtering', () => {
    render(
      <GameList
        games={mockGames}
        libraries={mockLibraries}
        onAction={vi.fn()}
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
    const onActionMock = vi.fn();
    render(
      <GameList
        games={mockGames}
        libraries={mockLibraries}
        onAction={onActionMock}
        actionLoading={false}
      />
    );

    const promoteButton = screen.getAllByText('Move to SSD')[0];
    fireEvent.click(promoteButton);

    expect(onActionMock).toHaveBeenCalledWith(mockGames[1], 'promote');
  });

  it('triggers evict and backup actions for SSD game', () => {
    const onActionMock = vi.fn();
    render(
      <GameList
        games={mockGames}
        libraries={mockLibraries}
        onAction={onActionMock}
        actionLoading={false}
      />
    );

    fireEvent.click(screen.getByText('Backup to HDD'));
    expect(onActionMock).toHaveBeenCalledWith(mockGames[0], 'backup');

    fireEvent.click(screen.getByText('Evict to HDD'));
    expect(onActionMock).toHaveBeenCalledWith(mockGames[0], 'evict');
  });

  it('toggles between grid and table view', () => {
    render(
      <GameList
        games={mockGames}
        libraries={mockLibraries}
        onAction={vi.fn()}
        actionLoading={false}
      />
    );

    expect(screen.getAllByTestId('game-card')).toHaveLength(3);

    // Switch to table view
    fireEvent.click(screen.getByTitle('Table view'));
    expect(screen.queryByTestId('game-card')).not.toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();

    // Switch back to grid view
    fireEvent.click(screen.getByTitle('Grid view'));
    expect(screen.getAllByTestId('game-card')).toHaveLength(3);
  });

  it('renders and filters non-Steam custom games', () => {
    render(
      <GameList
        games={mockGames}
        libraries={mockLibraries}
        onAction={vi.fn()}
        actionLoading={false}
      />
    );

    expect(screen.getByText('Custom / Non-Steam')).toBeInTheDocument();

    // Filter to Non-Steam
    fireEvent.click(screen.getByText('Non-Steam'));
    expect(screen.getByText('Genshin Impact')).toBeInTheDocument();
    expect(screen.queryByText('Terraria')).not.toBeInTheDocument();
    expect(screen.queryByText('Age of Empires II HD')).not.toBeInTheDocument();
  });
});

