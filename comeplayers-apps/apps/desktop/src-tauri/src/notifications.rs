use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use windows::{
    core::HSTRING,
    Data::Xml::Dom::XmlDocument,
    Foundation::TypedEventHandler,
    UI::Notifications::{NotificationSetting, ToastNotification, ToastNotificationManager, ToastNotifier},
};

#[derive(Default)]
pub struct ActiveNotifications(Mutex<HashMap<String, ToastNotification>>);

fn app_user_model_id(app: &AppHandle) -> String {
    // Store MSIX packages have a different AUMID than the NSIS identifier.
    // Ask Windows for the actual packaged identity rather than guessing it.
    let mut length = 0u32;
    unsafe {
        windows_sys::Win32::Storage::Packaging::Appx::GetCurrentApplicationUserModelId(&mut length, std::ptr::null_mut());
    }
    if length > 0 && length < 1024 {
        let mut value = vec![0u16; length as usize];
        let result = unsafe {
            windows_sys::Win32::Storage::Packaging::Appx::GetCurrentApplicationUserModelId(&mut length, value.as_mut_ptr())
        };
        if result == 0 {
            return String::from_utf16_lossy(&value[..length.saturating_sub(1) as usize]);
        }
    }
    app.config().identifier.clone()
}

fn notifier(app: &AppHandle) -> Result<ToastNotifier, String> {
    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_user_model_id(app)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn notification_permission(app: AppHandle) -> Result<String, String> {
    let setting = notifier(&app)?.Setting().map_err(|error| error.to_string())?;
    Ok(if setting == NotificationSetting::Enabled { "granted" } else { "denied" }.into())
}

#[tauri::command]
pub fn request_notification_permission(app: AppHandle) -> Result<String, String> {
    // Windows controls permission in its notification settings; there is no
    // browser-style prompt. The website saves opt-in only after a user click.
    notification_permission(app)
}

fn xml_text(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
        .replace('"', "&quot;").replace('\'', "&apos;")
}

fn valid_text(value: &str, maximum: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= maximum &&
        !value.chars().any(|character| character.is_control())
}

fn notification_destination(href: &str) -> Option<tauri::Url> {
    if !href.starts_with('/') || href.starts_with("//") || href.contains('\\') || href.chars().any(|c| c.is_control()) || href.len() > 2048 {
        return None;
    }
    let url = tauri::Url::parse(&format!("https://www.comeplayers.com{href}")).ok()?;
    (url.scheme() == "https" && url.host_str() == Some("www.comeplayers.com") && url.username().is_empty() && url.password().is_none() && url.port().is_none()).then_some(url)
}

#[tauri::command]
pub fn show_comeplayers_notification(app: AppHandle, state: State<'_, ActiveNotifications>, title: String, body: String, tag: String, href: String) -> Result<(), String> {
    if !valid_text(&title, 120) || !valid_text(&body, 240) || !valid_text(&tag, 120) {
        return Err("Invalid notification content.".into());
    }
    let destination = notification_destination(&href).ok_or("Invalid notification destination.")?;
    if notification_permission(app.clone())? != "granted" {
        return Err("Windows notifications are disabled for ComePlayers.".into());
    }
    let xml = XmlDocument::new().map_err(|error| error.to_string())?;
    // Audio is owned by the shared message/ringtone lifecycle, so mute settings
    // and answering a call stop sound immediately without an extra OS chime.
    xml.LoadXml(&HSTRING::from(format!(
        "<toast duration=\"short\"><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual><audio silent=\"true\"/></toast>",
        xml_text(&title), xml_text(&body)
    ))).map_err(|error| error.to_string())?;
    let notification = ToastNotification::CreateToastNotification(&xml).map_err(|error| error.to_string())?;
    let handle = app.clone();
    notification.Activated(&TypedEventHandler::new(move |_, _| {
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus();
            let _ = window.navigate(destination.clone());
        }
        Ok(())
    })).map_err(|error| error.to_string())?;
    let notifier = notifier(&app)?;
    let mut active = state.0.lock().map_err(|_| "Notification state is unavailable.")?;
    if let Some(previous) = active.remove(&tag) { let _ = notifier.Hide(&previous); }
    if active.len() >= 32 {
        for (_, previous) in active.drain() { let _ = notifier.Hide(&previous); }
    }
    notifier.Show(&notification).map_err(|error| error.to_string())?;
    active.insert(tag, notification);
    Ok(())
}

#[tauri::command]
pub fn close_comeplayers_notification(app: AppHandle, state: State<'_, ActiveNotifications>, tag: String) -> Result<(), String> {
    let mut active = state.0.lock().map_err(|_| "Notification state is unavailable.")?;
    if let Some(notification) = active.remove(&tag) {
        notifier(&app)?.Hide(&notification).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{valid_text, xml_text, notification_destination};
    #[test]
    fn notification_content_cannot_inject_toast_xml() {
        assert_eq!(xml_text("A&B <toast>\"'"), "A&amp;B &lt;toast&gt;&quot;&apos;");
        assert!(!valid_text("bad\0value", 120));
        assert!(!valid_text("   ", 120));
        assert!(!valid_text(&"a".repeat(121), 120));
        assert!(valid_text("Panggilan suara masuk", 120));
    }
    #[test]
    fn notification_clicks_only_open_the_official_website() {
        assert!(notification_destination("/cpcommunity?room=abc&channel=general").is_some());
        for value in ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/bad\npath"] {
            assert!(notification_destination(value).is_none());
        }
    }
}
