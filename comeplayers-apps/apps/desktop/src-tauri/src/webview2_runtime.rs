use std::process::Command;

use windows_sys::Win32::UI::WindowsAndMessaging::{
    MessageBoxW, IDYES, MB_ICONWARNING, MB_SETFOREGROUND, MB_YESNO,
};
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, REG_SZ},
    types::FromRegValue,
    RegKey,
};

const RUNTIME_KEY: &str =
    r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
const DOWNLOAD_URL: &str = "https://developer.microsoft.com/id-id/microsoft-edge/webview2/";

pub(super) fn ensure_installed() -> bool {
    if runtime_available() {
        return true;
    }

    show_missing_runtime_dialog();
    false
}

fn runtime_available() -> bool {
    // Microsoft documents both the per-machine 32-bit registry view and the
    // per-user key. A preview Edge channel alone is not a production runtime.
    let machine_version = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(RUNTIME_KEY, KEY_READ | KEY_WOW64_32KEY)
        .ok()
        .and_then(read_version);
    let user_version = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(RUNTIME_KEY, KEY_READ)
        .ok()
        .and_then(read_version);

    [machine_version, user_version]
        .iter()
        .flatten()
        .any(|version| installed_version(version))
}

fn read_version(key: RegKey) -> Option<String> {
    let value = key.get_raw_value("pv").ok()?;
    if value.vtype != REG_SZ {
        return None;
    }
    String::from_reg_value(&value).ok()
}

fn installed_version(version: &str) -> bool {
    let mut parts = version.split('.');
    let mut nonzero = false;
    for _ in 0..4 {
        let Some(number) = parts.next().and_then(|part| part.parse::<u32>().ok()) else {
            return false;
        };
        nonzero |= number != 0;
    }
    nonzero && parts.next().is_none()
}

fn show_missing_runtime_dialog() {
    let message = format!(
        "ComePlayers memerlukan Microsoft Edge WebView2 Runtime, tetapi komponen ini tidak terdeteksi.\n\nBuka halaman unduhan resmi Microsoft sekarang? Setelah memasang WebView2, buka ComePlayers kembali.\n\n{DOWNLOAD_URL}"
    );
    let title = "ComePlayers memerlukan WebView2";
    let message: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
    let title: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();

    // The message box is native and appears before Tauri creates a WebView.
    let choice = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_YESNO | MB_ICONWARNING | MB_SETFOREGROUND,
        )
    };
    if choice == IDYES {
        let _ = Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", DOWNLOAD_URL])
            .spawn();
    }
}

#[cfg(test)]
mod tests {
    use super::installed_version;

    #[test]
    fn accepts_only_installed_four_part_versions() {
        assert!(installed_version("153.0.4234.48"));
        for value in ["", "0.0.0.0", "0.0.0", "1.2.3.4.preview", "unknown"] {
            assert!(!installed_version(value), "invalid version {value}");
        }
    }
}
