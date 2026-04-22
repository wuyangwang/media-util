use crate::config::Preset;
use log::{error, info};
use regex::Regex;
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use tokio::sync::{RwLock, Semaphore};

use super::shared::{get_media_info, MediaInfo};

#[derive(Clone, Serialize)]
struct ProgressPayload {
    id: String,
    progress: f64,
    status: String,
    output_info: Option<MediaInfo>,
    log: Option<String>,
}

pub async fn get_video_thumbnail(app: AppHandle, path: String) -> Result<String, String> {
    let cache_dir = app
        .path()
        .resolve("thumbnails", BaseDirectory::AppCache)
        .map_err(|e: tauri::Error| e.to_string())?;

    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    let hash = hasher.finish();

    let thumb_path = cache_dir.join(format!("{:x}.jpg", hash));
    let thumb_path_str = thumb_path.to_str().ok_or("Invalid thumb path")?.to_string();

    if thumb_path.exists() {
        return Ok(thumb_path_str);
    }

    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args([
            "-ss",
            "00:00:01",
            "-i",
            &path,
            "-vframes",
            "1",
            "-f",
            "image2",
            "-s",
            "320x180",
            "-y",
            &thumb_path_str,
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(thumb_path_str)
    } else {
        Err("Failed to extract thumbnail to disk".to_string())
    }
}

pub struct AppQueue {
    pub semaphore: Arc<RwLock<Semaphore>>,
}

impl AppQueue {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            semaphore: Arc::new(RwLock::new(Semaphore::new(max_concurrent))),
        }
    }

    pub async fn update_limit(&self, new_limit: usize) {
        *self.semaphore.write().await = Semaphore::new(new_limit);
    }
}

pub async fn convert_video_queued(
    app: AppHandle,
    queue: tauri::State<'_, AppQueue>,
    id: String,
    input_path: String,
    output_path: String,
    preset: Preset,
) -> Result<(), String> {
    let semaphore = queue.semaphore.read().await;
    let permit = semaphore.acquire().await.map_err(|e| e.to_string())?;
    let result = convert_video(app, id, input_path, output_path, preset).await;
    drop(permit);
    result
}

pub async fn update_concurrency(
    queue: tauri::State<'_, AppQueue>,
    limit: usize,
) -> Result<(), String> {
    queue.update_limit(limit).await;
    Ok(())
}

pub async fn convert_video(
    app: AppHandle,
    id: String,
    input_path: String,
    output_path: String,
    preset: Preset,
) -> Result<(), String> {
    let media_info = get_media_info(app.clone(), input_path.clone()).await?;
    let total_duration = media_info.duration;

    let params = preset.get_params();
    let mut args = vec!["-i".to_string(), input_path.clone()];
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let worker_threads = if threads > 1 { threads - 1 } else { 1 };
    args.push("-threads".to_string());
    args.push(worker_threads.to_string());

    if params.vcodec == "none" {
        args.push("-vn".to_string());
    } else {
        if let (Some(w), Some(h)) = (params.width, params.height) {
            args.push("-vf".to_string());
            args.push(format!("scale={}:{},fps=30", w, h));
        }
        args.push("-c:v".to_string());
        args.push(params.vcodec.to_string());
        if params.crf > 0 {
            args.push("-crf".to_string());
            args.push(params.crf.to_string());
        }
    }

    args.push("-c:a".to_string());
    args.push(params.acodec.to_string());

    for extra in params.extra_args {
        args.push(extra.to_string());
    }

    args.push("-y".to_string());
    args.push(output_path.clone());

    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;

    let (mut rx, _child) = output;
    let re = Regex::new(r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})").unwrap();
    let output_path_clone = output_path.clone();
    let mut accumulated_log = String::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line).to_string();
                accumulated_log.push_str(&line_str);

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

                    app.emit(
                        "conversion-progress",
                        ProgressPayload {
                            id: id.clone(),
                            progress,
                            status: format!("正在处理... ({progress:.1}%)"),
                            output_info: None,
                            log: None,
                        },
                    )
                    .unwrap();
                }
            }
            CommandEvent::Terminated(payload) => {
                let (status, progress) = if payload.code == Some(0) {
                    info!("Video conversion completed successfully [ID: {}]", id);
                    ("Completed", 100.0)
                } else {
                    error!(
                        "Video conversion failed [ID: {}]. Output path: {}",
                        id, output_path_clone
                    );
                    ("Failed", 0.0)
                };

                let mut output_info = None;
                if status == "Completed" {
                    if let Ok(info) = get_media_info(app.clone(), output_path_clone.clone()).await {
                        output_info = Some(info);
                    }
                }

                app.emit(
                    "conversion-progress",
                    ProgressPayload {
                        id: id.clone(),
                        progress,
                        status: status.to_string(),
                        output_info,
                        log: if status == "Failed" {
                            Some(accumulated_log)
                        } else {
                            None
                        },
                    },
                )
                .unwrap();
                break;
            }
            _ => {}
        }
    }

    Ok(())
}
