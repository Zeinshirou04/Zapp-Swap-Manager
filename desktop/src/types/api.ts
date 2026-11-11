// Strict TypeScript types matching api/openapi.yaml schemas

export type LibraryType = 'ssd_cache' | 'hdd_master';

export type DriveType = 'fixed' | 'removable' | 'network' | 'unknown';

export interface DetectedLibrary {
  id: string;
  path: string;
  drive_type: DriveType;
  total_bytes: number;
  free_bytes: number;
}

export interface LibraryInput {
  type: LibraryType;
  path: string;
  id?: string;
}

export interface Library {
  id: string;
  name: string;
  type: LibraryType;
  path?: string;
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
  last_played?: string | null;
  backup_clean: boolean;
  is_custom?: boolean;
  cover_url?: string | null;
  swap_enabled?: boolean;
  has_hdd_backup?: boolean;
  is_native_hdd?: boolean;
  tags?: string[];
}

export interface Preferences {
  close_steam_on_transfer: boolean;
  relaunch_steam_after_transfer: boolean;
  run_on_startup: boolean;
  theme: 'system' | 'light' | 'dark';
  relay_enabled?: boolean;
  relay_server_url?: string;
  relay_device_id?: string;
  relay_device_secret?: string;
  robocopy_threads?: number;
  robocopy_retries?: number;
  robocopy_wait_seconds?: number;
  robocopy_unbuffered?: boolean;
}

export interface CreateCustomGameRequest {
  name: string;
  library_id: string;
  install_dir: string;
  cover_url?: string;
  swap_enabled?: boolean;
  is_native_hdd?: boolean;
  tags?: string[];
}

export interface UpdateCustomGameRequest {
  name?: string;
  cover_url?: string;
  install_dir?: string;
  library_id?: string;
  swap_enabled?: boolean;
  is_native_hdd?: boolean;
  tags?: string[];
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
