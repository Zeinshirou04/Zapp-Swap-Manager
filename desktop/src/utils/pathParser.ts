import { Library } from '../types/api.ts';
import { formatLibraryName } from './format.ts';

export interface ParseGamePathOptions {
  rawPath: string;
  libraries: Library[];
  currentLibraryId?: string;
  knownRoots?: string[];
}

export interface ParsedGamePath {
  installDir: string;
  matchedLibraryId: string | null;
  detectedTitle: string;
  driveLetter: string | null;
  isAbsolute: boolean;
  unregisteredDrive: boolean;
}

/**
 * Parses user input from the game path / folder field.
 * Handles Windows "Copy as Path" double-quoted strings, full Windows paths,
 * Steam library paths, and relative directory paths.
 */
export function parseGamePath({
  rawPath,
  libraries,
  currentLibraryId,
  knownRoots = [],
}: ParseGamePathOptions): ParsedGamePath {
  // 1. Sanitize quotes and whitespace
  const sanitized = rawPath.trim().replace(/^["']+|["']+$/g, '').trim();
  if (!sanitized) {
    return {
      installDir: '',
      matchedLibraryId: currentLibraryId || libraries[0]?.id || null,
      detectedTitle: '',
      driveLetter: null,
      isAbsolute: false,
      unregisteredDrive: false,
    };
  }

  // 2. Normalize backslashes to forward slashes for matching
  const normalized = sanitized.replace(/\\/g, '/');

  // 3. Check for Windows drive letter (e.g. "E:" or "C:/...")
  const driveMatch = normalized.match(/^([a-zA-Z]):(\/.*)?$/);
  if (!driveMatch) {
    // Relative path (e.g. "GRYPHLINK/games/EndField Game" or "WutheringWaves")
    const cleanRelative = normalized.replace(/^\/+|\/+$/g, '');
    const segments = cleanRelative.split('/').filter(Boolean);
    const title = segments.length > 0 ? segments[segments.length - 1] : '';
    return {
      installDir: cleanRelative,
      matchedLibraryId: currentLibraryId || libraries[0]?.id || null,
      detectedTitle: title,
      driveLetter: null,
      isAbsolute: false,
      unregisteredDrive: false,
    };
  }

  // Absolute path with drive letter
  const driveLetter = driveMatch[1].toUpperCase() + ':';
  const pathWithoutDrive = (driveMatch[2] || '').replace(/^\/+/, ''); // e.g. "Game/GRYPHLINK/games/EndField Game"

  // Check which registered libraries are on this drive
  const libsOnDrive = libraries.filter((lib) => {
    const m = (lib.name || '').match(/\b([a-zA-Z]:)/i);
    return m && m[1].toUpperCase() === driveLetter;
  });

  if (libsOnDrive.length === 0) {
    // Drive is not registered
    const segments = pathWithoutDrive.split('/').filter(Boolean);
    const title = segments.length > 0 ? segments[segments.length - 1] : '';
    return {
      installDir: pathWithoutDrive,
      matchedLibraryId: currentLibraryId || libraries[0]?.id || null,
      detectedTitle: title,
      driveLetter,
      isAbsolute: true,
      unregisteredDrive: true,
    };
  }

  // Try matching against known roots first (e.g. "E:/Game" or "E:/SteamLibrary")
  let matchedRoot: string | null = null;
  // Sort known roots by length descending so more specific subpaths match first
  const sortedRoots = [...knownRoots].sort((a, b) => b.length - a.length);
  for (const root of sortedRoots) {
    const normRoot = root.replace(/\\/g, '/').replace(/\/+$/, '');
    if (
      normalized.toLowerCase().startsWith(normRoot.toLowerCase() + '/') ||
      normalized.toLowerCase() === normRoot.toLowerCase()
    ) {
      matchedRoot = normRoot;
      break;
    }
  }

  let matchedLib: Library | undefined;
  let installDir = '';

  if (matchedRoot) {
    // Matched a known root
    installDir = normalized.slice(matchedRoot.length).replace(/^\/+/, '');
    // If inside steamapps/common, strip it so installDir is relative to common
    if (installDir.toLowerCase().startsWith('steamapps/common/')) {
      installDir = installDir.slice('steamapps/common/'.length).replace(/^\/+/, '');
    }
    const isSteamRoot = matchedRoot.toLowerCase().includes('steam');
    matchedLib = libsOnDrive.find((l) => {
      const isSteamLib = l.name.toLowerCase().includes('steam');
      return isSteamRoot ? isSteamLib : !isSteamLib;
    }) || libsOnDrive[0];
  } else if (normalized.toLowerCase().includes('/steamapps/common/')) {
    // Inside a Steam library
    const idx = normalized.toLowerCase().indexOf('/steamapps/common/');
    installDir = normalized.slice(idx + '/steamapps/common/'.length).replace(/^\/+/, '');
    matchedLib = libsOnDrive.find((l) => l.name.toLowerCase().includes('steam')) || libsOnDrive[0];
  } else {
    // Non-steam game path on drive
    // Prefer Games Library (non-steam) on this drive
    matchedLib = libsOnDrive.find((l) => !l.name.toLowerCase().includes('steam')) || libsOnDrive[0];

    // Check if the first segment is a folder like "Game" or "Games"
    const segments = pathWithoutDrive.split('/').filter(Boolean);
    if (segments.length > 1 && ['game', 'games'].includes(segments[0].toLowerCase())) {
      installDir = segments.slice(1).join('/');
    } else {
      installDir = pathWithoutDrive;
    }
  }

  const segments = installDir.split('/').filter(Boolean);
  const detectedTitle = segments.length > 0 ? segments[segments.length - 1] : '';

  return {
    installDir,
    matchedLibraryId: matchedLib ? matchedLib.id : (libsOnDrive[0]?.id || null),
    detectedTitle,
    driveLetter,
    isAbsolute: true,
    unregisteredDrive: false,
  };
}

export interface PreviewPaths {
  targetDisplay: string;
  backupDisplay: string;
}

/**
 * Computes live preview path strings for Target SSD and Mirror HDD.
 */
export function computePreviewPaths(
  installDir: string,
  targetLib: Library | undefined,
  allLibraries: Library[],
  knownRoots: string[] = []
): PreviewPaths {
  if (!installDir || !targetLib) {
    return { targetDisplay: '', backupDisplay: '' };
  }

  const winDir = installDir.replace(/\//g, '\\');
  const targetLabel = formatLibraryName(targetLib);

  const backupLib =
    allLibraries.find((l) => l.type === 'hdd_master' && l.id !== targetLib.id) ||
    allLibraries.find((l) => l.type === 'hdd_master');
  const backupLabel = backupLib ? formatLibraryName(backupLib) : 'Storage HDD';

  const findRoot = (lib: Library | undefined) => {
    if (!lib) return undefined;
    const m = (lib.name || '').match(/\b([a-zA-Z]:)/i);
    if (!m) return undefined;
    const letter = m[1].toUpperCase();
    const isSteam = lib.name.toLowerCase().includes('steam');
    return knownRoots.find((r) => {
      const rm = r.match(/\b([a-zA-Z]:)/i);
      if (!rm || rm[1].toUpperCase() !== letter) return false;
      const rIsSteam = r.toLowerCase().includes('steam');
      return isSteam === rIsSteam;
    });
  };

  const targetRoot = findRoot(targetLib);
  const backupRoot = findRoot(backupLib);

  const targetPath = targetRoot
    ? `${targetRoot.replace(/[/\\]+$/, '')}\\${winDir}`
    : `${targetLabel} \\ ${winDir}`;

  const backupPath = backupRoot
    ? `${backupRoot.replace(/[/\\]+$/, '')}\\${winDir}`
    : `${backupLabel} \\ ${winDir}`;

  return {
    targetDisplay: targetPath,
    backupDisplay: backupPath,
  };
}
