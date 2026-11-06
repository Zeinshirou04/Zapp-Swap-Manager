import { describe, it, expect } from 'vitest';
import { parseGamePath, computePreviewPaths } from '../utils/pathParser.ts';
import { Library } from '../types/api.ts';

const mockLibraries: Library[] = [
  {
    id: 'lib-steam-e',
    name: 'Steam Library (E: Drive)',
    type: 'ssd_cache',
    total_bytes: 250000000000,
    free_bytes: 50000000000,
  },
  {
    id: 'lib-games-e',
    name: 'Games Library (E: Drive)',
    type: 'ssd_cache',
    total_bytes: 250000000000,
    free_bytes: 50000000000,
  },
  {
    id: 'lib-games-o',
    name: 'Games Library (O: Drive)',
    type: 'hdd_master',
    total_bytes: 1000000000000,
    free_bytes: 800000000000,
  },
  {
    id: 'lib-steam-o',
    name: 'Steam Library (O: Drive)',
    type: 'hdd_master',
    total_bytes: 1000000000000,
    free_bytes: 800000000000,
  },
];

describe('parseGamePath', () => {
  it('parses Windows Copy as Path with double quotes', () => {
    const result = parseGamePath({
      rawPath: '"E:\\Game\\GRYPHLINK\\games\\EndField Game"',
      libraries: mockLibraries,
      knownRoots: ['E:\\Game', 'O:\\Game'],
    });

    expect(result.driveLetter).toBe('E:');
    expect(result.isAbsolute).toBe(true);
    expect(result.unregisteredDrive).toBe(false);
    expect(result.matchedLibraryId).toBe('lib-games-e');
    expect(result.installDir).toBe('GRYPHLINK/games/EndField Game');
    expect(result.detectedTitle).toBe('EndField Game');
  });

  it('parses Windows Copy as Path with single quotes', () => {
    const result = parseGamePath({
      rawPath: "'E:\\Game\\GRYPHLINK\\games\\EndField Game'",
      libraries: mockLibraries,
      knownRoots: ['E:\\Game', 'O:\\Game'],
    });

    expect(result.driveLetter).toBe('E:');
    expect(result.matchedLibraryId).toBe('lib-games-e');
    expect(result.installDir).toBe('GRYPHLINK/games/EndField Game');
    expect(result.detectedTitle).toBe('EndField Game');
  });

  it('parses unquoted Windows path with known root', () => {
    const result = parseGamePath({
      rawPath: 'E:\\Game\\GRYPHLINK\\games\\EndField Game',
      libraries: mockLibraries,
      knownRoots: ['E:\\Game', 'O:\\Game'],
    });

    expect(result.matchedLibraryId).toBe('lib-games-e');
    expect(result.installDir).toBe('GRYPHLINK/games/EndField Game');
    expect(result.detectedTitle).toBe('EndField Game');
  });

  it('parses path inside steamapps/common', () => {
    const result = parseGamePath({
      rawPath: 'E:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077',
      libraries: mockLibraries,
      knownRoots: ['E:\\SteamLibrary', 'O:\\SteamLibrary'],
    });

    expect(result.matchedLibraryId).toBe('lib-steam-e');
    expect(result.installDir).toBe('Cyberpunk 2077');
    expect(result.detectedTitle).toBe('Cyberpunk 2077');
  });

  it('falls back to non-steam library on drive and strips Game prefix when roots unknown', () => {
    const result = parseGamePath({
      rawPath: 'E:\\Game\\Riot Games\\VALORANT',
      libraries: mockLibraries,
      knownRoots: [],
    });

    expect(result.matchedLibraryId).toBe('lib-games-e');
    expect(result.installDir).toBe('Riot Games/VALORANT');
    expect(result.detectedTitle).toBe('VALORANT');
  });

  it('handles relative subfolder path', () => {
    const result = parseGamePath({
      rawPath: 'GRYPHLINK/games/EndField Game',
      libraries: mockLibraries,
      currentLibraryId: 'lib-games-e',
    });

    expect(result.isAbsolute).toBe(false);
    expect(result.driveLetter).toBe(null);
    expect(result.matchedLibraryId).toBe('lib-games-e');
    expect(result.installDir).toBe('GRYPHLINK/games/EndField Game');
    expect(result.detectedTitle).toBe('EndField Game');
  });

  it('handles bare folder name', () => {
    const result = parseGamePath({
      rawPath: 'WutheringWaves',
      libraries: mockLibraries,
      currentLibraryId: 'lib-games-e',
    });

    expect(result.isAbsolute).toBe(false);
    expect(result.installDir).toBe('WutheringWaves');
    expect(result.detectedTitle).toBe('WutheringWaves');
  });

  it('detects unregistered drive letter', () => {
    const result = parseGamePath({
      rawPath: 'F:\\Games\\Wuthering Waves',
      libraries: mockLibraries,
    });

    expect(result.isAbsolute).toBe(true);
    expect(result.driveLetter).toBe('F:');
    expect(result.unregisteredDrive).toBe(true);
  });

  it('handles empty path cleanly', () => {
    const result = parseGamePath({
      rawPath: '',
      libraries: mockLibraries,
      currentLibraryId: 'lib-games-e',
    });

    expect(result.installDir).toBe('');
    expect(result.detectedTitle).toBe('');
    expect(result.matchedLibraryId).toBe('lib-games-e');
  });
});

describe('computePreviewPaths', () => {
  it('computes live preview paths with known roots', () => {
    const preview = computePreviewPaths(
      'GRYPHLINK/games/EndField Game',
      mockLibraries[1], // Games Library (E: Drive)
      mockLibraries,
      ['E:\\Game', 'O:\\Game']
    );

    expect(preview.targetDisplay).toBe('E:\\Game\\GRYPHLINK\\games\\EndField Game');
    expect(preview.backupDisplay).toBe('O:\\Game\\GRYPHLINK\\games\\EndField Game');
  });

  it('falls back to library label if roots are unknown', () => {
    const preview = computePreviewPaths(
      'GRYPHLINK/games/EndField Game',
      mockLibraries[1], // Games Library (E: Drive)
      mockLibraries,
      []
    );

    expect(preview.targetDisplay).toBe('Games Library (E: Drive) \\ GRYPHLINK\\games\\EndField Game');
    expect(preview.backupDisplay).toBe('Games Library (O: Drive) \\ GRYPHLINK\\games\\EndField Game');
  });

  it('uses lib.path directly if available without needing knownRoots', () => {
    const targetWithDir = { ...mockLibraries[1], path: 'E:\\Games' };
    const backupWithDir = { ...mockLibraries[2], path: 'O:\\Games' };
    const preview = computePreviewPaths(
      'Arknights',
      targetWithDir,
      [mockLibraries[0], targetWithDir, backupWithDir, mockLibraries[3]],
      []
    );

    expect(preview.targetDisplay).toBe('E:\\Games\\Arknights');
    expect(preview.backupDisplay).toBe('O:\\Games\\Arknights');
  });
});
