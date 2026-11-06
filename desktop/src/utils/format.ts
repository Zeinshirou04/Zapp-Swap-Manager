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
 * Normalizes any Windows file or directory path to start with uppercase drive letter.
 * e.g. "d:\game\steam" -> "D:\game\steam"
 */
export function normalizePath(path: string): string {
  if (!path) return '';
  return path.replace(/^([a-z]):/i, (_, letter) => `${letter.toUpperCase()}:`);
}

/**
 * Standardizes library naming into Camel Case title:
 * e.g. "Steam Library (C: Drive)", "Games Library (D: Drive)"
 */
export function formatLibraryName(lib: Partial<Library> & { path?: string }): string {
  const rawPath = normalizePath(lib.path || '');
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

/**
 * Formats a library with explicit drive and parent folder alias:
 * e.g. "[E:] \Game (Games Fast SSD)" or "[E:] \SteamLibrary (Steam Fast SSD)"
 */
export function formatLibraryOptionLabel(lib: Partial<Library> & { path?: string }): string {
  const rawPath = normalizePath(lib.path || '');
  const rawName = lib.name || '';

  const matchDrive = (rawPath || rawName).match(/\b([A-Za-z]:)/);
  const driveLetter = matchDrive ? matchDrive[1].toUpperCase() : '';

  let folder = '';
  if (rawPath) {
    const afterDrive = rawPath.replace(/^[a-zA-Z]:[/\\]?/, '').trim();
    if (afterDrive) {
      folder = `\\${afterDrive.replace(/^[/\\]+/, '')}`;
    }
  }

  const role = lib.type === 'ssd_cache' ? 'Fast SSD Cache' : 'HDD Master';
  const isSteam = (rawName + rawPath).toLowerCase().includes('steam');
  const cat = isSteam ? 'Steam' : 'Games';

  if (driveLetter && folder) {
    return `[${driveLetter}] ${folder} (${cat} ${role})`;
  }
  if (driveLetter) {
    return `[${driveLetter}] ${formatLibraryName(lib)} (${role})`;
  }
  return `${lib.name || 'Library'} (${role})`;
}

/**
 * Formats a timestamp into friendly relative or absolute date:
 * e.g. "Today", "Yesterday", "3 days ago", "Oct 24, 2024", or "Never played"
 */
export function formatLastPlayed(dateStr?: string | null): string {
  if (!dateStr) return 'Never / Not recorded';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Never / Not recorded';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7 && diffDays > 0) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
