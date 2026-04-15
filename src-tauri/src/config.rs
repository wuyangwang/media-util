use serde::{Deserialize, Serialize};

pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "mov", "webm"];
pub const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "tiff", "jfif"];

// ============================================
// Image Crop Presets
// ============================================

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum CropMode {
    Fixed,    // 固定尺寸
    Ratio,    // 按比例
    Custom,   // 自定义
}

#[derive(Debug, Serialize, Clone)]
pub struct ImageSizePreset {
    pub name: &'static str,
    pub width: u32,
    pub height: u32,
    pub category: &'static str,
}

// 预设尺寸列表
pub const IMAGE_SIZE_PRESETS: &[ImageSizePreset] = &[
    // 证件照
    ImageSizePreset { name: "一寸", width: 295, height: 413, category: "证件照" },
    ImageSizePreset { name: "二寸", width: 413, height: 579, category: "证件照" },
    ImageSizePreset { name: "小二寸", width: 413, height: 531, category: "证件照" },
    ImageSizePreset { name: "小一寸", width: 260, height: 378, category: "证件照" },
    // 社交媒体
    ImageSizePreset { name: "微信公众号封面", width: 900, height: 383, category: "社交媒体" },
    ImageSizePreset { name: "微信公众号次图", width: 500, height: 500, category: "社交媒体" },
    ImageSizePreset { name: "小红书", width: 3000, height: 4000, category: "社交媒体" },
    ImageSizePreset { name: "朋友圈", width: 1080, height: 1080, category: "社交媒体" },
    ImageSizePreset { name: "抖音", width: 1080, height: 1920, category: "社交媒体" },
    ImageSizePreset { name: "微博", width: 1080, height: 1080, category: "社交媒体" },
    // 通用尺寸
    ImageSizePreset { name: "头像", width: 400, height: 400, category: "通用" },
    ImageSizePreset { name: "缩略图", width: 256, height: 256, category: "通用" },
    ImageSizePreset { name: "博客封面", width: 1200, height: 630, category: "通用" },
    ImageSizePreset { name: "电商主图", width: 800, height: 800, category: "通用" },
];

// 常用比例
pub const IMAGE_RATIO_PRESETS: &[(&str, f32)] = &[
    ("1:1 (正方形)", 1.0),
    ("16:9 (宽屏)", 16.0 / 9.0),
    ("9:16 (竖屏)", 9.0 / 16.0),
    ("4:3 (标准)", 4.0 / 3.0),
    ("3:4 (竖版)", 3.0 / 4.0),
    ("3:2 (照片)", 3.0 / 2.0),
    ("2:3 (竖版照片)", 2.0 / 3.0),
];

// 前端配置数据结构
#[derive(Debug, Serialize, Clone)]
pub struct AppConfig {
    pub video_extensions: Vec<&'static str>,
    pub image_extensions: Vec<&'static str>,
    pub video_presets: Vec<VideoPresetConfig>,
    pub image_formats: Vec<ImageFormatConfig>,
    pub crop_modes: Vec<CropModeConfig>,
    pub size_presets: Vec<ImageSizePreset>,
    pub ratio_presets: Vec<RatioPresetConfig>,
}

#[derive(Debug, Serialize, Clone)]
pub struct VideoPresetConfig {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ImageFormatConfig {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct CropModeConfig {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct RatioPresetConfig {
    pub label: String,
    pub ratio: f32,
}

impl AppConfig {
    pub fn get_config() -> Self {
        Self {
            video_extensions: VIDEO_EXTENSIONS.to_vec(),
            image_extensions: IMAGE_EXTENSIONS.to_vec(),
            video_presets: vec![
                VideoPresetConfig { value: "720p".to_string(), label: "720p (HD)".to_string() },
                VideoPresetConfig { value: "1080p".to_string(), label: "1080p (Full HD)".to_string() },
                VideoPresetConfig { value: "2k".to_string(), label: "2K (Quad HD)".to_string() },
            ],
            image_formats: vec![
                ImageFormatConfig { value: "png".to_string(), label: "PNG".to_string() },
                ImageFormatConfig { value: "jpg".to_string(), label: "JPEG (JPG)".to_string() },
                ImageFormatConfig { value: "webp".to_string(), label: "WebP".to_string() },
                ImageFormatConfig { value: "bmp".to_string(), label: "BMP".to_string() },
            ],
            crop_modes: vec![
                CropModeConfig { value: "fixed".to_string(), label: "固定尺寸".to_string() },
                CropModeConfig { value: "ratio".to_string(), label: "按比例".to_string() },
                CropModeConfig { value: "custom".to_string(), label: "自定义".to_string() },
            ],
            size_presets: IMAGE_SIZE_PRESETS.to_vec(),
            ratio_presets: IMAGE_RATIO_PRESETS.iter().map(|(label, ratio)| {
                RatioPresetConfig { label: label.to_string(), ratio: *ratio }
            }).collect(),
        }
    }
}

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
