use std::process::Command;
use std::sync::Mutex;

use tauri::{Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg(target_os = "windows")]
mod webview2_runtime;
#[cfg(target_os = "windows")]
mod notifications;
#[cfg(target_os = "windows")]
use notifications::{notification_permission, request_notification_permission, show_comeplayers_notification, close_comeplayers_notification};

#[derive(Default)]
struct PendingDeepLinks(Mutex<Vec<String>>);

#[tauri::command]
fn take_pending_navigation_url(state: State<'_, PendingDeepLinks>) -> Option<String> {
    match state.0.lock() {
        Ok(mut urls) => std::mem::take(&mut *urls)
            .iter()
            .rev()
            .find_map(deep_link_destination)
            .map(|url| url.to_string()),
        Err(_) => None,
    }
}

fn deep_link_destination(value: &String) -> Option<tauri::Url> {
    auth_deep_link_destination(value).or_else(|| commerce_deep_link_destination(value))
}

fn auth_deep_link_destination(value: &String) -> Option<tauri::Url> {
    let link = value.parse::<tauri::Url>().ok()?;
    if link.scheme() != "comeplayers"
        || link.host_str() != Some("auth")
        || !matches!(link.path(), "" | "/")
        || !link.username().is_empty()
        || link.password().is_some()
        || link.port().is_some()
        || link.fragment().is_some()
    {
        return None;
    }

    let mut code = None;
    let mut state = None;
    for (key, value) in link.query_pairs() {
        match key.as_ref() {
            "code" if code.is_none() && valid_oauth_value(&value, 20, 512) => {
                code = Some(value.into_owned());
            }
            "state" if state.is_none() && valid_oauth_value(&value, 32, 64) => {
                state = Some(value.into_owned());
            }
            _ => return None,
        }
    }
    let (Some(code), Some(state)) = (code, state) else {
        return None;
    };

    // Keep the code in the fragment so it never reaches website/server logs.
    let mut destination =
        tauri::Url::parse("https://www.comeplayers.com/auth/desktop/finish").ok()?;
    destination.set_fragment(Some(&format!("desktop_code={code}&desktop_state={state}")));
    Some(destination)
}

fn valid_oauth_value(value: &str, min: usize, max: usize) -> bool {
    value.len() >= min
        && value.len() <= max
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn commerce_deep_link_destination(value: &String) -> Option<tauri::Url> {
    let link = value.parse::<tauri::Url>().ok()?;
    if link.scheme() != "comeplayers"
        || link.host_str() != Some("commerce")
        || !matches!(link.path(), "" | "/")
        || !link.username().is_empty()
        || link.password().is_some()
        || link.port().is_some()
        || link.fragment().is_some()
    {
        return None;
    }

    let mut order = None;
    let mut topup = None;
    for (key, value) in link.query_pairs() {
        match key.as_ref() {
            "order" if order.is_none() && topup.is_none() => {
                let valid = !value.is_empty()
                    && value.len() <= 15
                    && value.bytes().all(|byte| byte.is_ascii_digit());
                if !valid {
                    return None;
                }
                order = Some(value.into_owned());
            }
            "topup" if topup.is_none() && order.is_none() => {
                let valid = value.len() == 36
                    && value.bytes().enumerate().all(|(index, byte)| {
                        if matches!(index, 8 | 13 | 18 | 23) {
                            byte == b'-'
                        } else {
                            byte.is_ascii_hexdigit()
                        }
                    });
                if !valid {
                    return None;
                }
                topup = Some(value.into_owned());
            }
            _ => return None,
        }
    }

    let destination = if let Some(order) = order {
        format!("https://www.comeplayers.com/orders/{order}")
    } else if topup.is_some() {
        "https://www.comeplayers.com/wallet/topup".to_string()
    } else {
        "https://www.comeplayers.com/orders".to_string()
    };
    destination.parse().ok()
}

fn valid_google_oauth_url(value: &str) -> bool {
    let Ok(url) = value.parse::<tauri::Url>() else {
        return false;
    };
    if url.scheme() != "https"
        || url.host_str() != Some("uyehruetoxedmookyfcd.supabase.co")
        || url.path() != "/auth/v1/authorize"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return false;
    }

    let mut provider = false;
    let mut redirect = false;
    let mut challenge = false;
    let mut method = false;
    let mut skip_redirect = false;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "provider" if !provider && value == "google" => provider = true,
            "redirect_to" if !redirect => {
                let Ok(target) = value.parse::<tauri::Url>() else {
                    return false;
                };
                if target.scheme() != "https"
                    || target.host_str() != Some("www.comeplayers.com")
                    || target.path() != "/auth/desktop"
                    || target.port().is_some()
                    || !target.username().is_empty()
                    || target.password().is_some()
                    || target.fragment().is_some()
                {
                    return false;
                }
                let mut state = false;
                for (target_key, target_value) in target.query_pairs() {
                    if target_key == "state" && !state && valid_oauth_value(&target_value, 32, 64) {
                        state = true;
                    } else {
                        return false;
                    }
                }
                if !state {
                    return false;
                }
                redirect = true;
            }
            "code_challenge" if !challenge && valid_oauth_value(&value, 43, 43) => {
                challenge = true;
            }
            "code_challenge_method" if !method && value == "s256" => method = true,
            "skip_http_redirect" if !skip_redirect && value == "true" => skip_redirect = true,
            _ => return false,
        }
    }
    provider && redirect && challenge && method && skip_redirect
}

