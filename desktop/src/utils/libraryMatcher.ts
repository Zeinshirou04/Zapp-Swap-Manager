import { Game, Library, LibraryType } from '../types/api.ts';

/**
 * Extracts a normalized folder name without drive letter from a path.
 * e.g. "E:\Game" -> "game", "O:\SteamLibrary" -> "steamlibrary"
 */
function extractFolderKey(pathOrName: string): string {
  if (!pathOrName) return '';
  const clean = pathOrName.replace(/^[a-zA-Z]:[/\\]?/, '').trim();
  const segments = clean.split(/[/\\]+/).filter(Boolean);
  return segments.length > 0 ? segments[0].toLowerCase() : '';
}

/**
 * Finds the most intelligent matching target library for a game swap/backup/promote action.
 * Matches by category (Steam vs Generic) and parent folder name (e.g. E:\Game -> O:\Game).
 */
export function matchTargetLibrary(
  game: Game,
  targetType: LibraryType,
  libraries: Library[]
): Library | undefined {
  const candidates = libraries.filter((l) => l.type === targetType);
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const sourceLib = libraries.find((l) => l.id === game.current_library_id);
  const sourceName = (sourceLib?.name || '').toLowerCase();
  const sourcePath = ((sourceLib as { path?: string })?.path || '').toLowerCase();

  const isSourceSteam =
    !game.is_custom && (sourceName.includes('steam') || sourcePath.includes('steam'));

  // Separate candidates by category matching
  const categoryMatches = candidates.filter((c) => {
    const cName = c.name.toLowerCase();
    const cPath = ((c as { path?: string }).path || '').toLowerCase();
    const isTargetSteam = cName.includes('steam') || cPath.includes('steam');
    return isSourceSteam ? isTargetSteam : !isTargetSteam;
  });

  const pool = categoryMatches.length > 0 ? categoryMatches : candidates;

  // Try matching parent folder keys (e.g. "\Game" <-> "\Game")
  if (sourcePath || sourceName) {
    const sourceFolderKey = extractFolderKey(sourcePath || sourceName);
    if (sourceFolderKey) {
      const folderMatch = pool.find((c) => {
        const cPath = ((c as { path?: string }).path || '').toLowerCase();
        const cName = c.name.toLowerCase();
        const targetFolderKey = extractFolderKey(cPath || cName);
        return targetFolderKey === sourceFolderKey;
      });
      if (folderMatch) return folderMatch;
    }
  }

  return pool[0];
}
