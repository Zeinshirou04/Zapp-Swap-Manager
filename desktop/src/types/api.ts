// Strict TypeScript types matching api/openapi.yaml schemas

export type LibraryType = 'ssd_cache' | 'hdd_master';

export interface Library {
  id: string;
  name: string;
  type: LibraryType;
  total_bytes: number;
  free_bytes: number;
}

export type GameState = 'active_ssd' | 'storage_hdd';

export interface Game {
  app_id: number;
  name: string;
  install_dir: string;
  size_bytes: number;
  state: GameState;
  current_library_id: string;
  build_id: string;
  last_backup_time: string | null;
  backup_clean: boolean;
}

export type JobType = 'promote' | 'evict' | 'backup';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface CreateJobRequest {
  type: JobType;
  app_id: string;
  target_library_id: string;
}

export interface Job {
  id: string;
  type: JobType;
  app_id: string;
  target_library_id: string;
  status: JobStatus;
  progress_percent: number;
  bytes_transferred: number;
  total_bytes: number;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface HealthResponse {
  uptime_seconds: number;
  version: string;
  steam_running: boolean;
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
