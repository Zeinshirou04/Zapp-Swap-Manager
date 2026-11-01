# Plan NNN: <title>

## Goal
One or two sentences.

## Scope
Folder: core | desktop | mobile | api
Branch: `<type>/<scope>-<desc>`

## Steps
0. **Branch Setup**:
   Ensure local `main` is up to date, then check out the task branch:
   ```bash
   git checkout main
   git pull
   git checkout -b <type>/<scope>-<desc>
   ```
1. ...

## Files to touch
- ...

## Out of scope
- ...

## Acceptance checks
- [ ] `just check` passes
- [ ] ...

## Safety
Touches move/delete/manifest code? yes / no. If yes, which rules in `docs/safety.md` apply?
