use crate::config::{Preset, VIDEO_EXTENSIONS, IMAGE_EXTENSIONS, IMAGE_SIZE_PRESETS, AppConfig};
use serde::{Deserialize, Serialize};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use regex::Regex;
use tauri::{AppHandle, Emitter, Manager};
use std::path::Path;
use base64::{Engine as _, engine::general_purpose};
use std::io::Write;
use std::fs::File;
use image::GenericImageView;
use chrono;

#[tauri::command]
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

    let input_ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    let ext = match extension.as_deref() {
        Some("original") | None => input_ext,
        Some(e) => e.to_string(),
    };

    let now = chrono::Utc::now();
    let timestamp = now.timestamp_millis().to_string();

    let output_dir = parent.join("media-convert");
    if !output_dir.exists() {
        std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    }

    let new_filename = format!("{}_{}_{}.{}", stem, operation, timestamp, ext);
    let output_path = output_dir.join(new_filename);

    Ok(output_path.to_str().ok_or("Invalid output path")?.to_string())
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    id: String,
    progress: f64,
    status: String,
    output_info: Option<MediaInfo>, // 任务完成后返回新文件信息
    log: Option<String>,           // 用于存储错误详情或日志
}

use serde_json::Value;

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

#[tauri::command]
pub async fn open_devtools(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
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
        // If image crate fails (e.g. HEIC), fall through to ffprobe
    }

    let shell = app.shell();
    let output = shell
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
pub async fn get_video_thumbnail(app: AppHandle, path: String) -> Result<String, String> {
    let output = app.shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args([
            "-ss", "00:00:01",
            "-i", &path,
            "-vframes", "1",
            "-f", "image2",
            "-s", "320x180", // 缩放为预览图大小
            "pipe:1",
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(output.stdout)))
    } else {
        Err("Failed to extract thumbnail".to_string())
    }
}

use tokio::sync::{Semaphore, RwLock};
use std::sync::Arc;

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

#[tauri::command]
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

#[tauri::command]
pub async fn update_concurrency(queue: tauri::State<'_, AppQueue>, limit: usize) -> Result<(), String> {
    queue.update_limit(limit).await;
    Ok(())
}

