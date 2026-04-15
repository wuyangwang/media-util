# Media Utility

A cross-platform desktop application built with Tauri v2 and React for media processing.

## Features
- **Batch Video & Image Conversion**: Convert multiple files at once using a sequential task queue.
- **Drag-and-Drop Support**: Simply drag files or entire folders into the app to add them to your queue.
- **Recursive File Scanning**: Automatically discover media files within nested folders.
- **Real-time Progress Tracking**: Individual progress bars for each task in the queue.
- **Modern Sidebar Layout**: Easy navigation between Video, Image, and Settings.

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
