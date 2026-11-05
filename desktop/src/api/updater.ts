import { check } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface UpdateDetails {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  downloadAndInstall: (onProgress: (percent: number) => void) => Promise<void>;
}

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function checkUpdate(): Promise<UpdateDetails | null> {
  if (!isTauriEnvironment()) {
    return null;
  }
  try {
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      date: update.date,
      body: update.body,
      downloadAndInstall: async (onProgress: (percent: number) => void) => {
        // Stream progress updates from the Rust installer handler to UI
        const unlisten = await listen<{ percent: number }>('update-progress', (event) => {
          if (typeof event.payload?.percent === 'number') {
            onProgress(event.payload.percent);
          }
        });
        try {
          // invoke custom Rust command which executes update.download_and_install with
          // a non-blocking on_before_exit hook, avoiding Windows WebView2 deadlock (Tauri #2558)
          await invoke('install_update_now');
        } finally {
          unlisten();
        }
      },
    };
  } catch (err) {
    console.warn('Failed to check for updates:', err);
    return null;
  }
}

export async function relaunchApp(): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  await invoke('relaunch_app');
}
