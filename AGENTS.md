# Game Swap Manager

Windows tool that moves and backs up Steam games between an SSD (fast, small) and an HDD (large, master copy), controlled remotely from a phone.

## Architecture
- `core/`    Go. Always-running service with tray icon. The ONLY component that touches the disk: runs Robocopy, edits Steam manifests, keeps the job queue (SQLite), exposes the HTTP API.
- `desktop/` Tauri + React dashboard. A client of the core API. No disk logic.
- `mobile/`  Kotlin + Jetpack Compose remote app. A client of the core API through a Cloudflare Tunnel. Caches a snapshot in Room and syncs hourly (WorkManager).
- `api/`     `openapi.yaml`: the single contract between all parts.
- `docs/`    `safety.md`, `workflow.md`, `plans/`.

## Working rules
- Work only inside the folder named in your task. Do not read other components' source code. Use `api/openapi.yaml` and `docs/` instead.
- If you need a change in another component or in the API contract, STOP and say so.
- Implement only the plan you were given (`docs/plans/NNN-*.md`). Do not expand scope.
- Before touching code that moves, copies, mirrors or deletes files, or edits Steam manifests, read `docs/safety.md`.
- Whenever making UI changes (`desktop/` or `mobile/`), follow `.agents/skills/zapp-ui-design/SKILL.md` and update it alongside your changes whenever design guidelines, patterns, or components evolve.
- Look up current library docs (Context7) instead of guessing APIs from memory.
- Run `just check` before every commit.

## Never
- Commit to `main`, force push, or merge PRs.
- Accept raw filesystem paths from the API. Only app IDs and whitelisted libraries.
- Delete anything on the SSD before the HDD copy is verified.
- Run a mirror if the source is missing or empty, or the destination is not the expected path.
- Add a dependency without saying why.

## Stop and ask first
- Anything that deletes files, changes the move/evict/promote sequences, touches auth, or changes the API contract.

## Git
- Branches: `<type>/<scope>-<desc>`, e.g. `feat/core-evict-sequence`.
- Commits: `type(scope): description`. Types: feat, fix, refactor, test, docs, chore, ci, perf. Scopes: core, desktop, mobile, api, docs, ci, deps. One concern per commit.
- PR title is a conventional commit; PRs are squash merged. Details in `docs/workflow.md`.
