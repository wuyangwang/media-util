# Media Converter Project Document

## 1. Project Overview
A cross-platform desktop application built with Tauri v2, TanStack Router (SPA), and Rust.
Main function: Convert images and videos with predefined presets.

## 2. Tech Stack
- **Frontend**: 
  - Framework: React 19 + TypeScript
  - Routing: TanStack Router
  - Data Fetching: TanStack Query
  - Styling: Tailwind CSS v4 + Shadcn UI
  - Icons: Lucide React (via Shadcn)
- **Backend (Tauri/Rust)**:
  - Tauri v2
  - Video processing: FFmpeg 7.x (Sidecar)
  - Metadata: FFprobe 7.x (Sidecar)
  - Image processing: `image` crate
- **Tooling**:
  - Package Manager: `pnpm`
  - Linting/Formatting: Biome
  - Rust Linting: Clippy + Cargo Fmt

## 3. Conversion Presets & Metadata
### Presets
| Preset | Resolution | FPS | Video Codec | Quality (CRF) |
| :--- | :--- | :--- | :--- | :--- |
| **720p** | 1280x720 | 30 | libx264 | 22 |
| **1080p** | 1920x1080 | 30 | libx264 | 20 |
| **2K** | 2560x1440 | 30 | libx264 | 18 |

### Metadata Extraction
- **Video**: `ffprobe -v error -show_format -show_streams -of json {input}`
- **Image**: Basic dimensions and format via `image` crate.

## 4. Implementation Details
- **FFmpeg Sidecar**:
  - Command: `ffmpeg -i {input} -vf "scale={w}:{h},fps={fps}" -c:v libx264 -preset fast -crf {crf} {output}.mp4`
  - Progress: Parsed from `stderr` using regex: `time=(\d{2}:\d{2}:\d{2}\.\d{2})`.
- **Auto-Update**:
  - Uses `tauri-plugin-updater`.
  - Requires a public key and an update server (e.g., GitHub Releases).
- **Standards**:
  - Frontend: `pnpm lint`, `pnpm format`.
  - Backend: `cargo clippy`, `cargo fmt`.

## 5. Roadmap
- [ ] Phase 1: Environment Setup (Standardization, Plugins, Sidecar config).
- [ ] Phase 2: Rust Backend (FFmpeg command builder, Progress parsing).
- [ ] Phase 3: Frontend (Presets UI, Task Queue, Progress bars).
- [ ] Phase 4: Packaging & Auto-Update.
