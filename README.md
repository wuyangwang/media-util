# Media Utility

A cross-platform desktop application built with Tauri v2 and React for media processing.

## Features
- **Batch Video & Image Processing**: Convert multiple files at once using a sequential task queue.
- **Advanced Image Cropping**: Support for fixed sizes (ID photos, Social Media), specific aspect ratios, and custom dimensions.
- **Drag-and-Drop Support**: Simply drag files or entire folders into the app to add them to your queue.
- **Recursive File Scanning**: Automatically discover media files within nested folders.
- **Batch Export**: Save processed files individually or bundle them into a ZIP archive.
- **Real-time Progress Tracking**: Individual progress bars for each task in the queue.
- **Modern Sidebar Layout**: Easy navigation between Video, Image, and Settings.

## Tech Stack
- **Frontend**: React 19, TypeScript, TanStack Router, Tailwind CSS v4, Shadcn UI.
- **Backend**: Rust, Tauri v2, FFmpeg (Sidecar).
- **Key Rust Crates**: `image`, `photon-rs`, `zip`, `serde`.

## Development
```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev
```

## Status
- [x] Sidebar Layout
- [x] Video Format Conversion (720p, 1080p, 2K)
- [x] Image Processing (Crop presets, Format conversion)
- [x] Batch Operations (Recursive scan, ZIP export)
- [x] Settings (Theme switching)
- [x] Packaging & Auto-Update (Configured)
