# Media Utility

A cross-platform desktop application built with Tauri v2 and React for media processing.

## Features
- **Video Conversion**: Convert videos to different resolutions (720p, 1080p, 2K) using FFmpeg.
- **Progress Tracking**: Real-time progress bars for video conversion tasks.
- **Sidebar Layout**: Modern navigation for Video, Images, and Settings.

## Tech Stack
- **Frontend**: React 19, TypeScript, TanStack Router, Tailwind CSS v4, Shadcn UI.
- **Backend**: Rust, Tauri v2, FFmpeg (Sidecar).

## Development
```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev
```

## Status
- [x] Sidebar Layout
- [x] Video Format Conversion
- [ ] Image Processing (Planned)
- [ ] Settings (Planned)
