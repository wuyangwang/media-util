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
