import { getApiConfig, getCaptureFileUrl } from '../api/client.ts';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function loadBitmapFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('Failed to decode capture image'));
    };
    img.src = objUrl;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode PNG clipboard image'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

/**
 * Downloads an authenticated capture image as a local Blob (avoiding tainted canvas CORS),
 * decodes pixels on an offscreen canvas, and writes an RGBA bitmap via Tauri's native clipboard
 * plugin when inside the desktop app (falling back to navigator.clipboard.write in browser dev mode).
 */
export async function copyCaptureImageToClipboard(captureId: string): Promise<void> {
  const cfg = getApiConfig();
  const url = `${cfg.baseUrl}/captures/${encodeURIComponent(captureId)}/file`;
  const headers: Record<string, string> = {};
  if (cfg.bearerToken) {
    headers.Authorization = `Bearer ${cfg.bearerToken}`;
  }

  const res = await fetch(headers.Authorization ? url : getCaptureFileUrl(captureId), { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch screenshot (${res.status})`);
  }

  const rawBlob = await res.blob();
  const img = await loadBitmapFromBlob(rawBlob);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error('Image has empty dimensions');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize canvas graphics context');
  }
  ctx.drawImage(img, 0, 0);

  if (isTauriRuntime()) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const { Image } = await import('@tauri-apps/api/image');
    const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager');
    const tauriImg = await Image.new(new Uint8Array(imageData.data.buffer), width, height);
    await writeImage(tauriImg);
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    const pngBlob = await canvasToPngBlob(canvas);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    return;
  }

  throw new Error('Clipboard image writing is unavailable in this environment');
}
