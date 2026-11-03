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
        await update.downloadAndInstall((event: DownloadEvent) => {
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
