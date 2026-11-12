import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../api/client.ts';
import { GameDetailView } from '../components/GameDetailView.tsx';
import { Game, Library } from '../types/api.ts';

describe('GameDetailView Component', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    expect(screen.getByText('Game & Backup Status')).toBeInTheDocument();
    expect(screen.getByText('Fast SSD Cache')).toBeInTheDocument();
    expect(screen.getByText('Backup Verified')).toBeInTheDocument();
    expect(screen.getByText(/Full Directory:/)).toBeInTheDocument();
    expect(screen.getByText(/E:\\Game\\Arknights/)).toBeInTheDocument();
    expect(screen.getByText('Media & Captures (ShareX / NVIDIA ShadowPlay)')).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('shows relative last played in hero and exact timestamp in Activity & Runtime for a Steam game', () => {
    const nowIso = new Date().toISOString();
    const steamTodayGame: Game = {
      ...mockGame,
      app_id: 105600,
      name: 'Terraria',
      is_custom: false,
      last_played: nowIso,
    };

    render(
      <GameDetailView
        game={steamTodayGame}
        libraries={mockLibraries}
        jobs={[]}
        onBack={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={vi.fn()}
      />
    );

    // Relative time in Hero
    expect(screen.getByText('Today')).toBeInTheDocument();

    // Exact timestamp in Activity & Runtime (not literally "Today")
    const latestPlayedLabel = screen.getByText('Latest Played:');
    const exactValueEl = latestPlayedLabel.parentElement?.querySelector('strong');
    expect(exactValueEl).not.toBeNull();
    expect(exactValueEl?.textContent).not.toBe('Today');
    expect(exactValueEl?.textContent).toMatch(/\d{1,2}[:.]\d{2}/); // Contains HH:MM or HH.MM across locales

    // Portrait grid cover image uses SteamGrid library_600x900
    const gridCover = screen.getByAltText('Terraria') as HTMLImageElement;
    expect(gridCover.src).toContain('library_600x900_2x.jpg');
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

  it('locks Game Settings save button and displays warning while a transfer job is active', () => {
    render(
      <GameDetailView
        game={mockGame}
        libraries={mockLibraries}
        jobs={[
          {
            id: 'job-active-1',
            type: 'evict',
            app_id: String(mockGame.app_id),
            target_library_id: 'lib-hdd',
            status: 'running',
            progress_percent: 42,
            bytes_transferred: 1000,
            total_bytes: 2500,
            error: null,
            created_at: '2026-11-12T00:00:00Z',
            started_at: '2026-11-12T00:00:01Z',
            completed_at: null,
          },
        ]}
        onBack={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Game Settings/i }));
    expect(
      screen.getByText(/A transfer job is queued or running for this game\. Settings are locked until it completes\./i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeDisabled();
  });

  it('renders separate Grid Cover and Hero Banner, falling back to Grid when banner is unset', () => {
    const coverOnlyCustomGame: Game = {
      ...mockGame,
      cover_url: 'https://example.com/grid-only.jpg',
      banner_url: undefined,
    };
    const { rerender } = render(
      <GameDetailView
        game={coverOnlyCustomGame}
        libraries={mockLibraries}
        jobs={[]}
        onBack={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={vi.fn()}
      />
    );

    const gridImg = screen.getByAltText('Arknights: Endfield') as HTMLImageElement;
    const heroImgDefault = screen.getByTestId('hero-banner-img') as HTMLImageElement;
    expect(gridImg.src).toContain('https://example.com/grid-only.jpg');
    expect(heroImgDefault.src).toContain('https://example.com/grid-only.jpg');

    rerender(
      <GameDetailView
        game={{ ...coverOnlyCustomGame, banner_url: 'https://example.com/custom-banner.jpg' }}
        libraries={mockLibraries}
        jobs={[]}
        onBack={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={vi.fn()}
      />
    );

    expect((screen.getByAltText('Arknights: Endfield') as HTMLImageElement).src).toContain(
      'https://example.com/grid-only.jpg'
    );
    expect((screen.getByTestId('hero-banner-img') as HTMLImageElement).src).toContain(
      'https://example.com/custom-banner.jpg'
    );
  });

  it('updates Hero Banner URL, uploads Grid Cover file, and resets Banner via Edit Artwork modal', async () => {
    const onGameUpdated = vi.fn();
    const withCover: Game = {
      ...mockGame,
      cover_url: 'https://example.com/grid-initial.jpg',
      banner_url: 'https://example.com/banner-initial.jpg',
    };

    const updateSpy = vi
      .spyOn(api, 'updateGameArtwork')
      .mockResolvedValueOnce({ ...withCover, banner_url: 'https://example.com/new-banner.png' })
      .mockResolvedValueOnce({ ...withCover, banner_url: '' });
    const uploadSpy = vi
      .spyOn(api, 'uploadGameArtwork')
      .mockResolvedValueOnce({ ...withCover, cover_url: 'cached:grid:123' });

    render(
      <GameDetailView
        game={withCover}
        libraries={mockLibraries}
        jobs={[]}
        onBack={vi.fn()}
        onAction={vi.fn()}
        actionLoading={false}
        onGameUpdated={onGameUpdated}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit Artwork/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const bannerInput = screen.getByLabelText(/Hero Banner URL/i);
    fireEvent.change(bannerInput, { target: { value: 'https://example.com/new-banner.png' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Banner/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(489201, { banner_url: 'https://example.com/new-banner.png' });
    });

    const uploadGridInput = screen.getByLabelText(/Upload Grid Cover Image/i) as HTMLInputElement;
    const pngFile = new File(['pngbytes'], 'cover.png', { type: 'image/png' });
    fireEvent.change(uploadGridInput, { target: { files: [pngFile] } });

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(489201, 'grid', pngFile);
    });

    fireEvent.click(screen.getByRole('button', { name: /Use Default/i }));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(489201, { banner_url: '' });
    });
    expect(onGameUpdated).toHaveBeenCalledTimes(3);
  });
});
