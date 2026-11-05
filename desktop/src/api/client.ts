import {
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
}

export const api = new ApiClient();
