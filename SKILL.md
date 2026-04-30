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
- Format filenames with original name, operation, and a 13-digit Unix timestamp to avoid collisions:
  `{stem}_{operation}_{timestamp}.{ext}`.
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

## 11. Window Initial State Configuration (Tauri v2)
To ensure the application window opens in a specific state (e.g., centered) and is correctly identifiable by the backend:
1. Configure `src-tauri/tauri.conf.json`:
   ```json
   {
     "app": {
       "windows": [
         {
           "label": "main",
           "title": "Your App Name",
           "width": 1000,
           "height": 700,
           "center": true
         }
       ]
     }
   }
   ```
   - **`label`**: Must match the ID used in `app.get_webview_window("main")` in Rust.
   - **`center`**: Set to `true` to open the window in the middle of the screen.
2. (Optional) Force centering in Rust (e.g., when restoring from tray):
   ```rust
   if let Some(window) = app.get_webview_window("main") {
       let _ = window.center();
       let _ = window.show();
   }
   ```

## 12. 开发工作流规范 (Development Workflow)
- **即时提交**：每当完成一个功能点、修复一个 Bug 或对配置文件进行有效修改后，**必须立即执行 Git 提交**。
- **原子化提交**：保持提交的粒度适中，确保每个 Commit 描述清晰且只包含相关的改动。
- **文档同步**：如果改动涉及新的配置项或开发技巧，需同步更新 `SKILL.md` 或 `README.md`。

## 13. 自动 CPU 资源限制与性能均衡
在 Rust 后端进行耗时计算（如 FFmpeg 调用）时，应自动控制并发线程数，避免导致系统 UI 卡死：
```rust
use std::thread::available_parallelism;

let threads = available_parallelism().map(|n| n.get()).unwrap_or(1);
// 动态分配线程：总核心数 - 1，保留一个核心给 UI 响应
let worker_threads = if threads > 1 { threads - 1 } else { 1 };
args.push("-threads".to_string());
args.push(worker_threads.to_string());
```

## 15. 本地语音转写 (Whisper / SenseVoice)
基于 `transcribe-rs` 实现本地 AI 语音转写：
- **模型文件管理**：模型存储在应用数据目录下。转写前需通过 `get_transcription_models_status` 检查模型是否已下载。
- **双版本输出**：转写结果应同时保存为纯文本 (`.txt`) 和带时间戳的版本 (`.timestamped.txt`)。
- **UI 反馈**：转写是耗时操作，需通过 `emit_progress` 实时向前端发送进度和状态。

## 16. Rust 异步确认对话框 (Tauri v2)
使用 `tauri-plugin-dialog` 实现非阻塞的确认对话框：
```rust
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn confirm_action(app: tauri::AppHandle, message: String) -> Result<bool, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .confirm(message)
        .show(move |confirmed| {
            let _ = tx.send(confirmed);
        });
    rx.await.map_err(|e| e.to_string())
}
```
注意：必须在 `async` 命令中使用 `oneshot` 通道来等待回调结果，以避免阻塞主线程。

## 17. AI 目标检测 (YOLOv11)
基于 `ort` (ONNX Runtime) 实现本地 AI 目标检测：
- **模型加载**：加载 `.onnx` 模型文件，通过 `ort` 进行推理。
- **图像预处理**：调整图像大小并进行归一化处理（Scale 1/255.0）。
- **非极大值抑制 (NMS)**：对检测结果进行 NMS 处理，过滤重叠度高的边界框。
- **可视化绘制**：使用 `imageproc` 和 `ab_glyph` 在图像上绘制识别出的边界框和中文标签。

## 18. 批量导出与压缩 (ZIP)
使用 `zip` 库将处理后的文件打包：
- **递归打包**：支持将选中的文件或整个文件夹打包。
- **进度反馈**：由于打包大文件可能较慢，建议通过 `progress` 事件反馈当前打包的文件名和整体百分比。


