use crate::config::IMAGE_SIZE_PRESETS;
use crate::runtime;
use image::GenericImageView;
use std::fs::File;
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

pub(super) async fn load_image(app: &AppHandle, path: &str) -> Result<image::DynamicImage, String> {
    if let Ok(img) = image::open(path) {
        return Ok(img);
    }

    let args = vec![
        "-threads".to_string(),
        runtime::worker_threads_reserve_one_core().to_string(),
        "-i".to_string(),
        path.to_string(),
        "-f".to_string(),
        "image2pipe".to_string(),
        "-vcodec".to_string(),
        "png".to_string(),
        "pipe:1".to_string(),
    ];

    let output = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        image::load_from_memory(&output.stdout).map_err(|e| e.to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to load image via FFmpeg: {stderr}"))
    }
}

fn save_image_with_quality(
    img: &image::DynamicImage,
    output_path: &str,
    quality: u8,
) -> Result<(), String> {
    let path = Path::new(output_path);
    let ext = path
        .extension()
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
            img.write_to(&mut writer, image::ImageFormat::WebP)
                .map_err(|e| e.to_string())?;
        }
        "png" => {
            let encoder = image::codecs::png::PngEncoder::new_with_quality(
                &mut writer,
                image::codecs::png::CompressionType::Best,
                image::codecs::png::FilterType::Adaptive,
            );
            img.write_with_encoder(encoder).map_err(|e| e.to_string())?;
        }
        _ => {
            img.save(output_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn save_as_mozjpeg(
    img: &image::DynamicImage,
    output_path: &str,
    quality: u8,
) -> Result<(), String> {
    let rgb = img.to_rgb8();
    let mut compressor = mozjpeg::Compress::new(mozjpeg::ColorSpace::JCS_RGB);
    compressor.set_size(img.width() as usize, img.height() as usize);
    compressor.set_quality(quality as f32);
    let mut compressor = compressor
        .start_compress(Vec::new())
        .map_err(|e| format!("mozjpeg start failed: {e}"))?;
    compressor
        .write_scanlines(rgb.as_raw())
        .map_err(|e| format!("mozjpeg write failed: {e}"))?;
    let jpeg_data = compressor
        .finish()
        .map_err(|e| format!("mozjpeg finish failed: {e}"))?;
    std::fs::write(output_path, jpeg_data).map_err(|e| e.to_string())
}

fn run_oxipng_in_place(path: &str) -> Result<(), String> {
    let options = oxipng::Options::max_compression();
    let infile = oxipng::InFile::Path(path.into());
    let outfile = oxipng::OutFile::Path {
        path: Some(path.into()),
        preserve_attrs: true,
    };
    oxipng::optimize(&infile, &outfile, &options).map_err(|e| e.to_string())
}

fn save_pngquant_then_oxipng(
    img: &image::DynamicImage,
    output_path: &str,
    quality: u8,
) -> Result<(), String> {
    let rgba = img.to_rgba8();
    let mut attr = imagequant::new();
    attr.set_quality(0, quality)
        .map_err(|e| format!("pngquant quality failed: {e}"))?;
    let pixels: Vec<imagequant::RGBA> = rgba
        .pixels()
        .map(|p| imagequant::RGBA {
            r: p[0],
            g: p[1],
            b: p[2],
            a: p[3],
        })
        .collect();
    let mut quant_img = attr
        .new_image(pixels, img.width() as usize, img.height() as usize, 0.0)
        .map_err(|e| format!("pngquant image failed: {e}"))?;
    let mut res = attr
        .quantize(&mut quant_img)
        .map_err(|e| format!("pngquant quantize failed: {e}"))?;
    res.set_dithering_level(0.8)
        .map_err(|e| format!("pngquant dithering failed: {e}"))?;
    let (palette, pixels) = res
        .remapped(&mut quant_img)
        .map_err(|e| format!("pngquant remap failed: {e}"))?;

    let file = File::create(output_path).map_err(|e| e.to_string())?;
    let writer = std::io::BufWriter::new(file);
    let mut encoder = png::Encoder::new(writer, img.width(), img.height());
    encoder.set_color(png::ColorType::Indexed);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_palette(
        palette
            .iter()
            .flat_map(|p| [p.r, p.g, p.b])
            .collect::<Vec<u8>>(),
    );
    let transparency: Vec<u8> = palette.iter().map(|p| p.a).collect();
    if transparency.iter().any(|alpha| *alpha < u8::MAX) {
        encoder.set_trns(transparency);
    }
    let mut png_writer = encoder
        .write_header()
        .map_err(|e| format!("png write header failed: {e}"))?;
    png_writer
        .write_image_data(&pixels)
        .map_err(|e| format!("png write data failed: {e}"))?;
    png_writer
        .finish()
        .map_err(|e| format!("png finish failed: {e}"))?;

    run_oxipng_in_place(output_path)
}

fn save_compressed_image(
    img: &image::DynamicImage,
    output_path: &str,
    quality: u8,
    png_lossy: bool,
) -> Result<(), String> {
    let ext = Path::new(output_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "png" => {
            if png_lossy {
                save_pngquant_then_oxipng(img, output_path, quality)
            } else {
                save_image_with_quality(img, output_path, quality)?;
                run_oxipng_in_place(output_path)
            }
        }
        "jpg" | "jpeg" => save_as_mozjpeg(img, output_path, quality),
        _ => save_image_with_quality(img, output_path, quality),
    }
}

fn apply_fixed_preset_resize(
    img: &image::DynamicImage,
    preset_index: usize,
) -> Result<image::DynamicImage, String> {
    if preset_index >= IMAGE_SIZE_PRESETS.len() {
        return Err("Invalid preset index".to_string());
    }
    let preset = &IMAGE_SIZE_PRESETS[preset_index];
    if preset.width == 0 || preset.height == 0 {
        return Ok(img.clone());
    }

    let (img_width, img_height) = img.dimensions();
    let scale_w = preset.width as f64 / img_width as f64;
    let scale_h = preset.height as f64 / img_height as f64;
    let scale = scale_w.max(scale_h);
    let new_width = (img_width as f64 * scale).round() as u32;
    let new_height = (img_height as f64 * scale).round() as u32;
    let resized = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);
    let x = (new_width - preset.width) / 2;
    let y = (new_height - preset.height) / 2;
    Ok(resized.crop_imm(x, y, preset.width, preset.height))
}

fn apply_custom_resize(
    img: &image::DynamicImage,
    target_width: u32,
    target_height: u32,
) -> image::DynamicImage {
    if target_width == 0 || target_height == 0 {
        return img.clone();
    }
    let (img_width, img_height) = img.dimensions();
    let scale_w = target_width as f64 / img_width as f64;
    let scale_h = target_height as f64 / img_height as f64;
    let scale = scale_w.max(scale_h);
    let new_width = (img_width as f64 * scale).round() as u32;
    let new_height = (img_height as f64 * scale).round() as u32;
    let resized = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);
    let x = (new_width - target_width) / 2;
    let y = (new_height - target_height) / 2;
    resized.crop_imm(x, y, target_width, target_height)
}

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

