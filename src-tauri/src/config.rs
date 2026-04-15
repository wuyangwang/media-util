use serde::{Deserialize, Serialize};

pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "mov", "webm"];
pub const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "tiff", "jfif"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum Preset {
    #[serde(rename = "720p")]
    P720,
    #[serde(rename = "1080p")]
    P1080,
    #[serde(rename = "2k")]
    P2K,
}

pub struct PresetParams {
    pub width: &'static str,
    pub height: &'static str,
    pub crf: u8,
}

impl Preset {
    pub fn get_params(&self) -> PresetParams {
        match self {
            Preset::P720 => PresetParams { width: "1280", height: "720", crf: 22 },
            Preset::P1080 => PresetParams { width: "1920", height: "1080", crf: 20 },
            Preset::P2K => PresetParams { width: "2560", height: "1440", crf: 18 },
        }
    }
}