#[tauri::command]
fn open_google_oauth(url: String) -> Result<(), String> {
    if !valid_google_oauth_url(&url) {
        return Err("Invalid ComePlayers Google sign-in URL.".into());
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
    #[cfg(target_os = "windows")]
    if !webview2_runtime::ensure_installed() {
        return;
    }

    let mut builder = tauri::Builder::default().manage(PendingDeepLinks::default());
    #[cfg(target_os = "windows")]
    { builder = builder.manage(notifications::ActiveNotifications::default()); }

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

    // The single-instance plugin must precede deep-link on Windows so a
    // browser callback is delivered to the already running app.
    builder = builder.plugin(tauri_plugin_deep_link::init());

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

                let destination = values.iter().rev().find_map(deep_link_destination);
                if let Ok(mut pending) = handle.state::<PendingDeepLinks>().0.lock() {
                    *pending = values;
                }

                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    if let Some(destination) = destination {
                        let _ = window.navigate(destination);
                    }
                }
            });

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;

            Ok(())
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_google_oauth,
            take_pending_navigation_url,
            #[cfg(target_os = "windows")]
            notification_permission,
            #[cfg(target_os = "windows")]
            request_notification_permission,
            #[cfg(target_os = "windows")]
            show_comeplayers_notification,
            #[cfg(target_os = "windows")]
            close_comeplayers_notification
        ])
        .run(tauri::generate_context!())
        .expect("error while running ComePlayers");
}

#[cfg(test)]
mod tests {
    use super::{
        auth_deep_link_destination, commerce_deep_link_destination, valid_google_oauth_url,
    };

    fn destination(value: &str) -> Option<String> {
        commerce_deep_link_destination(&value.to_string()).map(|url| url.to_string())
    }

    #[test]
    fn routes_only_valid_commerce_links_to_trusted_website() {
        assert_eq!(
            destination("comeplayers://commerce?order=123"),
            Some("https://www.comeplayers.com/orders/123".into())
        );
        assert_eq!(
            destination("comeplayers://commerce?topup=70cc261f-7053-44e0-b41f-dd689b7b74f5"),
            Some("https://www.comeplayers.com/wallet/topup".into())
        );
        assert_eq!(
            destination("comeplayers://commerce"),
            Some("https://www.comeplayers.com/orders".into())
        );
        for link in [
            "comeplayers://evil@commerce?order=123",
            "comeplayers://commerce.evil.com?order=123",
            "comeplayers://commerce/evil?order=123",
            "comeplayers://commerce?order=123&order=456",
            "comeplayers://commerce?order=123&topup=70cc261f-7053-44e0-b41f-dd689b7b74f5",
            "comeplayers://commerce?order=123%2F..%2Fwallet",
            "https://www.comeplayers.com/orders/123",
        ] {
            assert_eq!(destination(link), None, "unexpected route for {link}");
        }
    }

    #[test]
    fn routes_only_bounded_auth_codes_to_fragment() {
        let code = "a".repeat(36);
        let state = "b".repeat(43);
        let link = format!("comeplayers://auth?code={code}&state={state}");
        assert_eq!(
            auth_deep_link_destination(&link).map(|url| url.to_string()),
            Some(format!(
                "https://www.comeplayers.com/auth/desktop/finish#desktop_code={code}&desktop_state={state}"
            ))
        );
        for bad in [
            "comeplayers://evil@auth?code=aaaaaaaaaaaaaaaaaaaa&state=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "comeplayers://auth.evil.com?code=aaaaaaaaaaaaaaaaaaaa&state=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "comeplayers://auth/evil?code=aaaaaaaaaaaaaaaaaaaa&state=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "comeplayers://auth?code=aaaaaaaaaaaaaaaaaaaa&code=cccccccccccccccccccc&state=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "comeplayers://auth?code=aaaaaaaaaaaaaaaaaaaa&state=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&next=https://evil.example",
            "comeplayers://auth?code=aaaaaaaaaaaaaaaaaaaa&state=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb#fragment",
        ] {
            assert_eq!(auth_deep_link_destination(&bad.to_string()), None, "{bad}");
        }
    }

    #[test]
    fn opens_only_project_google_pkce_authorization() {
        let challenge = "a".repeat(43);
        let state = "b".repeat(43);
        let target = format!("https://www.comeplayers.com/auth/desktop?state={state}");
        let mut url =
            tauri::Url::parse("https://uyehruetoxedmookyfcd.supabase.co/auth/v1/authorize")
                .unwrap();
        url.query_pairs_mut()
            .append_pair("provider", "google")
            .append_pair("redirect_to", &target)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "s256")
            .append_pair("skip_http_redirect", "true");
        assert!(valid_google_oauth_url(url.as_str()));
        assert!(!valid_google_oauth_url(
            &url.as_str()
                .replace("uyehruetoxedmookyfcd.supabase.co", "evil.example")
        ));
        assert!(!valid_google_oauth_url(
            &url.as_str().replace("provider=google", "provider=github")
        ));
        assert!(!valid_google_oauth_url(&format!(
            "{}&redirect_to=https://evil.example",
            url
        )));
    }
}