#[tauri::command]
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
            "-y",
            &output_path,
        ])
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

                    app.emit("conversion-progress", ProgressPayload {
                        id: id.clone(),
                        progress,
                        status: format!("正在处理... ({:.1}%)", progress),
                        output_info: None,
                        log: None,
                    }).unwrap();
                }
            }
            CommandEvent::Terminated(payload) => {
                let (status, progress) = if payload.code == Some(0) {
                    ("Completed", 100.0)
                } else {
                    ("Failed", 0.0)
                };
                
                let mut output_info = None;
                if status == "Completed" {
                    if let Ok(info) = get_media_info(app.clone(), output_path_clone.clone()).await {
                        output_info = Some(info);
                    }
                }

                app.emit("conversion-progress", ProgressPayload {
                    id: id.clone(),
                    progress,
                    status: status.to_string(),
                    output_info,
                    log: if status == "Failed" { Some(accumulated_log) } else { None },
                }).unwrap();
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

async fn load_image(app: &AppHandle, path: &str) -> Result<image::DynamicImage, String> {
    // Try image crate first
    if let Ok(img) = image::open(path) {
        return Ok(img);
    }

    // Fallback to ffmpeg for HEIC/HEIF or other formats image crate doesn't support
    let output = app.shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args([
            "-i", path,
            "-f", "image2pipe",
            "-vcodec", "png",
            "pipe:1",
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        image::load_from_memory(&output.stdout).map_err(|e| e.to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to load image via FFmpeg: {}", stderr))
    }
}

fn save_image_with_quality(img: &image::DynamicImage, output_path: &str, quality: u8) -> Result<(), String> {
    let path = Path::new(output_path);
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let file = File::create(path).map_err(|e| e.to_string())?;
    let mut writer = std::io::BufWriter::new(file);

    match ext.as_str() {
        "jpg" | "jpeg" => {
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, quality);
            img.write_with_encoder(encoder).map_err(|e| e.to_string())?;
        }
        "webp" => {
            // Use write_to which supports WebP
            img.write_to(&mut writer, image::ImageFormat::WebP).map_err(|e| e.to_string())?;
        }
        "png" => {
            img.write_to(&mut writer, image::ImageFormat::Png).map_err(|e| e.to_string())?;
        }
        _ => {
            img.save(output_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn convert_image(
    app: AppHandle,
    input_path: String,
    output_path: String,
    quality: u8,
) -> Result<(), String> {
    let img = load_image(&app, &input_path).await?;
    save_image_with_quality(&img, &output_path, quality)?;
    Ok(())
}

// 图像处理参数
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageProcessParams {
    pub mode: String,      // "fixed", "ratio", "custom"
    pub width: u32,
    pub height: u32,
    pub preset_index: Option<usize>,  // 预设尺寸索引
    pub quality: u8,
}

// 固定尺寸裁剪
#[tauri::command]
pub async fn crop_image_fixed(
    app: AppHandle,
    input_path: String,
    output_path: String,
    preset_index: usize,
    quality: u8,
) -> Result<(), String> {
    if preset_index >= IMAGE_SIZE_PRESETS.len() {
        return Err("Invalid preset index".to_string());
    }
    
    let preset = &IMAGE_SIZE_PRESETS[preset_index];
    let target_width = preset.width;
    let target_height = preset.height;
    
    let img = load_image(&app, &input_path).await?;

    if target_width == 0 || target_height == 0 {
        // Original size
        save_image_with_quality(&img, &output_path, quality)?;
        return Ok(());
    }

    let (img_width, img_height) = img.dimensions();
    
    // 计算缩放比例，使图片至少达到目标尺寸
    let scale_w = target_width as f64 / img_width as f64;
    let scale_h = target_height as f64 / img_height as f64;
    let scale = scale_w.max(scale_h);
    
    // 缩放图片
    let new_width = (img_width as f64 * scale).round() as u32;
    let new_height = (img_height as f64 * scale).round() as u32;
    let resized = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);
    
    // 居中裁剪
    let x = (new_width - target_width) / 2;
    let y = (new_height - target_height) / 2;
    let cropped = resized.crop_imm(x, y, target_width, target_height);
    
    save_image_with_quality(&cropped, &output_path, quality)?;
    Ok(())
}

// 按比例裁剪（居中）
#[tauri::command]
pub async fn crop_image_ratio(
    app: AppHandle,
    input_path: String,
    output_path: String,
    target_width: u32,
    target_height: u32,
    quality: u8,
) -> Result<(), String> {
    if target_width == 0 || target_height == 0 {
        return Err("Invalid target dimensions".to_string());
    }
    
    let target_ratio = target_width as f64 / target_height as f64;
    
    let img = load_image(&app, &input_path).await?;
    let (img_width, img_height) = img.dimensions();
    let img_ratio = img_width as f64 / img_height as f64;
    
    // 计算裁剪区域
    let (crop_width, crop_height) = if img_ratio > target_ratio {
        // 图片更宽，按高度裁剪
        let w = (img_height as f64 * target_ratio).round() as u32;
        (w, img_height)
    } else {
        // 图片更高，按宽度裁剪
        let h = (img_width as f64 / target_ratio).round() as u32;
        (img_width, h)
    };
    
    // 居中裁剪
    let x = (img_width - crop_width) / 2;
    let y = (img_height - crop_height) / 2;
    let cropped = img.crop_imm(x, y, crop_width, crop_height);
    
    // 缩放到目标尺寸
    let resized = cropped.resize(target_width, target_height, image::imageops::FilterType::Lanczos3);
    save_image_with_quality(&resized, &output_path, quality)?;
    Ok(())
}

// 自定义尺寸裁剪
#[tauri::command]
pub async fn crop_image_custom(
    app: AppHandle,
    input_path: String,
    output_path: String,
    target_width: u32,
    target_height: u32,
    quality: u8,
) -> Result<(), String> {
    let img = load_image(&app, &input_path).await?;

    if target_width == 0 || target_height == 0 {
        save_image_with_quality(&img, &output_path, quality)?;
        return Ok(());
    }
    
    let (img_width, img_height) = img.dimensions();
    
    // 计算缩放比例
    let scale_w = target_width as f64 / img_width as f64;
    let scale_h = target_height as f64 / img_height as f64;
    let scale = scale_w.max(scale_h);
    
    // 缩放图片
    let new_width = (img_width as f64 * scale).round() as u32;
    let new_height = (img_height as f64 * scale).round() as u32;
    let resized = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);
    
    // 居中裁剪
    let x = (new_width - target_width) / 2;
    let y = (new_height - target_height) / 2;
    let cropped = resized.crop_imm(x, y, target_width, target_height);
    
    save_image_with_quality(&cropped, &output_path, quality)?;
    Ok(())
}

// 批量打包为 ZIP
#[tauri::command]
pub fn batch_to_zip(
    file_paths: Vec<String>,
    output_zip_path: String,
) -> Result<(), String> {
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
        let file_name = path.file_name()
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

// 获取应用配置
#[tauri::command]
pub fn get_app_config() -> Result<AppConfig, String> {
    Ok(AppConfig::get_config())
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
