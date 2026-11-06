import { describe, it, expect } from 'vitest';
import { matchTargetLibrary } from '../utils/libraryMatcher.ts';
import { Game, Library } from '../types/api.ts';

describe('matchTargetLibrary', () => {
  const libraries: (Library & { path?: string })[] = [
    {
      id: 'lib-steam-ssd',
      name: 'Steam Library (E: Drive)',
      type: 'ssd_cache',
      total_bytes: 1000,
      free_bytes: 500,
      path: 'E:\\SteamLibrary',
    },
    {
      id: 'lib-games-ssd',
      name: 'Games Library (E: Drive)',
      type: 'ssd_cache',
      total_bytes: 1000,
      free_bytes: 500,
      path: 'E:\\Game',
    },
    {
      id: 'lib-steam-hdd',
      name: 'Steam Library (O: Drive)',
      type: 'hdd_master',
      total_bytes: 2000,
      free_bytes: 1000,
      path: 'O:\\SteamLibrary',
    },
    {
      id: 'lib-games-hdd',
      name: 'Games Library (O: Drive)',
      type: 'hdd_master',
      total_bytes: 2000,
      free_bytes: 1000,
      path: 'O:\\Game',
    },
  ];

  it('matches non-Steam generic game on E:\\Game with O:\\Game HDD master', () => {
    const endfield: Game = {
      app_id: 12345,
      name: 'Arknights: Endfield',
      install_dir: 'Arknights',
      size_bytes: 70000000000,
      state: 'active_ssd',
      current_library_id: 'lib-games-ssd',
      build_id: 'custom',
      last_backup_time: null,
      backup_clean: false,
      is_custom: true,
    };

    const target = matchTargetLibrary(endfield, 'hdd_master', libraries);
    expect(target?.id).toBe('lib-games-hdd');
  });

  it('matches Steam game on E:\\SteamLibrary with O:\\SteamLibrary HDD master', () => {
    const terraria: Game = {
      app_id: 105600,
      name: 'Terraria',
      install_dir: 'Terraria',
      size_bytes: 200000000,
      state: 'active_ssd',
      current_library_id: 'lib-steam-ssd',
      build_id: '123456',
      last_backup_time: null,
      backup_clean: false,
      is_custom: false,
    };

    const target = matchTargetLibrary(terraria, 'hdd_master', libraries);
    expect(target?.id).toBe('lib-steam-hdd');
  });

  it('matches HDD promotion back to correct SSD cache folder', () => {
    const endfieldHdd: Game = {
      app_id: 12345,
      name: 'Arknights: Endfield',
      install_dir: 'Arknights',
      size_bytes: 70000000000,
      state: 'storage_hdd',
      current_library_id: 'lib-games-hdd',
      build_id: 'custom',
      last_backup_time: null,
      backup_clean: true,
      is_custom: true,
    };

    const target = matchTargetLibrary(endfieldHdd, 'ssd_cache', libraries);
    expect(target?.id).toBe('lib-games-ssd');
  });
});
