use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use regex::Regex;
use tauri::{AppHandle, Emitter};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum Preset {
    #[serde(rename = "720p")]
    P720,
    #[serde(rename = "1080p")]
    P1080,
    #[serde(rename = "2k")]
    P2K,
}

impl Preset {
    fn get_params(&self) -> (&str, &str, u8) {
        match self {
            Preset::P720 => ("1280", "720", 22),
            Preset::P1080 => ("1920", "1080", 20),
            Preset::P2K => ("2560", "1440", 18),
        }
    }
}

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

    if ["jpg", "jpeg", "png", "webp", "bmp"].contains(&ext.as_str()) {
        let img = image::image_dimensions(&path).map_err(|e| e.to_string())?;
        return Ok(MediaInfo {
            format: ext,
            size,
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
    let (width, height, crf) = preset.get_params();
    let scale_vf = format!("scale={}:{}", width, height);

    let shell = app.shell();
    let output = shell
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args([
            "-i", &input_path,
            "-vf", &format!("{},fps=30", scale_vf),
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", &crf.to_string(),
            "-y", // Overwrite output
            &output_path,
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    let (mut rx, _child) = output;

    let re = Regex::new(r"time=(\d{2}:\d{2}:\d{2}\.\d{2})").unwrap();
    
    // In a real app, we'd first get the total duration using ffprobe
    // For this example, we'll emit the raw time string or a placeholder progress
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stderr(line) = event {
                let line_str = String::from_utf8_lossy(&line);
                if let Some(caps) = re.captures(&line_str) {
                    let time_str = caps.get(1).map_or("", |m| m.as_str());
                    app.emit("conversion-progress", ProgressPayload {
                        id: id.clone(),
                        progress: 0.0, // Placeholder: calculating percentage requires duration
                        status: format!("Processing: {}", time_str),
                    }).unwrap();
                }
            } else if let CommandEvent::Terminated(payload) = event {
                let status = if payload.code == Some(0) {
                    "Completed"
                } else {
                    "Failed"
                };
                app.emit("conversion-progress", ProgressPayload {
                    id: id.clone(),
                    progress: 100.0,
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
