import {
  ArtworkKind,
  CaptureKind,
  CaptureListResponse,
  CaptureSource,
  CaptureSources,
  CreateCustomGameRequest,
  CreateJobRequest,
  DetectedLibrary,
  ErrorResponse,
  Game,
  GameState,
  HealthResponse,
  Job,
  JobStatus,
  Library,
  LibraryInput,
  Preferences,
  UpdateCustomGameRequest,
  UpdateGameArtworkRequest,
} from '../types/api.ts';

const CONFIG_KEY = 'zapp_api_config';

export interface ApiConfig {
  baseUrl: string;
  bearerToken: string;
}

export function getApiConfig(): ApiConfig {
  const saved = localStorage.getItem(CONFIG_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fallback
    }
  }
  return {
    baseUrl: 'http://127.0.0.1:8765',
    bearerToken: '',
  };
}

export function setApiConfig(config: ApiConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function buildGameAssetUrl(appId: number | string, endpoint: 'cover' | 'banner', cacheBust?: string | number): string {
  const config = getApiConfig();
  const sep = config.bearerToken ? '&' : '?';
  const bustParam = cacheBust !== undefined && cacheBust !== '' ? `${sep}v=${encodeURIComponent(cacheBust)}` : '';
  if (config.bearerToken) {
    return `${config.baseUrl}/games/${appId}/${endpoint}?token=${encodeURIComponent(config.bearerToken)}${bustParam}`;
  }
  return `${config.baseUrl}/games/${appId}/${endpoint}${bustParam}`;
}

function resolveExplicitArtworkUrl(
  rawUrl: string | null | undefined,
  appId: number | string,
  endpoint: 'cover' | 'banner',
  cacheBust?: string | number,
): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (cacheBust !== undefined && cacheBust !== '' && cacheBust !== trimmed) {
      const sep = trimmed.includes('?') ? '&' : '?';
      return `${trimmed}${sep}v=${encodeURIComponent(cacheBust)}`;
    }
    return trimmed;
  }
  return buildGameAssetUrl(appId, endpoint, cacheBust);
}

export function getGameCoverUrl(appId: number | string, cacheBust?: string | number): string {
  return buildGameAssetUrl(appId, 'cover', cacheBust);
}

export function getGameBannerUrl(appId: number | string, cacheBust?: string | number): string {
  return buildGameAssetUrl(appId, 'banner', cacheBust);
}

