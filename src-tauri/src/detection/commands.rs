use crate::detection::processor::{DetectionProcessor, DetectionProgress};
use tauri::path::BaseDirectory;
use tauri::{command, AppHandle, Emitter, Manager};

#[command]
pub async fn detect_objects(
    app: AppHandle,
    id: String,
    input_path: String,
    is_video: bool,
) -> Result<String, String> {
    let model_path = app
        .path()
        .resolve("resources/models/yolo11s.onnx", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    let font_path = app
        .path()
        .resolve(
            "resources/fonts/NotoSerifSC-Medium.ttf",
            BaseDirectory::Resource,
        )
        .map_err(|e| e.to_string())?;

    let font_data = std::fs::read(font_path).map_err(|e| format!("Failed to read font: {}", e))?;

    // Create a unique output directory for this task
    let now = chrono::Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
    let output_dir = app
        .path()
        .resolve(
            format!("media-detection/{}", timestamp),
            BaseDirectory::Document,
        )
        .map_err(|e| e.to_string())?;

    if !output_dir.exists() {
        std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    }

    let output_dir_str = output_dir.to_string_lossy().to_string();
    let processor = DetectionProcessor::new(app.clone());

    if is_video {
        // Run video detection in background
        let app_clone = app.clone();
        let id_clone = id.clone();
        tokio::spawn(async move {
            let res = processor
                .process_video(
                    id_clone.clone(),
                    input_path,
                    output_dir_str,
                    model_path,
                    font_data,
                )
                .await;
            if let Err(e) = res {
                // Emit failure
                let _ = app_clone.emit(
                    "detection-progress",
                    DetectionProgress {
                        id: id_clone,
                        progress: 0.0,
                        status: format!("Error: {}", e),
                        result_path: None,
                    },
                );
            }
        });
        Ok(output_dir.to_string_lossy().to_string())
    } else {
        let result_path = processor
            .process_image(id, input_path, output_dir_str, model_path, font_data)
            .await?;
        Ok(result_path)
    }
}
