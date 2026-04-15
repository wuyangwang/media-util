use crate::config::{Preset, VIDEO_EXTENSIONS, IMAGE_EXTENSIONS};
use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use regex::Regex;
use tauri::{AppHandle, Emitter};
use std::path::Path;

#[derive(Clone, Serialize)]
struct ProgressPayload {
    id: String,
    progress: f64,
    status: String,
}

use serde_json::Value;

#[derive(Serialize)]
pub struct MediaInfo {
    pub format: String,
    pub size: u64,
    pub duration: f64,
    pub video: Option<VideoInfo>,
}

#[derive(Serialize)]
pub struct VideoInfo {
    pub width: i32,
    pub height: i32,
    pub codec: String,
    pub fps: String,
    pub bitrate: Option<String>,
}

#[tauri::command]
pub async fn get_media_info(app: AppHandle, path: String) -> Result<MediaInfo, String> {
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let size = metadata.len();

    // Check if it's an image or video by extension (simple check)
    let ext = Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        let img = image::image_dimensions(&path).map_err(|e| e.to_string())?;
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

    // Try ffprobe for videos
    let output = app.shell()
        .sidecar("ffprobe")
        .map_err(|e| e.to_string())?
        .args([
            "-v", "error",
            "-show_format",
            "-show_streams",
            "-of", "json",
            &path,
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let json: Value = serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    
    let format = json["format"]["format_name"].as_str().unwrap_or("unknown").to_string();
    let duration = json["format"]["duration"].as_str().unwrap_or("0").parse::<f64>().unwrap_or(0.0);
    
    let video_stream = json["streams"]
        .as_array()
        .and_then(|streams| streams.iter().find(|s| s["codec_type"] == "video"));

    let video = video_stream.map(|s| VideoInfo {
        width: s["width"].as_i64().unwrap_or(0) as i32,
        height: s["height"].as_i64().unwrap_or(0) as i32,
        codec: s["codec_name"].as_str().unwrap_or("unknown").to_string(),
        fps: s["avg_frame_rate"].as_str().unwrap_or("0").to_string(),
        bitrate: s["bit_rate"].as_str().map(|s| s.to_string()),
    });

    Ok(MediaInfo {
        format,
        size,
        duration,
        video,
    })
}

#[tauri::command]
pub async fn convert_video(
    app: AppHandle,
    id: String,
    input_path: String,
    output_path: String,
    preset: Preset,
) -> Result<(), String> {
    // Get total duration first for progress calculation
    let media_info = get_media_info(app.clone(), input_path.clone()).await?;
    let total_duration = media_info.duration;

    let params = preset.get_params();
    let scale_vf = format!("scale={}:{}", params.width, params.height);

    let shell = app.shell();
    let output = shell
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args([
            "-i", &input_path,
            "-vf", &format!("{},fps=30", scale_vf),
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", &params.crf.to_string(),
            "-y", // Overwrite output
            &output_path,
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    let (mut rx, _child) = output;

    let re = Regex::new(r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})").unwrap();
    
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stderr(line) = event {
                let line_str = String::from_utf8_lossy(&line);
                if let Some(caps) = re.captures(&line_str) {
                    let h: f64 = caps.get(1).unwrap().as_str().parse().unwrap_or(0.0);
                    let m: f64 = caps.get(2).unwrap().as_str().parse().unwrap_or(0.0);
                    let s: f64 = caps.get(3).unwrap().as_str().parse().unwrap_or(0.0);
                    let ms: f64 = caps.get(4).unwrap().as_str().parse().unwrap_or(0.0);
                    
                    let current_seconds = h * 3600.0 + m * 60.0 + s + ms / 100.0;
                    let progress = if total_duration > 0.0 {
                        (current_seconds / total_duration * 100.0).min(99.9)
                    } else {
                        0.0
                    };

                    app.emit("conversion-progress", ProgressPayload {
                        id: id.clone(),
                        progress,
                        status: format!("正在处理... ({:.1}%)", progress),
                    }).unwrap();
                }
            } else if let CommandEvent::Terminated(payload) = event {
                let (status, progress) = if payload.code == Some(0) {
                    ("Completed", 100.0)
                } else {
                    ("Failed", 0.0)
                };
                app.emit("conversion-progress", ProgressPayload {
                    id: id.clone(),
                    progress,
                    status: status.to_string(),
                }).unwrap();
                break;
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn convert_image(
    input_path: String,
    output_path: String,
) -> Result<(), String> {
    let img = image::open(&input_path).map_err(|e| e.to_string())?;
    img.save(&output_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn scan_directory(path: String, mode: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let mut stack = vec![std::path::PathBuf::from(path)];

    let target_exts = if mode == "video" { VIDEO_EXTENSIONS } else { IMAGE_EXTENSIONS };

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
