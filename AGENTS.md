# AGENTS.md

## Scope
This file governs the entire repository rooted at this directory.

## Project Intent
Media Utility is a desktop app for video/image processing and export workflows.
Tech stack: Tauri v2 + React 19 + TypeScript + Rust + FFmpeg/FFprobe sidecar.

## Core Stack
- Frontend: React 19, TypeScript, TanStack Router, Tailwind v4, shadcn/ui
- Desktop: Tauri v2
- Backend commands: Rust (`src-tauri/src`)
- Media engine: FFmpeg/FFprobe sidecar binaries

## High-Priority Paths
- `src/routes/` (overview/videos/images/settings pages)
- `src/hooks/` (scan/queue and related hooks)
- `src-tauri/src/media.rs` (media processing core)
- `src-tauri/capabilities/` (permissions and tray config)
- `src-tauri/tauri.conf.json` (bundle config + `externalBin`)
- `.github/workflows/release.yml` (Windows release pipeline)

## Working Rules
- Read `README.md` and this file before editing.
- Keep diffs minimal, reversible, and focused.
- Reuse existing patterns/utilities before introducing new abstractions.
- Do not add dependencies unless explicitly required by task.
- Preserve existing behavior unless task explicitly requests behavior change.

## Verification Requirements
After code changes, run:
- `pnpm build`

If packaging/release-related files changed, also run:
- `pnpm pack:win`

If tests exist for touched areas, run the relevant tests before completion.

## Packaging Constraints
- Windows distributables are installer artifacts (NSIS/MSI).
- Do not treat bare `release/*.exe` as final distributable output.
- Ensure FFmpeg/FFprobe sidecar binaries are bundled through installer targets.

## Completion Checklist
Before claiming done:
- Requested changes are implemented.
- Verification commands completed successfully.
- No unrelated file modifications were introduced.
- Risks or known gaps are explicitly reported.
