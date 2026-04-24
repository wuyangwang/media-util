#[path = "media/icons.rs"]
mod icons;
#[path = "media/image.rs"]
mod image;
#[path = "media/model_manager.rs"]
mod model_manager;
#[path = "media/shared.rs"]
mod shared;
#[path = "media/transcription.rs"]
mod transcription;
#[path = "media/video.rs"]
mod video;

pub use crate::config::AppConfig;
pub use model_manager::TranscriptionModelStatus;
pub use shared::{MediaInfo, SystemInfo};
pub use video::AppQueue;

#[tauri::command]
pub fn get_formatted_output_path(
    input_path: String,
    operation: String,
    extension: Option<String>,
) -> Result<String, String> {
    shared::get_formatted_output_path(input_path, operation, extension)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    shared::read_text_file(path)
}

#[tauri::command]
pub fn get_transcription_output_dir(app: tauri::AppHandle) -> Result<String, String> {
    shared::get_transcription_output_dir(app)
}

#[tauri::command]
pub fn get_transcription_output_path(app: tauri::AppHandle) -> Result<String, String> {
    shared::get_transcription_output_path(app)
}

#[tauri::command]
pub async fn get_media_info(app: tauri::AppHandle, path: String) -> Result<MediaInfo, String> {
    shared::get_media_info(app, path).await
}

#[tauri::command]
pub async fn open_devtools(app: tauri::AppHandle) -> Result<(), String> {
    shared::open_devtools(app).await
}

#[tauri::command]
pub fn get_app_config() -> Result<AppConfig, String> {
    shared::get_app_config()
}

#[tauri::command]
pub fn get_system_info(app: tauri::AppHandle) -> Result<SystemInfo, String> {
    shared::get_system_info(app)
}

#[tauri::command]
pub async fn scan_directory(path: String, mode: String) -> Result<Vec<String>, String> {
    shared::scan_directory(path, mode).await
}

#[tauri::command]
pub async fn get_video_thumbnail(app: tauri::AppHandle, path: String) -> Result<String, String> {
    video::get_video_thumbnail(app, path).await
}

#[tauri::command]
pub async fn convert_video(
    app: tauri::AppHandle,
    id: String,
    input_path: String,
    output_path: String,
    preset: crate::config::Preset,
) -> Result<(), String> {
    video::convert_video(app, id, input_path, output_path, preset).await
}

#[tauri::command]
pub async fn convert_video_queued(
    app: tauri::AppHandle,
    queue: tauri::State<'_, AppQueue>,
    id: String,
    input_path: String,
    output_path: String,
    preset: crate::config::Preset,
) -> Result<(), String> {
    video::convert_video_queued(app, queue, id, input_path, output_path, preset).await
}

#[tauri::command]
pub async fn update_concurrency(
    queue: tauri::State<'_, AppQueue>,
    limit: usize,
) -> Result<(), String> {
    video::update_concurrency(queue, limit).await
}

#[tauri::command]
pub async fn convert_image(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    quality: u8,
) -> Result<(), String> {
    image::convert_image(app, input_path, output_path, quality).await
}

#[tauri::command]
pub async fn process_image_pipeline(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    preset_index: usize,
    use_custom_size: bool,
    target_width: u32,
    target_height: u32,
    compress_enabled: bool,
    quality: u8,
    png_lossy: bool,
) -> Result<(), String> {
    image::process_image_pipeline(
        app,
        input_path,
        output_path,
        preset_index,
        use_custom_size,
        target_width,
        target_height,
        compress_enabled,
        quality,
        png_lossy,
    )
    .await
}

#[tauri::command]
pub async fn generate_app_icons(
    app: tauri::AppHandle,
    input_path: String,
    output_zip_path: String,
    platforms: Vec<String>,
) -> Result<(), String> {
    icons::generate_app_icons(app, input_path, output_zip_path, platforms).await
}

#[tauri::command]
pub async fn crop_image_fixed(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    preset_index: usize,
    quality: u8,
) -> Result<(), String> {
    image::crop_image_fixed(app, input_path, output_path, preset_index, quality).await
}

#[tauri::command]
pub async fn crop_image_ratio(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    target_width: u32,
    target_height: u32,
    quality: u8,
) -> Result<(), String> {
    image::crop_image_ratio(
        app,
        input_path,
        output_path,
        target_width,
        target_height,
        quality,
    )
    .await
}

#[tauri::command]
pub async fn crop_image_custom(
    app: tauri::AppHandle,
    input_path: String,
    output_path: String,
    target_width: u32,
    target_height: u32,
    quality: u8,
) -> Result<(), String> {
    image::crop_image_custom(
        app,
        input_path,
        output_path,
        target_width,
        target_height,
        quality,
    )
    .await
}

#[tauri::command]
pub fn batch_to_zip(file_paths: Vec<String>, output_zip_path: String) -> Result<(), String> {
    shared::batch_to_zip(file_paths, output_zip_path)
}

#[tauri::command]
pub fn get_transcription_models_status(
    app: tauri::AppHandle,
) -> Result<Vec<TranscriptionModelStatus>, String> {
    model_manager::list_model_statuses(&app)
}

#[tauri::command]
pub async fn download_transcription_model(
    app: tauri::AppHandle,
    model_id: String,
) -> Result<(), String> {
    model_manager::download_model(app, model_id).await
}

#[tauri::command]
pub async fn transcribe_media(
    app: tauri::AppHandle,
    id: String,
    input_path: String,
    output_path: String,
    model_id: String,
    language: Option<String>,
    translate_to_english: bool,
) -> Result<(), String> {
    transcription::transcribe_media(
        app,
        id,
        input_path,
        output_path,
        model_id,
        language,
        translate_to_english,
    )
    .await
}
