use crate::config::{AppConfig, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs::File;
use std::io::Write;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::StoreExt;

const SYSTEM_INFO_STORE_PATH: &str = "settings.json";
const SYSTEM_INFO_STATIC_STORE_KEY: &str = "systemInfoStatic";

pub fn get_formatted_output_path(
    input_path: String,
    operation: String,
    extension: Option<String>,
) -> Result<String, String> {
    let path = Path::new(&input_path);
    let parent = path.parent().ok_or("Invalid input path")?;
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid filename")?;

    let input_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    let ext = match extension.as_deref() {
        Some("original") | None => input_ext,
        Some(e) => e.to_string(),
    };

    let timestamp = chrono::Utc::now().timestamp_millis().to_string();
    let output_dir = parent.join("media-convert");
    if !output_dir.exists() {
        std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    }

    let new_filename = format!("{}_{}_{}.{}", stem, operation, timestamp, ext);
    let output_path = output_dir.join(new_filename);

    Ok(output_path
        .to_str()
        .ok_or("Invalid output path")?
        .to_string())
}

#[derive(Serialize, Clone, Debug)]
pub struct MediaInfo {
    pub format: String,
    pub size: u64,
    pub duration: f64,
    pub video: Option<VideoInfo>,
}

#[derive(Serialize, Clone, Debug)]
pub struct VideoInfo {
    pub width: i32,
    pub height: i32,
    pub codec: String,
    pub fps: String,
    pub bitrate: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemInfo {
    pub os_type: String,
    pub os_version: String,
    pub arch: String,
    pub host: String,
    pub total_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub total_disk_bytes: u64,
    pub available_disk_bytes: u64,
    pub cpu_model: String,
    pub cpu_cores: usize,
    pub gpu_model: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct StaticSystemInfo {
    os_type: String,
    os_version: String,
    arch: String,
    host: String,
    cpu_model: String,
    cpu_cores: usize,
    gpu_model: String,
}

pub async fn open_devtools(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

pub async fn get_media_info(app: AppHandle, path: String) -> Result<MediaInfo, String> {
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let size = metadata.len();

    let ext = Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        if let Ok(img) = image::image_dimensions(&path) {
            return Ok(MediaInfo {
                format: ext,
                size,
                duration: 0.0,
                video: Some(VideoInfo {
                    width: img.0 as i32,
                    height: img.1 as i32,
                    codec: "image".to_string(),
                    fps: "0".to_string(),
                    bitrate: None,
                }),
            });
        }
    }

    let output_result = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| e.to_string())?
        .args([
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            &path,
        ])
        .output()
        .await;

    let mut duration = 0.0;
    let mut video = None;

    if let Ok(output) = output_result {
        if let Ok(json) = serde_json::from_slice::<Value>(&output.stdout) {
            duration = json["format"]["duration"]
                .as_str()
                .unwrap_or("0")
                .parse::<f64>()
                .unwrap_or(0.0);

            let video_stream = json["streams"]
                .as_array()
                .and_then(|streams| streams.iter().find(|s| s["codec_type"] == "video"));

            video = video_stream.map(|s| {
                let fps_raw = s["avg_frame_rate"].as_str().unwrap_or("0");
                let fps = if fps_raw.contains('/') {
                    let parts: Vec<&str> = fps_raw.split('/').collect();
                    if parts.len() == 2 {
                        let num: f64 = parts[0].parse().unwrap_or(0.0);
                        let den: f64 = parts[1].parse().unwrap_or(1.0);
                        if den > 0.0 {
                            (num / den).to_string()
                        } else {
                            num.to_string()
                        }
                    } else {
                        fps_raw.to_string()
                    }
                } else {
                    fps_raw.to_string()
                };

                VideoInfo {
                    width: s["width"].as_i64().unwrap_or(0) as i32,
                    height: s["height"].as_i64().unwrap_or(0) as i32,
                    codec: s["codec_name"].as_str().unwrap_or("unknown").to_string(),
                    fps,
                    bitrate: s["bit_rate"].as_str().map(|v| v.to_string()),
                }
            });
        }
    }

    Ok(MediaInfo {
        format: ext,
        size,
        duration,
        video,
    })
}

pub fn get_app_config() -> Result<AppConfig, String> {
    Ok(AppConfig::get_config())
}

pub fn get_system_info(app: AppHandle) -> Result<SystemInfo, String> {
    let (total_memory_bytes, available_memory_bytes) = get_memory_info();
    let (total_disk_bytes, available_disk_bytes) = get_disk_info();
    let static_info = load_cached_static_system_info(&app)?.unwrap_or_else(|| {
        let static_info = build_static_system_info();
        let _ = save_cached_static_system_info(&app, &static_info);
        static_info
    });

    Ok(SystemInfo {
        os_type: static_info.os_type,
        os_version: static_info.os_version,
        arch: static_info.arch,
        host: static_info.host,
        total_memory_bytes,
        available_memory_bytes,
        total_disk_bytes,
        available_disk_bytes,
        cpu_model: static_info.cpu_model,
        cpu_cores: static_info.cpu_cores,
        gpu_model: static_info.gpu_model,
    })
}

fn build_static_system_info() -> StaticSystemInfo {
    let os_type = env::consts::OS.to_string();
    let arch = env::consts::ARCH.to_string();
    let os_version = get_os_version();
    let host = get_hostname();
    let (cpu_model, cpu_cores) = get_cpu_info();
    let gpu_model = get_gpu_info();

    StaticSystemInfo {
        os_type: title_case(&os_type),
        os_version,
        arch,
        host,
        cpu_model,
        cpu_cores,
        gpu_model,
    }
}

fn load_cached_static_system_info(app: &AppHandle) -> Result<Option<StaticSystemInfo>, String> {
    let store = app
        .store(SYSTEM_INFO_STORE_PATH)
        .map_err(|e| e.to_string())?;

    store
        .get(SYSTEM_INFO_STATIC_STORE_KEY)
        .map(|value| serde_json::from_value(value).map_err(|e| e.to_string()))
        .transpose()
}

fn save_cached_static_system_info(
    app: &AppHandle,
    static_info: &StaticSystemInfo,
) -> Result<(), String> {
    let store = app
        .store(SYSTEM_INFO_STORE_PATH)
        .map_err(|e| e.to_string())?;

    store.set(
        SYSTEM_INFO_STATIC_STORE_KEY,
        serde_json::to_value(static_info).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

pub async fn scan_directory(path: String, mode: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let mut stack = vec![std::path::PathBuf::from(path)];
    let target_exts = if mode == "video" {
        VIDEO_EXTENSIONS
    } else {
        IMAGE_EXTENSIONS
    };

    while let Some(current_path) = stack.pop() {
        if current_path.is_dir() {
            if let Ok(entries) = std::fs::read_dir(current_path) {
                for entry in entries.flatten() {
                    stack.push(entry.path());
                }
            }
        } else if current_path.is_file() {
            if let Some(ext) = current_path.extension().and_then(|e| e.to_str()) {
                if target_exts.contains(&ext.to_lowercase().as_str()) {
                    if let Some(path_str) = current_path.to_str() {
                        files.push(path_str.to_string());
                    }
                }
            }
        }
    }

    Ok(files)
}

pub fn batch_to_zip(file_paths: Vec<String>, output_zip_path: String) -> Result<(), String> {
    if file_paths.is_empty() {
        return Err("No files to zip".to_string());
    }

    let zip_file = File::create(&output_zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(zip_file);

    let options = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    for file_path in file_paths {
        let path = Path::new(&file_path);
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("Invalid file name: {}", file_path))?;

        zip.start_file(file_name, options)
            .map_err(|e| format!("Failed to add file to zip: {}", e))?;

        let file_content = std::fs::read(&file_path)
            .map_err(|e| format!("Failed to read file {}: {}", file_path, e))?;

        zip.write_all(&file_content)
            .map_err(|e| format!("Failed to write file to zip: {}", e))?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finish zip file: {}", e))?;

    Ok(())
}

fn title_case(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => "Unknown".to_string(),
    }
}

fn read_command_output(program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    command.args(args);

    #[cfg(target_os = "windows")]
    {
        // Prevent flashing/visible console windows when invoking shell tools.
        command.creation_flags(0x08000000);
    }

    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8(output.stdout).ok()?;
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_first_u64(value: &str) -> Option<u64> {
    let digits: String = value.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

fn get_os_version() -> String {
    #[cfg(target_os = "windows")]
    {
        return read_command_output(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_OperatingSystem).Version",
            ],
        )
        .unwrap_or_else(|| "Unknown".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        return read_command_output("sw_vers", &["-productVersion"])
            .unwrap_or_else(|| "Unknown".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(value) = read_command_output("uname", &["-r"]) {
            return value;
        }
    }

    "Unknown".to_string()
}

fn get_hostname() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(value) = env::var("COMPUTERNAME") {
            if !value.trim().is_empty() {
                return value;
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(value) = env::var("HOSTNAME") {
            if !value.trim().is_empty() {
                return value;
            }
        }
    }

    read_command_output("hostname", &[]).unwrap_or_else(|| "Unknown".to_string())
}

fn get_memory_info() -> (u64, u64) {
    #[cfg(target_os = "windows")]
    {
        let total = read_command_output(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
            ],
        )
        .and_then(|value| parse_first_u64(&value))
        .unwrap_or(0);

        let available_kb = read_command_output(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory",
            ],
        )
        .and_then(|value| parse_first_u64(&value))
        .unwrap_or(0);

        return (total, available_kb.saturating_mul(1024));
    }

    #[cfg(target_os = "macos")]
    {
        let total = read_command_output("sysctl", &["-n", "hw.memsize"])
            .and_then(|value| parse_first_u64(&value))
            .unwrap_or(0);

        let page_size = read_command_output("sysctl", &["-n", "hw.pagesize"])
            .and_then(|value| parse_first_u64(&value))
            .unwrap_or(4096);

        let free_pages = read_command_output("vm_stat", &[])
            .and_then(|output| {
                output
                    .lines()
                    .find(|line| line.starts_with("Pages free"))
                    .and_then(parse_first_u64)
            })
            .unwrap_or(0);

        return (total, free_pages.saturating_mul(page_size));
    }

    #[cfg(target_os = "linux")]
    {
        let meminfo = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
        let total_kb = meminfo
            .lines()
            .find(|line| line.starts_with("MemTotal:"))
            .and_then(parse_first_u64)
            .unwrap_or(0);
        let available_kb = meminfo
            .lines()
            .find(|line| line.starts_with("MemAvailable:"))
            .and_then(parse_first_u64)
            .unwrap_or(0);

        return (
            total_kb.saturating_mul(1024),
            available_kb.saturating_mul(1024),
        );
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    (0, 0)
}

fn get_cpu_info() -> (String, usize) {
    #[cfg(target_os = "windows")]
    {
        let cpu_model = read_command_output(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)",
            ],
        )
        .unwrap_or_else(|| "Unknown".to_string());

        let cpu_cores = read_command_output(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors",
            ],
        )
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or_else(|| {
            std::thread::available_parallelism()
                .map(usize::from)
                .unwrap_or(0)
        });

        return (cpu_model, cpu_cores);
    }

    #[cfg(target_os = "macos")]
    {
        let cpu_model = read_command_output("sysctl", &["-n", "machdep.cpu.brand_string"])
            .or_else(|| read_command_output("sysctl", &["-n", "machdep.cpu.brand_string"]))
            .unwrap_or_else(|| "Apple Silicon".to_string());

        let cpu_cores = read_command_output("sysctl", &["-n", "hw.logicalcpu"])
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or_else(|| {
                std::thread::available_parallelism()
                    .map(usize::from)
                    .unwrap_or(0)
            });

        return (cpu_model, cpu_cores);
    }

    #[cfg(target_os = "linux")]
    {
        let cpuinfo = std::fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
        let cpu_model = cpuinfo
            .lines()
            .find_map(|line| line.strip_prefix("model name\t: "))
            .map(ToString::to_string)
            .unwrap_or_else(|| "Unknown".to_string());

        let cpu_cores = std::thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(0);

        return (cpu_model, cpu_cores);
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    (
        "Unknown".to_string(),
        std::thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(0),
    )
}

fn get_disk_info() -> (u64, u64) {
    #[cfg(target_os = "windows")]
    {
        let total = read_command_output(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Measure-Object -Property Size -Sum).Sum",
            ],
        )
        .and_then(|value| parse_first_u64(&value))
        .unwrap_or(0);

        let available = read_command_output(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Measure-Object -Property FreeSpace -Sum).Sum",
            ],
        )
        .and_then(|value| parse_first_u64(&value))
        .unwrap_or(0);

        return (total, available);
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(output) = read_command_output("df", &["-k", "/"]) {
            if let Some(line) = output.lines().nth(1) {
                let cols: Vec<&str> = line.split_whitespace().collect();
                if cols.len() >= 4 {
                    let total_kb = cols[1].parse::<u64>().unwrap_or(0);
                    let avail_kb = cols[3].parse::<u64>().unwrap_or(0);
                    return (total_kb.saturating_mul(1024), avail_kb.saturating_mul(1024));
                }
            }
        }

        return (0, 0);
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(output) = read_command_output("df", &["-k", "/"]) {
            if let Some(line) = output.lines().nth(1) {
                let cols: Vec<&str> = line.split_whitespace().collect();
                if cols.len() >= 4 {
                    let total_kb = cols[1].parse::<u64>().unwrap_or(0);
                    let avail_kb = cols[3].parse::<u64>().unwrap_or(0);
                    return (total_kb.saturating_mul(1024), avail_kb.saturating_mul(1024));
                }
            }
        }

        return (0, 0);
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    (0, 0)
}

fn get_gpu_info() -> String {
    #[cfg(target_os = "windows")]
    {
        return read_command_output(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)",
            ],
        )
        .unwrap_or_else(|| "Unknown".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(output) = read_command_output("system_profiler", &["SPDisplaysDataType"]) {
            if let Some(name) = output
                .lines()
                .find_map(|line| line.trim().strip_prefix("Chipset Model: "))
            {
                return name.to_string();
            }
        }

        return "Unknown".to_string();
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(output) = read_command_output("lspci", &[]) {
            if let Some(name) = output.lines().find_map(|line| {
                if line.contains("VGA compatible controller")
                    || line.contains("3D controller")
                    || line.contains("Display controller")
                {
                    line.split(": ").nth(2).map(ToString::to_string)
                } else {
                    None
                }
            }) {
                return name;
            }
        }

        return "Unknown".to_string();
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    "Unknown".to_string()
}