export function resolveCoverUrl(game: Game, cacheBust?: string | number): string | null {
  const explicit = resolveExplicitArtworkUrl(game.cover_url, game.app_id, 'cover', cacheBust);
  if (explicit) {
    return explicit;
  }
  if (!game.is_custom) {
    return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${game.app_id}/header.jpg`;
  }
  return null;
}

export function resolveBannerUrl(game: Game, cacheBust?: string | number): string | null {
  return resolveExplicitArtworkUrl(game.banner_url, game.app_id, 'banner', cacheBust);
}

export function getCaptureFileUrl(captureId: string): string {
  const config = getApiConfig();
  if (config.bearerToken) {
    return `${config.baseUrl}/captures/${encodeURIComponent(captureId)}/file?token=${encodeURIComponent(config.bearerToken)}`;
  }
  return `${config.baseUrl}/captures/${encodeURIComponent(captureId)}/file`;
}

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const config = getApiConfig();
    const url = `${config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (config.bearerToken) {
      headers['Authorization'] = `Bearer ${config.bearerToken}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errPayload: ErrorResponse;
      try {
        errPayload = await res.json();
      } catch {
        errPayload = {
          error: 'http_error',
          message: `HTTP ${res.status}: ${res.statusText}`,
        };
      }
      throw new Error(errPayload.message || errPayload.error);
    }

    return res.json() as Promise<T>;
  }

  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  async listLibraries(): Promise<Library[]> {
    return this.request<Library[]>('/libraries');
  }

  async detectLibraries(): Promise<DetectedLibrary[]> {
    return this.request<DetectedLibrary[]>('/libraries/detected');
  }

  async registerLibraries(libraries: LibraryInput[]): Promise<Library[]> {
    return this.request<Library[]>('/libraries', {
      method: 'POST',
      body: JSON.stringify(libraries),
    });
  }

  async listGames(params?: { state?: GameState; library_id?: string }): Promise<Game[]> {
    const query = new URLSearchParams();
    if (params?.state) query.set('state', params.state);
    if (params?.library_id) query.set('library_id', params.library_id);
    const qs = query.toString();
    return this.request<Game[]>(`/games${qs ? `?${qs}` : ''}`);
  }

  async getGame(appId: string | number): Promise<Game> {
    return this.request<Game>(`/games/${appId}`);
  }

  async listJobs(status?: JobStatus): Promise<Job[]> {
    const qs = status ? `?status=${status}` : '';
    return this.request<Job[]>(`/jobs${qs}`);
  }

  async createJob(req: CreateJobRequest): Promise<Job> {
    return this.request<Job>('/jobs', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async getJob(jobId: string): Promise<Job> {
    return this.request<Job>(`/jobs/${jobId}`);
  }

  async cancelJob(jobId: string): Promise<Job> {
    return this.request<Job>(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  }

  async getLogs(limit: number = 200): Promise<{ lines: string[] }> {
    return this.request<{ lines: string[] }>(`/logs?limit=${limit}`);
  }

  async getPreferences(): Promise<Preferences> {
    return this.request<Preferences>('/preferences');
  }

  async updatePreferences(prefs: Preferences): Promise<Preferences> {
    return this.request<Preferences>('/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  }

  async createCustomGame(req: CreateCustomGameRequest): Promise<Game> {
    return this.request<Game>('/custom-games', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async updateCustomGame(appId: string | number, req: UpdateCustomGameRequest): Promise<Game> {
    return this.request<Game>(`/custom-games/${appId}`, {
      method: 'PUT',
      body: JSON.stringify(req),
    });
  }

  async updateGameArtwork(appId: string | number, req: UpdateGameArtworkRequest): Promise<Game> {
    return this.request<Game>(`/games/${appId}/artwork`, {
      method: 'PUT',
      body: JSON.stringify(req),
    });
  }

  async uploadGameArtwork(appId: string | number, kind: ArtworkKind, file: File): Promise<Game> {
    const config = getApiConfig();
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);

    const headers: Record<string, string> = {};
    if (config.bearerToken) {
      headers.Authorization = `Bearer ${config.bearerToken}`;
    }

    const res = await fetch(`${config.baseUrl}/games/${appId}/artwork`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      let errMsg = `Artwork upload failed (${res.status})`;
      try {
        const errData = (await res.json()) as Partial<ErrorResponse> & { error?: string; code?: string };
        errMsg = errData.message || errData.error || errData.code || errMsg;
      } catch {
        // fallback
      }
      throw new Error(errMsg);
    }
    return (await res.json()) as Game;
  }

  async getCaptureSources(): Promise<CaptureSources> {
    return this.request<CaptureSources>('/captures/sources');
  }

  async getGameCaptures(
    appId: string | number,
    options?: { kind?: CaptureKind | 'all'; source?: CaptureSource | 'all'; limit?: number },
  ): Promise<CaptureListResponse> {
    const params = new URLSearchParams();
    if (options?.kind && options.kind !== 'all') params.set('kind', options.kind);
    if (options?.source && options.source !== 'all') params.set('source', options.source);
    if (options?.limit) params.set('limit', String(options.limit));
    const q = params.toString();
    return this.request<CaptureListResponse>(`/games/${appId}/captures${q ? `?${q}` : ''}`);
  }

  async updateGameCaptureAliases(appId: string | number, aliases: string[]): Promise<Game> {
    return this.request<Game>(`/games/${appId}/captures/aliases`, {
      method: 'PUT',
      body: JSON.stringify({ aliases }),
    });
  }
}

export const api = new ApiClient();
