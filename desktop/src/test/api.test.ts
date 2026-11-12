import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  api,
  getApiConfig,
  setApiConfig,
  getCaptureFileUrl,
  getGameCoverUrl,
  getGameBannerUrl,
  resolveCoverUrl,
  resolveBannerUrl,
} from '../api/client.ts';
import { Game } from '../types/api.ts';

describe('ApiClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads default configuration', () => {
    const cfg = getApiConfig();
    expect(cfg.baseUrl).toBe('http://127.0.0.1:8765');
    expect(cfg.bearerToken).toBe('');
  });

  it('updates configuration in localStorage', () => {
    setApiConfig({ baseUrl: 'http://127.0.0.1:9000', bearerToken: 'my-token' });
    const cfg = getApiConfig();
    expect(cfg.baseUrl).toBe('http://127.0.0.1:9000');
    expect(cfg.bearerToken).toBe('my-token');
  });

  it('calls getHealth with proper headers', async () => {
    setApiConfig({ baseUrl: 'http://127.0.0.1:8765', bearerToken: 'test-secret' });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ uptime_seconds: 120, version: '0.1.0', steam_running: true }),
    });
    globalThis.fetch = fetchMock;

    const res = await api.getHealth();
    expect(res.version).toBe('0.1.0');
    expect(res.steam_running).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/health', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-secret',
      },
    });
  });

  it('enforces input safety: createJob only passes type, app_id, target_library_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'job-1', type: 'promote', status: 'queued' }),
    });
    globalThis.fetch = fetchMock;

    await api.createJob({
      type: 'promote',
      app_id: '105600',
      target_library_id: 'ssd1',
    });

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'promote',
        app_id: '105600',
        target_library_id: 'ssd1',
      }),
    });
  });

  it('handles error response payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'raw_path_rejected', message: 'Raw filesystem paths are rejected' }),
    });
    globalThis.fetch = fetchMock;

    await expect(
      api.createJob({
        type: 'evict',
        app_id: '105600',
        target_library_id: 'hdd1',
      })
    ).rejects.toThrow('Raw filesystem paths are rejected');
  });

  it('includes bearer token in getGameCoverUrl when token is set', () => {
    setApiConfig({ baseUrl: 'http://127.0.0.1:8765', bearerToken: 'my-token' });
    expect(getGameCoverUrl(3513350)).toBe('http://127.0.0.1:8765/games/3513350/cover?token=my-token');

    setApiConfig({ baseUrl: 'http://127.0.0.1:8765', bearerToken: '' });
    expect(getGameCoverUrl(3513350)).toBe('http://127.0.0.1:8765/games/3513350/cover');
  });

  it('resolves remote and local cover urls properly', () => {
    setApiConfig({ baseUrl: 'http://127.0.0.1:8765', bearerToken: 'auth-tok' });

    const localCoverGame: Game = {
      app_id: 3513350,
      name: 'Wuthering Waves',
      install_dir: 'Wuthering Waves',
      size_bytes: 1000,
      state: 'storage_hdd',
      current_library_id: 'hdd1',
      build_id: '',
      last_backup_time: null,
      backup_clean: false,
      cover_url: 'C:\\Users\\user\\Downloads\\cover.jpg',
    };
    expect(resolveCoverUrl(localCoverGame)).toBe('http://127.0.0.1:8765/games/3513350/cover?token=auth-tok');

    const remoteCoverGame: Game = {
      ...localCoverGame,
      cover_url: 'https://example.com/cover.jpg',
    };
    expect(resolveCoverUrl(remoteCoverGame)).toBe('https://example.com/cover.jpg');

    const steamGameWithoutCover: Game = {
      ...localCoverGame,
      cover_url: undefined,
      is_custom: false,
    };
    expect(resolveCoverUrl(steamGameWithoutCover)).toBe('https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/3513350/header.jpg');

    // Cache-busting support
    expect(getGameCoverUrl(3513350, 'rev1')).toBe('http://127.0.0.1:8765/games/3513350/cover?token=auth-tok&v=rev1');
    expect(resolveCoverUrl(localCoverGame, 'v2')).toBe('http://127.0.0.1:8765/games/3513350/cover?token=auth-tok&v=v2');
    expect(resolveCoverUrl(remoteCoverGame, 'v2')).toBe('https://example.com/cover.jpg?v=v2');
  });

  it('resolves banner urls independently and calls artwork endpoints', async () => {
    setApiConfig({ baseUrl: 'http://127.0.0.1:8765', bearerToken: 'auth-tok' });

    const baseGame: Game = {
      app_id: 105600,
      name: 'Terraria',
      install_dir: 'Terraria',
      size_bytes: 500,
      state: 'active_ssd',
      current_library_id: 'ssd1',
      build_id: '123',
      last_backup_time: null,
      backup_clean: true,
    };
    expect(resolveBannerUrl(baseGame)).toBeNull();
    expect(getGameBannerUrl(105600, 'b1')).toBe('http://127.0.0.1:8765/games/105600/banner?token=auth-tok&v=b1');
    expect(resolveBannerUrl({ ...baseGame, banner_url: 'cached:banner:99' }, '99')).toBe(
      'http://127.0.0.1:8765/games/105600/banner?token=auth-tok&v=99',
    );
    expect(resolveBannerUrl({ ...baseGame, banner_url: 'https://cdn.example.com/hero.webp' }, '99')).toBe(
      'https://cdn.example.com/hero.webp?v=99',
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...baseGame, banner_url: 'https://cdn.example.com/hero.webp' }),
    });
    globalThis.fetch = fetchMock;

    await api.updateGameArtwork(105600, { banner_url: 'https://cdn.example.com/hero.webp' });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8765/games/105600/artwork', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer auth-tok',
      },
      body: JSON.stringify({ banner_url: 'https://cdn.example.com/hero.webp' }),
    });

    const imgFile = new File(['pngbytes'], 'hero.png', { type: 'image/png' });
    await api.uploadGameArtwork(105600, 'banner', imgFile);
    const uploadCall = fetchMock.mock.calls[1];
    expect(uploadCall[0]).toBe('http://127.0.0.1:8765/games/105600/artwork');
    expect(uploadCall[1].method).toBe('POST');
    expect(uploadCall[1].headers).toEqual({ Authorization: 'Bearer auth-tok' });
    expect(uploadCall[1].body).toBeInstanceOf(FormData);
    expect((uploadCall[1].body as FormData).get('kind')).toBe('banner');
    expect((uploadCall[1].body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('builds capture file URLs and calls captures API endpoints', async () => {
    setApiConfig({ baseUrl: 'http://127.0.0.1:8765', bearerToken: 'cap-tok' });
    expect(getCaptureFileUrl('0123456789abcdef0123456789abcdef')).toBe(
      'http://127.0.0.1:8765/captures/0123456789abcdef0123456789abcdef/file?token=cap-tok',
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sharex: { detected: true, enabled: true, root_path: 'C:\\ShareX' },
          shadowplay: { detected: false, enabled: true },
          custom_folders: ['D:\\Captures'],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], aliases: ['Endfield'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ app_id: 105600, name: 'Terraria', capture_aliases: ['TerrariaHD'] }),
      });
    globalThis.fetch = fetchMock;

    const sources = await api.getCaptureSources();
    expect(sources.sharex.detected).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:8765/captures/sources', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer cap-tok',
      },
    });

    const list = await api.getGameCaptures(105600, { kind: 'image', source: 'sharex', limit: 25 });
    expect(list.aliases).toEqual(['Endfield']);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8765/games/105600/captures?kind=image&source=sharex&limit=25',
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer cap-tok',
        },
      },
    );

    await api.updateGameCaptureAliases(105600, ['TerrariaHD']);
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:8765/games/105600/captures/aliases', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer cap-tok',
      },
      body: JSON.stringify({ aliases: ['TerrariaHD'] }),
    });
  });
});
