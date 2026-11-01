# Workflow

## Branches
`main` is protected. Short-lived branches, one per plan: `<type>/<scope>-<desc>`
(`feat/core-evict-sequence`, `fix/core-manifest-move`, `chore/ci-go-checks`).

## Commits
`type(scope): imperative description`, under about 72 characters.
Types: feat, fix, refactor, test, docs, chore, ci, perf.
Scopes: core, desktop, mobile, api, docs, ci, deps.
Breaking API change: `feat(api)!: ...`. One concern per commit.

## Pull requests
- One PR per plan, into `main`. Title is a conventional commit.
- Squash merge. Delete the branch after merging.
- Fill in the PR template, including the safety checklist.
- Required checks: the `ci-ok` job. No force pushes to `main`.

## Agent flow
1. Antigravity writes a plan to `docs/plans/NNN-name.md` (see `_template.md`). You review it.
2. Create the branch. Start OpenCode inside the target folder (`cd core`).
3. Tell the agent to implement plan NNN only. It commits to the branch, never to `main`.
4. CI runs. You review the diff, then squash merge.

## Testing
- Core logic: unit tests (state machine, guards, VDF parsing, snapshot diff).
- Core moves: integration tests on temp folders with fake Steam libraries and real Robocopy (Windows runner).
- API: handlers checked against `api/openapi.yaml`; bad input rejected.
- Mobile: unit tests for sync and Room with a fake API.
- Before each release: manual full cycle on one small real game.
