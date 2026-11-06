import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddGameModal } from '../components/AddGameModal.tsx';
import { Library, Game } from '../types/api.ts';

const mockLibraries: Library[] = [
  {
    id: 'lib-steam-e',
    name: 'Steam Library (E: Drive)',
    type: 'ssd_cache',
    total_bytes: 250000000000,
    free_bytes: 50000000000,
  },
  {
    id: 'lib-games-e',
    name: 'Games Library (E: Drive)',
    type: 'ssd_cache',
    total_bytes: 250000000000,
    free_bytes: 50000000000,
  },
  {
    id: 'lib-games-o',
    name: 'Games Library (O: Drive)',
    type: 'hdd_master',
    total_bytes: 1000000000000,
    free_bytes: 800000000000,
  },
];

const createCustomGameMock = vi.hoisted(() => vi.fn());
const detectLibrariesMock = vi.hoisted(() => vi.fn());

vi.mock('../api/client.ts', () => ({
  api: {
    createCustomGame: createCustomGameMock,
    detectLibraries: detectLibrariesMock,
  },
}));

describe('AddGameModal Component', () => {
  beforeEach(() => {
    createCustomGameMock.mockReset();
    detectLibrariesMock.mockReset().mockResolvedValue([
      { id: 'lib-steam-e', path: 'E:\\SteamLibrary', drive_type: 'fixed', total_bytes: 250000000000, free_bytes: 50000000000 },
    ]);
    localStorage.clear();
    localStorage.setItem('zapp_custom_library_paths', JSON.stringify(['E:\\Game', 'O:\\Game']));
  });

  it('renders correctly when open', async () => {
    render(
      <AddGameModal
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        libraries={mockLibraries}
      />
    );

    expect(screen.getByText('Add Non-Steam Game')).toBeInTheDocument();
    expect(screen.getByLabelText(/Game Folder or Path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Game Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target Drive \/ Library/i)).toBeInTheDocument();
    await waitFor(() => expect(detectLibrariesMock).toHaveBeenCalled());
  });

  it('parses Windows Copy as Path with quotes, auto-selects library and auto-populates title', async () => {
    render(
      <AddGameModal
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        libraries={mockLibraries}
      />
    );

    const folderInput = screen.getByLabelText(/Game Folder or Path/i);
    fireEvent.change(folderInput, { target: { value: '"E:\\Game\\GRYPHLINK\\games\\EndField Game"' } });

    // Should detect subfolder
    expect(await screen.findByText(/Detected subfolder:/i)).toBeInTheDocument();
    expect(screen.getByText(/GRYPHLINK\/games\/EndField Game/)).toBeInTheDocument();

    // Auto-populates Game Title
    const titleInput = screen.getByLabelText(/Game Title/i) as HTMLInputElement;
    expect(titleInput.value).toBe('EndField Game');

    // Auto-selects Games Library (E: Drive)
    const select = screen.getByLabelText(/Target Drive \/ Library/i) as HTMLSelectElement;
    expect(select.value).toBe('lib-games-e');

    // Live preview shows resolved paths
    expect(screen.getByText(/RESOLVED GAME LOCATIONS/i)).toBeInTheDocument();
    expect(screen.getByText('E:\\Game\\GRYPHLINK\\games\\EndField Game')).toBeInTheDocument();
    expect(screen.getByText('O:\\Game\\GRYPHLINK\\games\\EndField Game')).toBeInTheDocument();
  });

  it('submits form with correct payload', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    const createdGame: Game = {
      app_id: 12345678,
      name: 'Arknights: Endfield',
      install_dir: 'GRYPHLINK/games/EndField Game',
      size_bytes: 72000000000,
      state: 'active_ssd',
      current_library_id: 'lib-games-e',
      build_id: '',
      last_backup_time: null,
      backup_clean: false,
      is_custom: true,
    };
    createCustomGameMock.mockResolvedValue(createdGame);

    render(
      <AddGameModal
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
        libraries={mockLibraries}
      />
    );

    const folderInput = screen.getByLabelText(/Game Folder or Path/i);
    fireEvent.change(folderInput, { target: { value: '"E:\\Game\\GRYPHLINK\\games\\EndField Game"' } });

    const titleInput = screen.getByLabelText(/Game Title/i);
    fireEvent.change(titleInput, { target: { value: 'Arknights: Endfield' } });

    const submitBtn = screen.getByRole('button', { name: /Register Game/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createCustomGameMock).toHaveBeenCalledWith({
        name: 'Arknights: Endfield',
        library_id: 'lib-games-e',
        install_dir: 'GRYPHLINK/games/EndField Game',
        cover_url: undefined,
        swap_enabled: true,
        is_native_hdd: false,
        tags: undefined,
      });
      expect(onSuccess).toHaveBeenCalledWith(createdGame);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('displays warning when an unregistered drive is entered', async () => {
    render(
      <AddGameModal
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        libraries={mockLibraries}
      />
    );
    await waitFor(() => expect(detectLibrariesMock).toHaveBeenCalled());

    const folderInput = screen.getByLabelText(/Game Folder or Path/i);
    fireEvent.change(folderInput, { target: { value: 'Z:\\MyGames\\SomeGame' } });

    expect(screen.getByText(/Drive Z: is not registered in Zapp/i)).toBeInTheDocument();
  });
});
