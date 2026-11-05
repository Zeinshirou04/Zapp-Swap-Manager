# Plan 040: Explicit Custom Game Registration and Direct Path Input

## Background & Objectives
As requested by the user:
> "Don't do auto detect if it's not steam. Just like, register the game path."
1. **Disable Non-Steam Auto-Discovery**:
   - For generic non-Steam libraries (e.g. `E:\Game`, `O:\Game`), do not auto-detect unmanifested folders (like launchers, mod directories, texture packs) as games.
   - Non-Steam games must be explicitly registered by the user (which generates a `zappmanifest.json`), or have an existing directory junction.
   - Steam libraries (`<lib>/steamapps/common`) will continue standard Steam manifest and unmanifested game detection.
2. **Direct Game Path Registration in UI**:
   - In `AddGameModal.tsx`, allow users to paste or type the full game folder path directly (e.g. `E:\Game\GRYPHLINK\games\EndField Game`).
   - Automatically strip surrounding quotes (e.g. from Windows "Copy as Path").
   - Match the drive letter against registered libraries, automatically selecting the corresponding library and deriving the relative `install_dir`.
   - Auto-suggest the Game Name from the folder's base name if empty.
   - Display a clear preview of the resolved SSD path and mirror HDD backup path.

## Scope of Changes
1. **`core/internal/steam/scanner.go`**:
   - Update `findCustomGameDirsInLib` to accept `isSteam bool`.
   - Skip Pass 3 (unmanifested folder scanning) when `!isSteam`.
2. **`core/internal/steam/scanner_test.go`**:
   - Update `TestScanGenericGamesDirectory` to verify that unmanifested folders are omitted in non-Steam libraries while folders with `zappmanifest.json` are detected.
3. **`desktop/src/components/AddGameModal.tsx`**:
   - Add full path parsing and auto-selection of library.
   - Live preview showing the resolved SSD directory and matching HDD backup path.
4. **Verification**:
   - Run `just check` (Go tests, Vitest suites).
