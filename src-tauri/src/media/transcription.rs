use crate::config::AUDIO_EXTENSIONS;
use crate::media::model_manager::{self, TranscriptionModelId};
use crate::runtime;
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

    let mut args = vec![
        "-threads".to_string(),
        runtime::worker_threads_reserve_one_core().to_string(),
        "-i".to_string(),
        input_path.to_string(),
    ];

    // Video path includes video stream; audio path uses the same normalization.
    if !is_audio_file(Path::new(input_path)) {
        args.push("-vn".to_string());
    }

    args.extend([
        "-ac".to_string(),
        "1".to_string(),
        "-ar".to_string(),
        "16000".to_string(),
        "-c:a".to_string(),
        "pcm_s16le".to_string(),
        "-y".to_string(),
        temp_wav_str,
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

fn format_timestamp(seconds: f64) -> String {
    let hours = (seconds / 3600.0).floor() as u32;
    let minutes = ((seconds % 3600.0) / 60.0).floor() as u32;
    let secs = (seconds % 60.0).floor() as u32;
    format!("{:02}:{:02}:{:02}", hours, minutes, secs)
}

fn format_srt_time(seconds: f64) -> String {
    let millis = (seconds.fract() * 1000.0).round() as u32;
    let total_seconds = seconds.floor() as u32;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let secs = total_seconds % 60;
    format!("{:02}:{:02}:{:02},{:03}", hours, minutes, secs, millis)
}

#[derive(Serialize)]
pub struct TranscriptionOutput {
    pub timestamped: String,
    pub plain: String,
    pub srt: String,
}

fn run_transcription(
    model_id: TranscriptionModelId,
    model_path: PathBuf,
    wav_path: PathBuf,
    language: Option<String>,
    translate_to_english: bool,
) -> Result<TranscriptionOutput, String> {
    let samples = transcribe_rs::audio::read_wav_samples(&wav_path).map_err(|e| e.to_string())?;

    let result = match model_id {
        TranscriptionModelId::WhisperMedium | TranscriptionModelId::WhisperLarge => {
            use transcribe_rs::whisper_cpp::{WhisperEngine, WhisperInferenceParams};

            #[cfg(windows)]
            {
                transcribe_rs::set_whisper_accelerator(transcribe_rs::WhisperAccelerator::Auto);
            }

            let initial_prompt = if !translate_to_english {
                Some("优先转写为简体中文".to_string())
            } else {
                None
            };

            let mut model = WhisperEngine::load(&model_path).map_err(|e| e.to_string())?;
            model
                .transcribe_with(
                    &samples,
                    &WhisperInferenceParams {
                        language,
                        translate: translate_to_english,
                        initial_prompt,
                        ..Default::default()
                    },
                )
                .map_err(|e| e.to_string())?
        }
        TranscriptionModelId::SenseVoice
        | TranscriptionModelId::SenseVoiceInt8
        | TranscriptionModelId::FunAsrNanoInt8 => {
            use transcribe_rs::onnx::sense_voice::SenseVoiceModel;
            use transcribe_rs::onnx::sense_voice::SenseVoiceParams;
            use transcribe_rs::onnx::Quantization;

            #[cfg(windows)]
            {
                transcribe_rs::set_ort_accelerator(transcribe_rs::OrtAccelerator::DirectMl);
            }

            let quant = match model_id {
                TranscriptionModelId::SenseVoiceInt8 | TranscriptionModelId::FunAsrNanoInt8 => {
                    Quantization::Int8
                }
                _ => Quantization::FP32,
            };

            let sense_model_dir = resolve_sense_voice_model_dir(model_path)?;
            let mut model =
                SenseVoiceModel::load(&sense_model_dir, &quant).map_err(|e| e.to_string())?;
            model
                .transcribe_with(
                    &samples,
                    &SenseVoiceParams {
                        language,
                        ..Default::default()
                    },
                )
                .map_err(|e| e.to_string())?
        }
    };

    struct MergedSegment {
        text: String,
        start: f32,
        end: f32,
    }

    let mut merged_segments: Vec<MergedSegment> = Vec::new();
    let mut current_buffer: Option<MergedSegment> = None;
    let sentence_punc = ['。', '？', '！', '；', '!', '?', ';'];

    for segment in result.segments.into_iter().flatten() {
        let text = segment.text.trim();
        if text.is_empty() {
            continue;
        }

        if let Some(mut buffer) = current_buffer.take() {
            let gap = segment.start - buffer.end;
            let ends_with_punc = sentence_punc.iter().any(|&p| buffer.text.ends_with(p));
            let too_long = buffer.text.chars().count() > 50;

            if gap < 0.8 && !ends_with_punc && !too_long {
                if !buffer.text.is_empty()
                    && !text.starts_with(|c: char| "，。！？；：,.!?;:".contains(c))
                {
                    if let (Some(last_char), Some(first_char)) =
                        (buffer.text.chars().last(), text.chars().next())
                    {
                        if last_char.is_ascii_alphanumeric() && first_char.is_ascii_alphanumeric() {
                            buffer.text.push(' ');
                        }
                    }
                }
                buffer.text.push_str(text);
                buffer.end = segment.end;
                current_buffer = Some(buffer);
            } else {
                merged_segments.push(buffer);
                current_buffer = Some(MergedSegment {
                    text: text.to_string(),
                    start: segment.start,
                    end: segment.end,
                });
            }
        } else {
            current_buffer = Some(MergedSegment {
                text: text.to_string(),
                start: segment.start,
                end: segment.end,
            });
        }
    }

    if let Some(buffer) = current_buffer {
        merged_segments.push(buffer);
    }

    let mut timestamped = String::new();
    let mut srt = String::new();
    let mut plain = String::new();
    let mut last_end = 0.0;
    let mut segment_count = 1;

    for segment in merged_segments {
        // Timestamped version logic
        if !timestamped.is_empty() && segment.start - last_end > 3.0 {
            timestamped.push_str("\n\n");
        } else if !timestamped.is_empty() {
            timestamped.push('\n');
        }
        timestamped.push_str(&format!(
            "[{}] {}",
            format_timestamp(segment.start as f64),
            segment.text
        ));

        // SRT version logic
        srt.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            segment_count,
            format_srt_time(segment.start as f64),
            format_srt_time(segment.end as f64),
            segment.text
        ));
        segment_count += 1;

        // Plain version: just collect text with newlines
        if !plain.is_empty() {
            plain.push('\n');
        }
        plain.push_str(&segment.text);

        last_end = segment.end;
    }

    if timestamped.is_empty() {
        Ok(TranscriptionOutput {
            timestamped: result.text.clone(),
            plain: result.text.clone(),
            srt: format!("1\n00:00:00,000 --> 00:00:10,000\n{}\n\n", result.text),
        })
    } else {
        Ok(TranscriptionOutput {
            timestamped,
            plain: plain.trim().to_string(),
            srt,
        })
    }
}

pub async fn transcribe_media(
    app: AppHandle,
    id: String,
    input_path: String,
    output_path: String,
    model_id: String,
    language: Option<String>,
    translate_to_english: bool,
) -> Result<TranscriptionOutput, String> {
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
    let output = tauri::async_runtime::spawn_blocking(move || {
        run_transcription(
            parsed_model,
            model_for_task,
            wav_for_task,
            language,
            translate_to_english,
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    if let Some(parent) = Path::new(&output_path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    // Default save plain text to file (as it's cleaner)
    fs::write(&output_path, &output.plain).map_err(|e| e.to_string())?;

    // Also save a timestamped version next to it
    let timestamped_path = format!("{}.timestamped.txt", output_path);
    fs::write(timestamped_path, &output.timestamped).map_err(|e| e.to_string())?;

    // Save SRT version
    let srt_path = format!("{}.srt", output_path);
    fs::write(srt_path, &output.srt).map_err(|e| e.to_string())?;

    let _ = fs::remove_file(&temp_wav);

    emit_progress(&app, &id, 100.0, "completed", Some(output_path), None);

    Ok(output)
}