pub async fn process_image_pipeline(
    app: AppHandle,
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
    let img = load_image(&app, &input_path).await?;
    let processed = if use_custom_size {
        apply_custom_resize(&img, target_width, target_height)
    } else {
        apply_fixed_preset_resize(&img, preset_index)?
    };

    if compress_enabled {
        save_compressed_image(&processed, &output_path, quality, png_lossy)?;
    } else {
        save_image_with_quality(&processed, &output_path, quality)?;
    }
    Ok(())
}

pub async fn crop_image_fixed(
    app: AppHandle,
    input_path: String,
    output_path: String,
    preset_index: usize,
    quality: u8,
) -> Result<(), String> {
    let img = load_image(&app, &input_path).await?;
    let cropped = apply_fixed_preset_resize(&img, preset_index)?;
    save_image_with_quality(&cropped, &output_path, quality)?;
    Ok(())
}

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

    let (crop_width, crop_height) = if img_ratio > target_ratio {
        let w = (img_height as f64 * target_ratio).round() as u32;
        (w, img_height)
    } else {
        let h = (img_width as f64 / target_ratio).round() as u32;
        (img_width, h)
    };

    let x = (img_width - crop_width) / 2;
    let y = (img_height - crop_height) / 2;
    let cropped = img.crop_imm(x, y, crop_width, crop_height);
    let resized = cropped.resize(
        target_width,
        target_height,
        image::imageops::FilterType::Lanczos3,
    );
    save_image_with_quality(&resized, &output_path, quality)?;
    Ok(())
}

pub async fn crop_image_custom(
    app: AppHandle,
    input_path: String,
    output_path: String,
    target_width: u32,
    target_height: u32,
    quality: u8,
) -> Result<(), String> {
    let img = load_image(&app, &input_path).await?;
    let cropped = apply_custom_resize(&img, target_width, target_height);
    save_image_with_quality(&cropped, &output_path, quality)?;
    Ok(())
}
