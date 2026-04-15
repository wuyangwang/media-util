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
  - Image processing: `image` crate, `photon-rs`
  - Compression: `zip` crate
- **Tooling**:
  - Package Manager: `pnpm`
  - Linting/Formatting: Biome
  - Rust Linting: Clippy + Cargo Fmt

## 3. Conversion Presets & Metadata
### Video Presets
| Preset | Resolution | FPS | Video Codec | Quality (CRF) |
| :--- | :--- | :--- | :--- | :--- |
| **720p** | 1280x720 | 30 | libx264 | 22 |
| **1080p** | 1920x1080 | 30 | libx264 | 20 |
| **2K** | 2560x1440 | 30 | libx264 | 18 |

### Image Presets
#### Size Presets
- **ID Photos**: 1 inch (295x413), 2 inch (413x579), Small 2 inch (413x531), Small 1 inch (260x378)
- **Social Media**: WeChat Cover (900x383), Xiaohongshu (3000x4000), Moments (1080x1080), Douyin (1080x1920), Weibo (1080x1080)
- **General**: Avatar (400x400), Thumbnail (256x256), Blog Cover (1200x630), E-commerce Main (800x800)

#### Aspect Ratio Presets
- 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3

### Metadata Extraction
- **Batch Processing**: Supports processing multiple videos or images sequentially.
- **Drag-and-Drop**: Users can drag files or folders directly into the application to add them to the task queue.
- **Recursive Scan**: Automatically finds all supported media files within dropped folders.
- **ZIP Export**: Supports batching processed files into a ZIP archive.

## 4. Implementation Details
- **FFmpeg Sidecar**:
  - Command: `ffmpeg -i {input} -vf "scale={w}:{h},fps={fps}" -c:v libx264 -preset fast -crf {crf} {output}.mp4`
  - Progress: Parsed from `stderr` using regex: `time=(\d{2}:\d{2}:\d{2}\.\d{2})`.
  - **Naming Convention**: Sidecar binaries must follow the format `binary-target-triple`, e.g., `ffmpeg-x86_64-unknown-linux-gnu` in `src-tauri/binaries`.
- **Image Processing**:
  - Uses `image` crate for high-performance resizing and cropping.
  - Supports "Fixed Size", "Ratio", and "Custom" crop modes.
- **Auto-Update**:
  - Uses `tauri-plugin-updater`.
  - Requires a public key and an update server (e.g., GitHub Releases).
- **Standards**:
  - Frontend: `pnpm lint`, `pnpm format`.
  - Backend: `cargo clippy`, `cargo fmt`.

## 5. Roadmap
- [x] Phase 1: Environment Setup (Standardization, Plugins, Sidecar config).
- [x] Phase 2: Rust Backend (FFmpeg command builder, Progress parsing).
- [x] Phase 3: Frontend (Sidebar Layout, Video Converter UI).
- [x] Phase 4: Image Processing (Implemented format conversion and advanced cropping with presets).
- [x] Phase 5: Settings & Preferences (Implemented theme switching and info).
- [x] Phase 6: Batch Operations (Implemented recursive scanning and ZIP export).
- [x] Phase 7: Packaging & Auto-Update (Configured tauri.conf.json and updater plugin).
