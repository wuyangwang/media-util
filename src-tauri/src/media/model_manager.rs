use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};

const MODEL_DOWNLOAD_EVENT: &str = "model-download-progress";
const MODELS_ROOT_DIR: &str = "models/transcription";
const READY_MARKER_FILE: &str = ".ready";

#[derive(Debug, Clone, Copy)]
pub enum TranscriptionModelId {
    WhisperMedium,
    WhisperLarge,
    SenseVoice,
}

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionModelStatus {
    pub id: String,
    pub label: String,
    pub downloaded: bool,
    pub status: String,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ModelDownloadProgressPayload {
    model_id: String,
    progress: f64,
    status: String,
    message: Option<String>,
}

#[derive(Debug, Clone)]
struct ModelMeta {
    id: TranscriptionModelId,
    id_str: &'static str,
    label: &'static str,
    url: &'static str,
    kind: ModelKind,
}

#[derive(Debug, Clone, Copy)]
enum ModelKind {
    SingleFile { filename: &'static str },
    TarGzDir,
}

impl TranscriptionModelId {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "whisper-medium" => Ok(Self::WhisperMedium),
            "whisper-large" => Ok(Self::WhisperLarge),
            "sense-voice" => Ok(Self::SenseVoice),
            _ => Err(format!("Unsupported model id: {value}")),
        }
    }
}

fn all_models() -> [ModelMeta; 3] {
    [
        ModelMeta {
            id: TranscriptionModelId::WhisperMedium,
            id_str: "whisper-medium",
            label: "Whisper Medium",
            url: "https://blob.handy.computer/whisper-medium-q4_1.bin",
            kind: ModelKind::SingleFile {
                filename: "whisper-medium-q4_1.bin",
            },
        },
        ModelMeta {
            id: TranscriptionModelId::WhisperLarge,
            id_str: "whisper-large",
            label: "Whisper Large",
            url: "https://blob.handy.computer/ggml-large-v3-q5_0.bin",
            kind: ModelKind::SingleFile {
                filename: "ggml-large-v3-q5_0.bin",
            },
        },
        ModelMeta {
            id: TranscriptionModelId::SenseVoice,
            id_str: "sense-voice",
            label: "SenseVoice",
            url: "https://blob.handy.computer/sense-voice-int8.tar.gz",
            kind: ModelKind::TarGzDir,
        },
    ]
}

fn model_meta(model_id: TranscriptionModelId) -> ModelMeta {
    all_models()
        .into_iter()
        .find(|m| std::mem::discriminant(&m.id) == std::mem::discriminant(&model_id))
        .expect("known model")
}

fn models_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .resolve(MODELS_ROOT_DIR, BaseDirectory::AppData)
        .map_err(|e: tauri::Error| e.to_string())?;

    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    Ok(dir)
}

fn model_dir(app: &AppHandle, model_id: TranscriptionModelId) -> Result<PathBuf, String> {
    Ok(models_root(app)?.join(model_meta(model_id).id_str))
}

fn marker_path(dir: &Path) -> PathBuf {
    dir.join(READY_MARKER_FILE)
}

fn downloaded_path(app: &AppHandle, meta: &ModelMeta) -> Result<PathBuf, String> {
    let model_path = model_dir(app, meta.id)?;
    match meta.kind {
        ModelKind::SingleFile { filename } => Ok(model_path.join(filename)),
        ModelKind::TarGzDir => Ok(model_path),
    }
}

fn is_model_ready(app: &AppHandle, meta: &ModelMeta) -> Result<bool, String> {
    let target = downloaded_path(app, meta)?;
    match meta.kind {
        ModelKind::SingleFile { .. } => Ok(target.is_file()),
        ModelKind::TarGzDir => Ok(target.is_dir() && marker_path(&target).is_file()),
    }
}

