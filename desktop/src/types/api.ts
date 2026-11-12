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
  banner_url?: string | null;
  swap_enabled?: boolean;
  has_hdd_backup?: boolean;
  is_native_hdd?: boolean;
  tags?: string[];
  capture_aliases?: string[];
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
  sharex_enabled?: boolean;
  shadowplay_enabled?: boolean;
  capture_folders?: string[];
}

export interface CreateCustomGameRequest {
  name: string;
  library_id: string;
  install_dir: string;
  cover_url?: string;
  banner_url?: string;
  swap_enabled?: boolean;
  is_native_hdd?: boolean;
  tags?: string[];
}

export interface UpdateCustomGameRequest {
  name?: string;
  cover_url?: string;
  banner_url?: string;
  install_dir?: string;
  library_id?: string;
  swap_enabled?: boolean;
  is_native_hdd?: boolean;
  tags?: string[];
}

export type ArtworkKind = 'grid' | 'banner';

export interface UpdateGameArtworkRequest {
  cover_url?: string | null;
  banner_url?: string | null;
}

export type CaptureSource = 'sharex' | 'shadowplay' | 'custom';
export type CaptureKind = 'image' | 'video';
export type CaptureMatchBy = 'shadowplay_folder' | 'sharex_history' | 'filename' | 'alias';

export interface CaptureItem {
  id: string;
  source: CaptureSource;
  kind: CaptureKind;
  filename: string;
  mime_type: string;
  size_bytes: number;
  captured_at: string;
  window_title?: string | null;
  process_name?: string | null;
  matched_by: CaptureMatchBy;
}

export interface CaptureListResponse {
  items: CaptureItem[];
  aliases: string[];
  sources_checked?: {
    sharex: boolean;
    shadowplay: boolean;
    custom: number;
  };
}

export interface CaptureSources {
  sharex: {
    detected: boolean;
    enabled: boolean;
    root_path?: string;
    history_db_path?: string;
  };
  shadowplay: {
    detected: boolean;
    enabled: boolean;
    root_path?: string;
  };
  custom_folders: string[];
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
