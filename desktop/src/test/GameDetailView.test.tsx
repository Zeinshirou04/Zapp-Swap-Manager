import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameDetailView } from '../components/GameDetailView.tsx';
import { Game, Library } from '../types/api.ts';

describe('GameDetailView Component', () => {
  const mockLibraries: (Library & { path?: string })[] = [
    {
      id: 'lib-ssd',
      name: 'Games Library (E: Drive)',
      type: 'ssd_cache',
      total_bytes: 1000000000000,
      free_bytes: 400000000000,
      path: 'E:\\Game',
    },
    {
      id: 'lib-hdd',
      name: 'Games Library (O: Drive)',
      type: 'hdd_master',
      total_bytes: 2000000000000,
      free_bytes: 1200000000000,
      path: 'O:\\Game',
    },
  ];

  const mockGame: Game = {
    app_id: 489201,
    name: 'Arknights: Endfield',
    install_dir: 'Arknights',
    size_bytes: 72518392618,
    state: 'active_ssd',
    current_library_id: 'lib-ssd',
    build_id: 'custom',
    last_backup_time: '2026-11-06T03:00:00Z',
    last_played: '2026-11-06T04:00:00Z',
    backup_clean: true,
    is_custom: true,
    has_hdd_backup: true,
    swap_enabled: true,
    is_native_hdd: false,
    tags: ['Gacha', 'RPG'],
  };

  it('renders hero title, uppercase path, last played date, and action buttons for active swappable game', () => {
    const onBack = vi.fn();
    const onAction = vi.fn();
    const onGameUpdated = vi.fn();

    render(
      <GameDetailView
        game={mockGame}
        libraries={mockLibraries}
        jobs={[]}
        onBack={onBack}
        onAction={onAction}
        actionLoading={false}
        onGameUpdated={onGameUpdated}
      />
    );

    expect(screen.getByRole('heading', { name: 'Arknights: Endfield', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Back to Games')).toBeInTheDocument();
    expect(screen.getByText('Backup to HDD')).toBeInTheDocument();
    expect(screen.getByText('Evict to HDD')).toBeInTheDocument();
    expect(screen.getByText(/Full Directory:/)).toBeInTheDocument();
    expect(screen.getByText(/E:\\Game\\Arknights/)).toBeInTheDocument();
    expect(screen.getByText('Media & Captures (ShareX / NVIDIA ShadowPlay)')).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('hides Backup to HDD and Evict to HDD buttons when game is native HDD', () => {
    const nativeHddGame: Game = {
      ...mockGame,
      is_native_hdd: true,
    };

    render(
      <GameDetailView
        game={nativeHddGame}
        libraries={mockLibraries}
        jobs={[]}
        onBack={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={vi.fn()}
      />
    );

    expect(screen.queryByText('Backup to HDD')).not.toBeInTheDocument();
    expect(screen.queryByText('Evict to HDD')).not.toBeInTheDocument();
    expect(screen.getByText('Pinned to HDD (Native)')).toBeInTheDocument();
  });

  it('hot-refreshes display when game prop updates', () => {
    const { rerender } = render(
      <GameDetailView
        game={mockGame}
        libraries={mockLibraries}
        jobs={[]}
        onBack={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Arknights: Endfield', level: 1 })).toBeInTheDocument();

    const updatedGame: Game = {
      ...mockGame,
      name: 'Wuthering Waves',
      cover_url: 'https://example.com/wuwa-new.jpg',
      state: 'storage_hdd',
      current_library_id: 'lib-hdd',
    };

    rerender(
      <GameDetailView
        game={updatedGame}
        libraries={mockLibraries}
        jobs={[]}
        onBack={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Wuthering Waves', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Promote to SSD')).toBeInTheDocument();
    expect(screen.getByText('Storage HDD Master')).toBeInTheDocument();
  });
});
