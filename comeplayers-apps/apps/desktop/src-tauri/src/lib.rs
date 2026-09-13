use std::process::Command;
use std::sync::Mutex;

use tauri::{Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

#[derive(Default)]
struct PendingDeepLinks(Mutex<Vec<String>>);

#[tauri::command]
fn take_pending_deep_links(state: State<'_, PendingDeepLinks>) -> Vec<String> {
    match state.0.lock() {
        Ok(mut urls) => std::mem::take(&mut *urls),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let allowed = url
        .parse::<tauri::Url>()
        .ok()
        .map(|parsed| {
            let production = parsed.scheme() == "https"
                && matches!(parsed.host_str(), Some("comeplayers.com" | "www.comeplayers.com"));
            #[cfg(debug_assertions)]
            let development = parsed.scheme() == "http"
                && matches!(parsed.host_str(), Some("localhost" | "127.0.0.1"));
            #[cfg(not(debug_assertions))]
            let development = false;
            production || development
        })
        .unwrap_or(false);
    if !allowed {
        return Err("External URLs are not allowed.".into());
    }

    #[cfg(target_os = "windows")]
    let result = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", &url])
        .spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&url).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(&url).spawn();

    result
        .map(|_| ())
        .map_err(|error| format!("Unable to open the browser: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(PendingDeepLinks::default())
        .plugin(tauri_plugin_deep_link::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .setup(|app| {
            if let Some(urls) = app.deep_link().get_current()? {
                let values = urls
                    .iter()
                    .map(|url| url.as_str().to_string())
                    .collect::<Vec<_>>();
                if let Ok(mut pending) = app.state::<PendingDeepLinks>().0.lock() {
                    pending.extend(values);
                }
            }

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let values = event
                    .urls()
                    .iter()
                    .map(|url| url.as_str().to_string())
                    .collect::<Vec<_>>();

                if let Ok(mut pending) = handle.state::<PendingDeepLinks>().0.lock() {
                    pending.extend(values.clone());
                }
                let _ = handle.emit("comeplayers-deep-link", values);

                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            });

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;

            Ok(())
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            take_pending_deep_links
        ])
        .run(tauri::generate_context!())
        .expect("error while running ComePlayers");
}
