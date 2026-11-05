import { check, DownloadEvent } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';

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
        let total = 0;
        let downloaded = 0;
        // 1. Download installer package with live progress reporting
        await update.download((event: DownloadEvent) => {
          if (event.event === 'Started') {
            total = event.data.contentLength ?? 0;
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            if (total > 0) {
              const pct = Math.min(100, Math.round((downloaded / total) * 100));
              onProgress(pct);
            }
          } else if (event.event === 'Finished') {
            onProgress(100);
          }
        });
        // 2. Cleanly stop core daemon so resources/zapp-core.exe is not locked when installer runs
        await invoke('stop_core_daemon').catch((err) => {
          console.warn('Failed to stop core daemon prior to installer execution:', err);
        });
        // 3. Launch the installer (on Windows NSIS, this spawns the installer and cleanly terminates the app)
        await update.install();
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
