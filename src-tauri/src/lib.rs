mod media;
pub mod config;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(media::AppQueue::new(2)) // 默认 2 个并发任务
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            media::convert_video,
            media::convert_video_queued,
            media::update_concurrency,
            media::get_video_thumbnail,
            media::convert_image,
            media::get_media_info,
            media::open_devtools,
            media::scan_directory,
            media::crop_image_fixed,
            media::crop_image_ratio,
            media::crop_image_custom,
            media::batch_to_zip,
            media::get_app_config,
            media::get_formatted_output_path
        ])
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let about_i = MenuItem::with_id(app, "about", "关于", true, None::<&str>)?;
            let open_i = MenuItem::with_id(app, "open", "打开", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&about_i, &open_i, &settings_i, &quit_i])?;

            let _tray = TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "about" => {
                        let _ = app
                            .opener()
                            .open_url("https://github.com/wuyangwang/media-util", None);
                    }
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                            let _ = app.emit("navigate", "/settings");
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
