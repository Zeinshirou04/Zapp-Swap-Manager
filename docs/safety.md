# Safety rules

Read this before touching any code that moves, copies, mirrors or deletes files, or edits Steam manifests.

## Model
- The HDD is the master library. The SSD is a limited-size cache of games being played.
- An hourly backup keeps the HDD copy in sync, so evicting a game from the SSD is fast.
- On the HDD, game data lives in `<HDD library>\steamapps\common\<installdir>` WITHOUT a manifest. Only one library holds a game's `appmanifest_<appid>.acf` at a time: the library where Steam should consider the game installed.

## Directions
- SSD to HDD (backup, evict): Robocopy MIRROR.
- HDD to SSD (promote): Robocopy COPY.

## Mirror guards (refuse and report if any fails)
- Source folder exists and is not empty.
- Source file count or size is not far below the last recorded backup (suggested: a drop of more than 30% needs manual confirmation).
- Destination is exactly `<HDD library>\steamapps\common\<installdir>` for that game.
- A dry run (`/L`) was done first and its planned deletions were read.

## Evict (SSD to HDD)
1. Final mirror SSD to HDD.
2. Verify file count and size match.
3. Move the manifest from the SSD library to the HDD library.
4. Delete the game folder on the SSD.

## Promote (HDD to SSD)
1. Copy HDD to SSD.
2. Verify file count and size match.
3. Move the manifest from the HDD library to the SSD library.
4. Keep the HDD copy as the backup.

## Backup skip logic
- Skip when the game is running or mid-update (check manifest `StateFlags` and the process).
- A game's backup is "clean" only if its `buildid` is unchanged AND the incremental pass finds nothing to copy. Local files (saves, configs, mods) can change without a new `buildid`.
- Check free space on the target before starting.

## Queue
- One worker, strictly serial, FIFO. Moves wait for a running or queued backup of the same game. Never run two jobs on the same game at once.
- Every step is journaled in SQLite before and after it runs, and every step is safe to repeat. On restart, resume or roll back from the journal. Never guess from folder state.

## API input
- Accept only app IDs and whitelisted library targets. Build paths and commands server-side. Reject anything else.
- Bind the core to `127.0.0.1`. Validate the Cloudflare Access JWT on every request.

## Robocopy exit codes
0 to 7 are success variants (0 means nothing copied, 1 means files copied, 2 means extras found, and so on). 8 and above are failures. Treat 8+ as failure and stop.

## Verification before release
Run the full cycle (backup, evict, promote) on one small real game, both directions, with Steam open and with Steam closed.
