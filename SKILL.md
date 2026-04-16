# Media Converter Development Skills

## 1. Tauri v2 Sidecar Configuration
To use FFmpeg/FFprobe as sidecars:
- Download binaries from [FFmpeg.org](https://ffmpeg.org/download.html).
- Rename them with target triples (e.g., `ffmpeg-x86_64-unknown-linux-gnu`).
- Place them in `src-tauri/binaries/`.

Configure `tauri.conf.json`:
```json
{
  "bundle": {
    "externalBin": [
      "binaries/ffmpeg",
      "binaries/ffprobe"
    ]
  }
}
```

## 2. Media Metadata with FFprobe
Run `ffprobe` as a sidecar to get JSON metadata:
```rust
let output = app.shell()
    .sidecar("ffprobe")?
    .args(["-v", "error", "-show_format", "-show_streams", "-of", "json", input])
    .output().await?;
let json: Value = serde_json::from_slice(&output.stdout)?;
```

## 3. Parsing FFmpeg Progress
FFmpeg outputs progress to `stderr`. Use regex to extract `time=HH:MM:SS.ms`:
```rust
let re = Regex::new(r"time=(\d{2}:\d{2}:\d{2}\.\d{2})").unwrap();
// Parse and emit to frontend as percentage.
```

## 4. Auto-Update Setup (Tauri v2)
1. Generate keys: `pnpm tauri signer generate -w .`.
2. Set public key in `tauri.conf.json`.
3. Add `tauri-plugin-updater` to `Cargo.toml`.
4. Implement updater check in the main entry point.

## 5. Coding Standards (Biome)
- **Frontend**: `pnpm biome check --apply .` (Lint & Format).
- **Rust**: `cargo clippy --fix`, `cargo fmt`.

## 6. Localization (Chinese)
To localize the application into Chinese:
- **UI Labels**: Replace English strings with Chinese equivalents in the JSX/TSX files.
- **Backend Status Mapping**: Since Tauri backend may emit English status strings (e.g., "Completed", "Failed"), map them to Chinese in the frontend event listener:
  ```typescript
  let status = event.payload.status;
  if (status === "Completed") status = "已完成";
  if (status === "Failed") status = "失败";
  ```
- **File Dialog Filters**: Localize names in the `open` or `save` dialog options:
  ```typescript
  filters: [{ name: "视频", extensions: ["mp4", "mkv"] }]
  ```

## 8. Smart Output Naming & Directory Management
To organize processed files:
- Use a dedicated subfolder (e.g., `media-convert`) in the source directory.
- Format filenames with original name, operation, and a timestamp to avoid collisions:
  `{stem}_{operation}_{YYYYMMDD_HHMMSS}.{ext}`.
- Implement directory creation in Rust to ensure safety:
  ```rust
  let output_dir = parent.join("media-convert");
  if !output_dir.exists() {
      std::fs::create_dir_all(&output_dir)?;
  }
  ```

## 9. Opening Files/Folders (Tauri v2)
Use `@tauri-apps/plugin-opener` to reveal files in the system file explorer:
```typescript
import { reveal } from "@tauri-apps/plugin-opener";
await reveal(path);
```
Ensure `opener:default` permission is added to `src-tauri/capabilities/default.json`.

## 10. System Tray Configuration (Tauri v2)
To implement a system tray with menus:
1. Enable `tray-icon` feature in `Cargo.toml`.
2. Configure permissions in `capabilities/default.json` including `tray:default` and `shell:allow-open` for external links.
3. Build the tray in `src-tauri/src/lib.rs`:
   ```rust
   let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
   let menu = Menu::with_items(app, &[&quit_i])?;
   let _tray = TrayIconBuilder::new()
       .menu(&menu)
       .on_menu_event(|app, event| { /* handle events */ })
       .build(app)?;
   ```
4. Intercept the close event to minimize to tray:
   ```rust
   .on_window_event(|window, event| {
       if let WindowEvent::CloseRequested { api, .. } = event {
           api.prevent_close();
           window.hide().unwrap();
       }
   })
   ```

