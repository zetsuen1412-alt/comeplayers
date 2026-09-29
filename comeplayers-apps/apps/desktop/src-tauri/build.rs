fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new()
                .commands(&["open_google_oauth", "take_pending_navigation_url"]),
        ),
    )
    .expect("Tauri build failed")
}
