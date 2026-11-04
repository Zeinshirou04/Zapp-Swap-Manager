# Plan 025: Fast SSD Staging Folder on Evict

## Problem
When a game is evicted from SSD cache to HDD master (`storage_hdd`), its `appmanifest_<appid>.acf` is moved to the HDD library.
By default, Steam stages future updates and downloads in the same library where the manifest resides (`<HDD>\steamapps\downloading`), subjecting patch downloads and decompression to slow HDD write/seek speeds.

## Solution
Steam manifests support an optional key: `"StagingFolder" "<index>"`, where `<index>` is the library index declared in `libraryfolders.vdf`.
When a manifest specifies `"StagingFolder" "1"`, Steam stages all update chunks and temporary files on library 1 (SSD `E:\SteamLibrary`) at full NVMe speed before moving them into the final installation folder.

### Implementation Steps
1. **Helper to resolve Steam Library Index**:
   - In `core/internal/steam/scanner.go`, add `LibraryFolderIndex(vdfData []byte, targetPath string) (string, error)` which maps a library filesystem path to its numerical key in `libraryfolders.vdf`.
2. **Set Staging Folder in `MoveManifest` / `Evict`**:
   - In `core/internal/transfer/sequences.go`, after `MoveManifest` relocates the `.acf` file to the HDD library during `Evict`, read the manifest and set `"StagingFolder"` to the SSD library's index.
3. **Unit Tests**:
   - Verify that `Evict` sets `"StagingFolder"` in the destination manifest.
   - Verify that `Promote` removes or updates `"StagingFolder"` when returning to SSD.
