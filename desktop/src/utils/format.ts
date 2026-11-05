import { Library } from '../types/api.ts';

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) {
    return `${(gb / 1024).toFixed(2)} TB`;
  }
  return `${gb.toFixed(1)} GB`;
}

/**
 * Standardizes library naming into Camel Case title:
 * e.g. "Steam Library (C: Drive)", "Games Library (D: Drive)"
 */
export function formatLibraryName(lib: Partial<Library> & { path?: string }): string {
  const rawPath = lib.path || '';
  const rawName = lib.name || '';

  // Extract drive letter like "C:" from path or existing name
  const matchDrive = (rawPath || rawName).match(/\b([A-Za-z]:)/);
  const driveLetter = matchDrive ? matchDrive[1].toUpperCase() : '';

  // Determine prefix: "Steam Library" or "Games Library"
  const isSteam =
    rawName.toLowerCase().includes('steam') ||
    rawPath.toLowerCase().includes('steam');
  const baseName = isSteam ? 'Steam Library' : 'Games Library';

  if (driveLetter) {
    return `${baseName} (${driveLetter} Drive)`;
  }

  // Fallback to role-based label if drive letter cannot be found
  if (rawName && !rawName.includes('Cache') && !rawName.includes('Master')) {
    return rawName;
  }
  return lib.type === 'ssd_cache' ? `${baseName} (Fast SSD)` : `${baseName} (Storage HDD)`;
}
