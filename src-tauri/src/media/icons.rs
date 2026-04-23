use crate::media::image::load_image;
use icns::{IconFamily, Image as IcnsImage, PixelFormat};
use image::codecs::ico::{IcoEncoder, IcoFrame};
use image::ExtendedColorType;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const WINDOWS_ICON_SIZES: [u32; 5] = [16, 32, 48, 128, 256];
const MACOS_ICON_SIZES: [u32; 7] = [16, 32, 64, 128, 256, 512, 1024];
const IOS_ICON_SIZES: [u32; 13] = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

pub async fn generate_app_icons(
    app: AppHandle,
    input_path: String,
    output_zip_path: String,
    platforms: Vec<String>,
) -> Result<(), String> {
    if platforms.is_empty() {
        return Err("At least one platform must be selected".to_string());
    }

    let image = load_image(&app, &input_path).await?;
    let source_name = Path::new(&input_path)
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("icon");
    let temp_root = build_temp_root(source_name)?;

    for platform in platforms {
        match platform.as_str() {
            "Windows" => write_windows_icons(&image, &temp_root)?,
            "macOS" => write_macos_icns(&image, &temp_root.join("macos"))?,
            "Android" => write_android_icons(&image, &temp_root.join("android"))?,
            "iOS" => write_png_set(&image, &temp_root.join("ios"), "icon", &IOS_ICON_SIZES)?,
            _ => return Err(format!("Unsupported platform: {platform}")),
        }
    }

    zip_directory(&temp_root, Path::new(&output_zip_path))?;
    fs::remove_dir_all(&temp_root).map_err(|err| err.to_string())?;

    Ok(())
}

fn build_temp_root(source_name: &str) -> Result<PathBuf, String> {
    let timestamp = chrono::Utc::now().timestamp_millis();
    let dir = std::env::temp_dir().join(format!("media-util-icons-{source_name}-{timestamp}"));
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn crop_square(img: &image::DynamicImage) -> image::DynamicImage {
    let size = img.width().min(img.height());
    let x = (img.width() - size) / 2;
    let y = (img.height() - size) / 2;
    img.crop_imm(x, y, size, size)
}

fn resize_icon(img: &image::DynamicImage, size: u32) -> image::DynamicImage {
    crop_square(img).resize_to_fill(size, size, image::imageops::FilterType::Lanczos3)
}

fn write_png(img: &image::DynamicImage, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    img.save(path).map_err(|err| err.to_string())
}

fn write_windows_icons(img: &image::DynamicImage, temp_root: &Path) -> Result<(), String> {
    let windows_dir = temp_root.join("windows");
    fs::create_dir_all(&windows_dir).map_err(|err| err.to_string())?;

    let mut frames = Vec::new();
    for size in WINDOWS_ICON_SIZES {
        let resized = resize_icon(img, size);
        let png_path = windows_dir.join(format!("icon_{size}x{size}.png"));
        write_png(&resized, &png_path)?;

        let rgba = resized.to_rgba8();
        let frame = IcoFrame::as_png(rgba.as_raw(), size, size, ExtendedColorType::Rgba8)
            .map_err(|err| err.to_string())?;
        frames.push(frame);
    }

    let ico_path = windows_dir.join("icon.ico");
    let writer = BufWriter::new(File::create(&ico_path).map_err(|err| err.to_string())?);
    IcoEncoder::new(writer)
        .encode_images(&frames)
        .map_err(|err| err.to_string())
}

fn write_png_set(
    img: &image::DynamicImage,
    output_dir: &Path,
    prefix: &str,
    sizes: &[u32],
) -> Result<(), String> {
    fs::create_dir_all(output_dir).map_err(|err| err.to_string())?;
    for size in sizes {
        let resized = resize_icon(img, *size);
        let file_path = output_dir.join(format!("{prefix}_{size}x{size}.png"));
        write_png(&resized, &file_path)?;
    }
    Ok(())
}

fn write_macos_icns(img: &image::DynamicImage, output_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(output_dir).map_err(|err| err.to_string())?;
    let mut family = IconFamily::new();

    for size in MACOS_ICON_SIZES {
        let resized = resize_icon(img, size);
        let rgba = resized.to_rgba8();
        let icon = IcnsImage::from_data(PixelFormat::RGBA, size, size, rgba.into_raw())
            .map_err(|err| err.to_string())?;
        family.add_icon(&icon).map_err(|err| err.to_string())?;
    }

    let icns_path = output_dir.join("icon.icns");
    let writer = BufWriter::new(File::create(&icns_path).map_err(|err| err.to_string())?);
    family.write(writer).map_err(|err| err.to_string())
}

fn write_android_icons(img: &image::DynamicImage, output_dir: &Path) -> Result<(), String> {
    const MAP: [(&str, u32); 5] = [
        ("mipmap-mdpi", 48),
        ("mipmap-hdpi", 72),
        ("mipmap-xhdpi", 96),
        ("mipmap-xxhdpi", 144),
        ("mipmap-xxxhdpi", 192),
    ];

    fs::create_dir_all(output_dir).map_err(|err| err.to_string())?;
    for (name, size) in MAP {
        let resized = resize_icon(img, size);
        let file_path = output_dir.join(format!("{name}.png"));
        write_png(&resized, &file_path)?;
    }
    Ok(())
}

fn zip_directory(source_dir: &Path, output_zip_path: &Path) -> Result<(), String> {
    if let Some(parent) = output_zip_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let zip_file = File::create(output_zip_path).map_err(|err| err.to_string())?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    let mut stack = vec![source_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).map_err(|err| err.to_string())? {
            let entry = entry.map_err(|err| err.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            let relative = path
                .strip_prefix(source_dir)
                .map_err(|err| err.to_string())?;
            let name = relative
                .to_str()
                .ok_or("Invalid icon archive path")?
                .replace('\\', "/");
            let bytes = fs::read(&path).map_err(|err| err.to_string())?;

            zip.start_file(name, options)
                .map_err(|err| format!("Failed to add file to zip: {err}"))?;
            zip.write_all(&bytes)
                .map_err(|err| format!("Failed to write file to zip: {err}"))?;
        }
    }

    zip.finish()
        .map_err(|err| format!("Failed to finish zip file: {err}"))?;
    Ok(())
}
