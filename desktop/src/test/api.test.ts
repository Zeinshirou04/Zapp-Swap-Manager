import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, getApiConfig, setApiConfig } from '../api/client.ts';

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
});
