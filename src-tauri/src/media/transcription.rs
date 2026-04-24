use crate::config::AUDIO_EXTENSIONS;
use crate::media::model_manager::{self, TranscriptionModelId};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;

const TRANSCRIBE_PROGRESS_EVENT: &str = "transcription-progress";

#[derive(Clone, Serialize)]
struct TranscriptionProgressPayload {
    id: String,
    progress: f64,
    status: String,
    output_path: Option<String>,
    log: Option<String>,
}

fn emit_progress(
    app: &AppHandle,
    id: &str,
    progress: f64,
    status: &str,
    output_path: Option<String>,
    log: Option<String>,
) {
    let _ = app.emit(
        TRANSCRIBE_PROGRESS_EVENT,
        TranscriptionProgressPayload {
            id: id.to_string(),
            progress,
            status: status.to_string(),
            output_path,
            log,
        },
    );
}

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn ensure_temp_wav_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .resolve("transcription/temp", BaseDirectory::AppCache)
        .map_err(|e: tauri::Error| e.to_string())?;

    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    Ok(dir)
}

async fn normalize_audio_to_wav(
    app: &AppHandle,
    input_path: &str,
    temp_wav: &Path,
) -> Result<(), String> {
    let temp_wav_str = temp_wav
        .to_str()
        .ok_or("Invalid temporary wav path")?
        .to_string();

    let mut args = vec!["-i", input_path];

    // Video path includes video stream; audio path uses the same normalization.
    if !is_audio_file(Path::new(input_path)) {
        args.push("-vn");
    }

    args.extend([
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-y",
        &temp_wav_str,
    ]);

    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Failed to normalize audio: {err}"));
    }

    Ok(())
}

fn resolve_sense_voice_model_dir(path: PathBuf) -> Result<PathBuf, String> {
    if !path.is_dir() {
        return Err("SenseVoice model directory not found".to_string());
    }

    let sub_dirs: Vec<PathBuf> = fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|entry| entry.path())
        .filter(|entry| entry.is_dir())
        .collect();

    if sub_dirs.len() == 1 {
        Ok(sub_dirs[0].clone())
    } else {
        Ok(path)
    }
}

fn run_transcription(
    model_id: TranscriptionModelId,
    model_path: PathBuf,
    wav_path: PathBuf,
    language: Option<String>,
) -> Result<String, String> {
    let samples = transcribe_rs::audio::read_wav_samples(&wav_path).map_err(|e| e.to_string())?;

    match model_id {
        TranscriptionModelId::WhisperMedium | TranscriptionModelId::WhisperLarge => {
            use transcribe_rs::whisper_cpp::{WhisperEngine, WhisperInferenceParams};

            let mut model = WhisperEngine::load(&model_path).map_err(|e| e.to_string())?;
            let result = model
                .transcribe_with(
                    &samples,
                    &WhisperInferenceParams {
                        language,
                        ..Default::default()
                    },
                )
                .map_err(|e| e.to_string())?;
            Ok(result.text)
        }
        TranscriptionModelId::SenseVoice => {
            use transcribe_rs::onnx::sense_voice::SenseVoiceModel;
            use transcribe_rs::onnx::sense_voice::SenseVoiceParams;
            use transcribe_rs::onnx::Quantization;

            let sense_model_dir = resolve_sense_voice_model_dir(model_path)?;
            let mut model = SenseVoiceModel::load(&sense_model_dir, &Quantization::Int8)
                .map_err(|e| e.to_string())?;
            let result = model
                .transcribe_with(
                    &samples,
                    &SenseVoiceParams {
                        language,
                        ..Default::default()
                    },
                )
                .map_err(|e| e.to_string())?;
            Ok(result.text)
        }
    }
}

pub async fn transcribe_media(
    app: AppHandle,
    id: String,
    input_path: String,
    output_path: String,
    model_id: String,
    language: Option<String>,
) -> Result<(), String> {
    let parsed_model = TranscriptionModelId::parse(&model_id)?;

    emit_progress(&app, &id, 5.0, "preparing", None, None);

    let model_path = model_manager::get_model_path_if_ready(&app, parsed_model)?;

    let temp_dir = ensure_temp_wav_dir(&app)?;
    let temp_wav = temp_dir.join(format!(
        "{}_{}.wav",
        id,
        chrono::Utc::now().timestamp_millis()
    ));

    emit_progress(&app, &id, 25.0, "normalizing_audio", None, None);
    normalize_audio_to_wav(&app, &input_path, &temp_wav).await?;

    emit_progress(&app, &id, 60.0, "transcribing", None, None);

    let wav_for_task = temp_wav.clone();
    let model_for_task = model_path.clone();
    let text = tauri::async_runtime::spawn_blocking(move || {
        run_transcription(parsed_model, model_for_task, wav_for_task, language)
    })
    .await
    .map_err(|e| e.to_string())??;

    if let Some(parent) = Path::new(&output_path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&output_path, text).map_err(|e| e.to_string())?;

    let _ = fs::remove_file(&temp_wav);

    emit_progress(&app, &id, 100.0, "completed", Some(output_path), None);

    Ok(())
}
