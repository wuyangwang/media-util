use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};

const DETECTION_ROOT_DIR: &str = "resources";
const MODEL_DOWNLOAD_EVENT: &str = "model-download-progress";

// Detection Resource Constants
pub const YOLO_RESOURCE_ID: &str = "yolo-resources";
pub const YOLO_MODEL_URL: &str =
    "https://www.modelscope.cn/models/wuyangwang/yolo11s/resolve/master/yolo11s.onnx";
pub const YOLO_MODEL_FILENAME: &str = "yolo11s.onnx";
pub const YOLO_MODEL_SUBDIR: &str = "models";

pub const NOTO_FONT_URL: &str =
    "https://www.modelscope.cn/models/wuyangwang/yolo11s/resolve/master/NotoSerifSC-Medium.ttf";
pub const NOTO_FONT_FILENAME: &str = "NotoSerifSC-Medium.ttf";
pub const NOTO_FONT_SUBDIR: &str = "fonts";

#[derive(Debug, Clone, Serialize)]
pub struct ResourceStatus {
    pub id: String,
    pub label: String,
    pub downloaded: bool,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
struct DownloadProgressPayload {
    model_id: String,
    progress: f64,
    status: String,
    message: Option<String>,
}

pub fn resources_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .resolve(DETECTION_ROOT_DIR, BaseDirectory::AppLocalData)
        .map_err(|e: tauri::Error| e.to_string())?;

    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    Ok(dir)
}

pub fn get_yolo_model_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resources_root(app)?
        .join(YOLO_MODEL_SUBDIR)
        .join(YOLO_MODEL_FILENAME))
}

pub fn get_noto_font_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resources_root(app)?
        .join(NOTO_FONT_SUBDIR)
        .join(NOTO_FONT_FILENAME))
}

pub fn is_ready(app: &AppHandle) -> bool {
    let yolo = get_yolo_model_path(app)
        .map(|p| p.is_file())
        .unwrap_or(false);
    let font = get_noto_font_path(app)
        .map(|p| p.is_file())
        .unwrap_or(false);
    yolo && font
}

fn emit_progress(app: &AppHandle, progress: f64, status: &str, message: Option<String>) {
    let _ = app.emit(
        MODEL_DOWNLOAD_EVENT,
        DownloadProgressPayload {
            model_id: YOLO_RESOURCE_ID.to_string(),
            progress,
            status: status.to_string(),
            message,
        },
    );
}

fn download_file(
    app: &AppHandle,
    url: &str,
    target: &Path,
    base_progress: f64,
    weight: f64,
) -> Result<(), String> {
    let tmp_file = target.with_extension("download");
    let parent = target.parent().ok_or("Invalid path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let response = ureq::get(url).call().map_err(|e| e.to_string())?;
    let total = response
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);

    let mut reader = response.into_body().into_reader();
    let mut file = fs::File::create(&tmp_file).map_err(|e| e.to_string())?;
    let mut downloaded = 0_u64;
    let mut buf = [0_u8; 64 * 1024];

    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;

        if total > 0 {
            let file_progress = downloaded as f64 / total as f64;
            let total_progress = base_progress + (file_progress * weight);
            emit_progress(app, total_progress * 100.0, "downloading", None);
        }
    }

    file.flush().map_err(|e| e.to_string())?;
    fs::rename(&tmp_file, target).map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn download_resources(app: AppHandle) -> Result<(), String> {
    if is_ready(&app) {
        emit_progress(&app, 100.0, "ready", Some("Resources ready".to_string()));
        return Ok(());
    }

    emit_progress(
        &app,
        0.0,
        "downloading",
        Some("Starting download...".to_string()),
    );

    // Download Model (80% weight)
    let yolo_path = get_yolo_model_path(&app)?;
    download_file(&app, YOLO_MODEL_URL, &yolo_path, 0.0, 0.8)?;

    // Download Font (20% weight)
    let font_path = get_noto_font_path(&app)?;
    download_file(&app, NOTO_FONT_URL, &font_path, 0.8, 0.2)?;

    emit_progress(
        &app,
        100.0,
        "ready",
        Some("Resources downloaded successfully".to_string()),
    );
    Ok(())
}

pub fn get_status(app: &AppHandle) -> ResourceStatus {
    let ready = is_ready(app);
    ResourceStatus {
        id: YOLO_RESOURCE_ID.to_string(),
        label: "目标检测资源 (模型+字体)".to_string(),
        downloaded: ready,
        status: if ready {
            "ready".to_string()
        } else {
            "missing".to_string()
        },
    }
}
