// Tauri-only native command wrappers (desktop process orchestration).
import { invoke } from '@tauri-apps/api/core';

export interface CoreStatus {
  running: boolean;
  pid: number | null;
  port: number;
}

export interface WindowDiagnostics {
  elevated: boolean;
  decorated_frame: boolean;
}

export interface StartResult {
  started: boolean;
  pid: number | null;
}

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const startCoreDaemon = (): Promise<StartResult> => invoke('start_core_daemon');
export const restartCoreDaemon = (): Promise<StartResult> => invoke('restart_core_daemon');
export const stopCoreDaemon = (): Promise<boolean> => invoke('stop_core_daemon');
export const getCoreStatus = (): Promise<CoreStatus> => invoke('get_core_status');
export const readLocalAuthToken = (): Promise<string | null> => invoke('read_local_auth_token');
export const openLogsFolder = (): Promise<void> => invoke('open_logs_folder');
export const getWindowDiagnostics = (): Promise<WindowDiagnostics> => invoke('get_window_diagnostics');

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
