use crate::config::{AppConfig, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS};
use serde::Serialize;
use serde_json::Value;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

pub fn get_formatted_output_path(
    input_path: String,
    operation: String,
    extension: Option<String>,
) -> Result<String, String> {
    let path = Path::new(&input_path);
    let parent = path.parent().ok_or("Invalid input path")?;
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid filename")?;

    let input_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    let ext = match extension.as_deref() {
        Some("original") | None => input_ext,
        Some(e) => e.to_string(),
    };

    let timestamp = chrono::Utc::now().timestamp_millis().to_string();
    let output_dir = parent.join("media-convert");
    if !output_dir.exists() {
        std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    }

    let new_filename = format!("{}_{}_{}.{}", stem, operation, timestamp, ext);
    let output_path = output_dir.join(new_filename);

    Ok(output_path
        .to_str()
        .ok_or("Invalid output path")?
        .to_string())
}

#[derive(Serialize, Clone, Debug)]
pub struct MediaInfo {
    pub format: String,
    pub size: u64,
    pub duration: f64,
    pub video: Option<VideoInfo>,
}

#[derive(Serialize, Clone, Debug)]
pub struct VideoInfo {
    pub width: i32,
    pub height: i32,
    pub codec: String,
    pub fps: String,
    pub bitrate: Option<String>,
}

pub async fn open_devtools(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

pub async fn get_media_info(app: AppHandle, path: String) -> Result<MediaInfo, String> {
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let size = metadata.len();

    let ext = Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        if let Ok(img) = image::image_dimensions(&path) {
            return Ok(MediaInfo {
                format: ext,
                size,
                duration: 0.0,
                video: Some(VideoInfo {
                    width: img.0 as i32,
                    height: img.1 as i32,
                    codec: "image".to_string(),
                    fps: "0".to_string(),
                    bitrate: None,
                }),
            });
        }
    }

    let output_result = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| e.to_string())?
        .args([
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            &path,
        ])
        .output()
        .await;

    let mut duration = 0.0;
    let mut video = None;

    if let Ok(output) = output_result {
        if let Ok(json) = serde_json::from_slice::<Value>(&output.stdout) {
            duration = json["format"]["duration"]
                .as_str()
                .unwrap_or("0")
                .parse::<f64>()
                .unwrap_or(0.0);

            let video_stream = json["streams"]
                .as_array()
                .and_then(|streams| streams.iter().find(|s| s["codec_type"] == "video"));

            video = video_stream.map(|s| {
                let fps_raw = s["avg_frame_rate"].as_str().unwrap_or("0");
                let fps = if fps_raw.contains('/') {
                    let parts: Vec<&str> = fps_raw.split('/').collect();
                    if parts.len() == 2 {
                        let num: f64 = parts[0].parse().unwrap_or(0.0);
                        let den: f64 = parts[1].parse().unwrap_or(1.0);
                        if den > 0.0 {
                            (num / den).to_string()
                        } else {
                            num.to_string()
                        }
                    } else {
                        fps_raw.to_string()
                    }
                } else {
                    fps_raw.to_string()
                };

                VideoInfo {
                    width: s["width"].as_i64().unwrap_or(0) as i32,
                    height: s["height"].as_i64().unwrap_or(0) as i32,
                    codec: s["codec_name"].as_str().unwrap_or("unknown").to_string(),
                    fps,
                    bitrate: s["bit_rate"].as_str().map(|v| v.to_string()),
                }
            });
        }
    }

    Ok(MediaInfo {
        format: ext,
        size,
        duration,
        video,
    })
}

pub fn get_app_config() -> Result<AppConfig, String> {
    Ok(AppConfig::get_config())
}

pub async fn scan_directory(path: String, mode: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let mut stack = vec![std::path::PathBuf::from(path)];
    let target_exts = if mode == "video" {
        VIDEO_EXTENSIONS
    } else {
        IMAGE_EXTENSIONS
    };

    while let Some(current_path) = stack.pop() {
        if current_path.is_dir() {
            if let Ok(entries) = std::fs::read_dir(current_path) {
                for entry in entries.flatten() {
                    stack.push(entry.path());
                }
            }
        } else if current_path.is_file() {
            if let Some(ext) = current_path.extension().and_then(|e| e.to_str()) {
                if target_exts.contains(&ext.to_lowercase().as_str()) {
                    if let Some(path_str) = current_path.to_str() {
                        files.push(path_str.to_string());
                    }
                }
            }
        }
    }

    Ok(files)
}

pub fn batch_to_zip(file_paths: Vec<String>, output_zip_path: String) -> Result<(), String> {
    if file_paths.is_empty() {
        return Err("No files to zip".to_string());
    }

    let zip_file = File::create(&output_zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(zip_file);

    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    for file_path in file_paths {
        let path = Path::new(&file_path);
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("Invalid file name: {}", file_path))?;

        zip.start_file(file_name, options)
            .map_err(|e| format!("Failed to add file to zip: {}", e))?;

        let file_content = std::fs::read(&file_path)
            .map_err(|e| format!("Failed to read file {}: {}", file_path, e))?;

        zip.write_all(&file_content)
            .map_err(|e| format!("Failed to write file to zip: {}", e))?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finish zip file: {}", e))?;

    Ok(())
}
