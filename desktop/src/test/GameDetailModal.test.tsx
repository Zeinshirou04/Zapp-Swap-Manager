import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GameDetailModal } from '../components/GameDetailModal.tsx';
import { Game, Library } from '../types/api.ts';
import { api } from '../api/client.ts';

vi.mock('../api/client.ts', () => ({
  api: {
    updateCustomGame: vi.fn(),
  },
  resolveCoverUrl: (game: { cover_url?: string | null }) => game.cover_url || null,
  getGameCoverUrl: (appId: string | number) => `http://127.0.0.1:8765/games/${appId}/cover`,
}));

describe('GameDetailModal Component', () => {
  const mockLibraries: Library[] = [
    {
      id: 'ssd0',
      name: 'Steam Library (C:)',
      type: 'ssd_cache',
      total_bytes: 1000000000,
      free_bytes: 500000000,
    },
    {
      id: 'hdd0',
      name: 'Steam Library (D:)',
      type: 'hdd_master',
      total_bytes: 4000000000,
      free_bytes: 2000000000,
    },
  ];

  const mockGame: Game = {
    app_id: 105600,
    name: 'Terraria',
    install_dir: 'Terraria',
    size_bytes: 524288000,
    state: 'active_ssd',
    current_library_id: 'ssd0',
    build_id: '1234',
    last_backup_time: null,
    backup_clean: false,
    has_hdd_backup: true,
  };

  const mockCustomGame: Game = {
    app_id: 3259455964573600,
    name: 'Wuthering Waves',
    install_dir: 'WutheringWaves',
    size_bytes: 107374182400,
    state: 'storage_hdd',
    current_library_id: 'hdd0',
    build_id: '',
    last_backup_time: null,
    backup_clean: true,
    is_custom: true,
    cover_url: 'https://example.com/wuwa.jpg',
    swap_enabled: true,
    is_native_hdd: false,
    tags: ['Gacha', 'Action'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.updateCustomGame as any).mockResolvedValue({
      ...mockCustomGame,
      name: 'Wuthering Waves Updated',
    });
  });

  it('renders game details and backup status', () => {
    render(
      <GameDetailModal
        game={mockGame}
        libraries={mockLibraries}
        onClose={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Terraria' })).toBeInTheDocument();
    expect(screen.getByText('Backed Up on HDD')).toBeInTheDocument();
    expect(screen.getByText('0.5 GB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /backup to hdd/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /evict to hdd/i })).toBeInTheDocument();
  });

  it('allows editing metadata for custom games', async () => {
    const onGameUpdatedMock = vi.fn();
    render(
      <GameDetailModal
        game={mockCustomGame}
        libraries={mockLibraries}
        onClose={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={onGameUpdatedMock}
      />
    );

    expect(screen.getByRole('heading', { name: 'Wuthering Waves' })).toBeInTheDocument();
    expect(screen.getByText('100.0 GB')).toBeInTheDocument();
    expect(screen.getByText('Swappable to SSD')).toBeInTheDocument();

    // Click Edit Config
    fireEvent.click(screen.getByRole('button', { name: /edit config/i }));

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateCustomGame).toHaveBeenCalled();
      expect(onGameUpdatedMock).toHaveBeenCalled();
    });
  });
});