pub fn get_model_path_if_ready(
    app: &AppHandle,
    model_id: TranscriptionModelId,
) -> Result<PathBuf, String> {
    let meta = model_meta(model_id);
    if !is_model_ready(app, &meta)? {
        return Err(format!("Model {} is not downloaded yet", meta.id_str));
    }

    downloaded_path(app, &meta)
}

fn emit_download_event(
    app: &AppHandle,
    model_id: &str,
    progress: f64,
    status: &str,
    message: Option<String>,
) {
    let _ = app.emit(
        MODEL_DOWNLOAD_EVENT,
        ModelDownloadProgressPayload {
            model_id: model_id.to_string(),
            progress,
            status: status.to_string(),
            message,
        },
    );
}

fn download_to_file(
    app: &AppHandle,
    model_id: &str,
    url: &str,
    target_file: &Path,
) -> Result<(), String> {
    let tmp_file = target_file.with_extension("download");
    let parent = target_file
        .parent()
        .ok_or("Invalid model target path")?
        .to_path_buf();

    fs::create_dir_all(&parent).map_err(|e| e.to_string())?;

    emit_download_event(
        app,
        model_id,
        0.0,
        "downloading",
        Some("Starting download".to_string()),
    );

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
            let progress = (downloaded as f64 / total as f64 * 100.0).min(99.9);
            emit_download_event(app, model_id, progress, "downloading", None);
        }
    }

    file.flush().map_err(|e| e.to_string())?;
    fs::rename(&tmp_file, target_file).map_err(|e| e.to_string())?;

    emit_download_event(
        app,
        model_id,
        100.0,
        "downloaded",
        Some("Download completed".to_string()),
    );
    Ok(())
}

fn extract_tar_gz(archive_path: &Path, output_dir: &Path) -> Result<(), String> {
    if output_dir.exists() {
        fs::remove_dir_all(output_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(output_dir).map_err(|e| e.to_string())?;

    let tar_gz = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let decoder = flate2::read::GzDecoder::new(tar_gz);
    let mut archive = tar::Archive::new(decoder);
    archive.unpack(output_dir).map_err(|e| e.to_string())?;

    fs::write(marker_path(output_dir), b"ok").map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_model_statuses(app: &AppHandle) -> Result<Vec<TranscriptionModelStatus>, String> {
    let mut result = Vec::new();

    for meta in all_models() {
        let ready = is_model_ready(app, &meta)?;
        let path = downloaded_path(app, &meta)?;

        result.push(TranscriptionModelStatus {
            id: meta.id_str.to_string(),
            label: meta.label.to_string(),
            downloaded: ready,
            status: if ready {
                "ready".to_string()
            } else {
                "missing".to_string()
            },
            path: path.to_str().map(|v| v.to_string()),
        });
    }

    Ok(result)
}

pub async fn download_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let id = TranscriptionModelId::parse(&model_id)?;
    let meta = model_meta(id);

    if is_model_ready(&app, &meta)? {
        emit_download_event(
            &app,
            meta.id_str,
            100.0,
            "ready",
            Some("Model already exists".to_string()),
        );
        return Ok(());
    }

    match meta.kind {
        ModelKind::SingleFile { filename } => {
            let target = model_dir(&app, id)?.join(filename);
            download_to_file(&app, meta.id_str, meta.url, &target)?;
        }
        ModelKind::TarGzDir => {
            let dir = model_dir(&app, id)?;
            let archive_path = dir.with_extension("tar.gz");

            download_to_file(&app, meta.id_str, meta.url, &archive_path)?;
            emit_download_event(
                &app,
                meta.id_str,
                99.0,
                "extracting",
                Some("Extracting model archive".to_string()),
            );
            extract_tar_gz(&archive_path, &dir)?;
            let _ = fs::remove_file(&archive_path);
            emit_download_event(
                &app,
                meta.id_str,
                100.0,
                "ready",
                Some("Model ready".to_string()),
            );
        }
    }

    Ok(())
}
