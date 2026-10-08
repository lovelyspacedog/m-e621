//! Desktop sign-in. Linux opens a WebKitGTK 4.1 window via site_login.py
//! (Arch no longer ships the WebKitGTK 4.0 libraries Tauri 1 links).
//! Other platforms return a clear error.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Clone, Copy)]
struct SiteSpec {
  id: &'static str,
  title: &'static str,
  start_url: &'static str,
  cookie_uri: &'static str,
  hosts: &'static [&'static str],
  cookie_names: &'static [&'static str],
  required: &'static [&'static str],
  read_token: bool,
}

const SITES: &[SiteSpec] = &[
  SiteSpec {
    id: "furaffinity",
    title: "Sign in — FurAffinity",
    start_url: "https://www.furaffinity.net/login/",
    cookie_uri: "https://www.furaffinity.net/",
    hosts: &[
      "www.furaffinity.net",
      "furaffinity.net",
      "sfw.furaffinity.net",
    ],
    cookie_names: &["a", "b"],
    required: &["a", "b"],
    read_token: false,
  },
  SiteSpec {
    id: "sofurry",
    title: "Sign in — SoFurry",
    start_url: "https://www.sofurry.com/user/login",
    cookie_uri: "https://www.sofurry.com/",
    hosts: &["www.sofurry.com", "sofurry.com"],
    cookie_names: &["_session", "sofurry_session"],
    required: &["_session"],
    read_token: false,
  },
  SiteSpec {
    id: "tailspace",
    title: "Sign in — Tailspace",
    start_url: "https://tailspace.com/login",
    cookie_uri: "https://tailspace.com/",
    hosts: &["tailspace.com", "www.tailspace.com"],
    cookie_names: &["tailspace_session"],
    required: &["tailspace_session"],
    read_token: false,
  },
  SiteSpec {
    id: "weasyl",
    title: "Sign in — Weasyl",
    start_url: "https://www.weasyl.com/signin",
    cookie_uri: "https://www.weasyl.com/",
    hosts: &["www.weasyl.com", "weasyl.com"],
    cookie_names: &["sessionid", "csrftoken"],
    required: &["sessionid"],
    read_token: false,
  },
  SiteSpec {
    id: "itaku",
    title: "Sign in — Itaku",
    start_url: "https://itaku.ee/login",
    cookie_uri: "https://itaku.ee/",
    hosts: &["itaku.ee", "www.itaku.ee"],
    cookie_names: &["token"],
    required: &[],
    read_token: true,
  },
];

fn site_by_id(id: &str) -> Result<&'static SiteSpec, String> {
  SITES
    .iter()
    .find(|site| site.id == id)
    .ok_or_else(|| format!("Unknown site: {id}"))
}

pub fn navigation_allowed(hosts: &[&str], url: &url::Url) -> bool {
  if url.scheme() != "https" {
    return false;
  }
  match url.host_str() {
    Some(host) => hosts
      .iter()
      .any(|allowed| host.eq_ignore_ascii_case(allowed)),
    None => false,
  }
}

pub fn pick_cookies(allowed: &[&str], found: &[(String, String)]) -> Vec<(String, String)> {
  allowed
    .iter()
    .filter_map(|name| {
      found
        .iter()
        .find(|(found_name, value)| found_name.eq_ignore_ascii_case(name) && !value.is_empty())
        .cloned()
    })
    .collect()
}

pub fn missing_required(required: &[&str], picked: &[(String, String)]) -> Vec<String> {
  required
    .iter()
    .filter(|name| {
      !picked
        .iter()
        .any(|(found, value)| found.eq_ignore_ascii_case(name) && !value.is_empty())
    })
    .map(|name| (*name).to_string())
    .collect()
}

#[derive(Serialize)]
struct CookieOut {
  name: String,
  value: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SiteSession {
  cookies: Vec<CookieOut>,
  token: Option<String>,
}

#[derive(Deserialize)]
struct HelperCookie {
  name: String,
  value: String,
}

#[derive(Deserialize)]
struct HelperResult {
  ok: bool,
  cookies: Vec<HelperCookie>,
  token: Option<String>,
  message: String,
}

fn script_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  if let Some(dir) = app.path_resolver().resource_dir() {
    let bundled = dir.join("site_login.py");
    if bundled.is_file() {
      return Ok(bundled);
    }
  }
  let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("site_login.py");
  if dev.is_file() {
    return Ok(dev);
  }
  Err("site_login.py is missing from the desktop bundle.".into())
}

fn session_from_helper(spec: &SiteSpec, helper: HelperResult) -> Result<SiteSession, String> {
  if !helper.ok {
    let message = helper.message.trim();
    if message.is_empty() || message == "Cancelled" {
      return Err("Sign-in cancelled.".into());
    }
    return Err(message.to_string());
  }
  let found: Vec<(String, String)> = helper
    .cookies
    .into_iter()
    .map(|cookie| (cookie.name, cookie.value))
    .collect();
  let picked = pick_cookies(spec.cookie_names, &found);
  let missing = missing_required(spec.required, &picked);
  if !missing.is_empty() {
    return Err(format!(
      "Missing {} after sign-in. Finish login in the site window, then try again.",
      missing.join(", ")
    ));
  }
  let token = if spec.read_token {
    let token = helper.token.unwrap_or_default().trim().to_string();
    if token.is_empty() {
      return Err(
        "No Itaku token in this window. Stay on itaku.ee after login, or paste the token."
          .into(),
      );
    }
    if token.len() > 512 {
      return Err("Itaku token from the page was unexpectedly long.".into());
    }
    Some(token)
  } else {
    None
  };
  Ok(SiteSession {
    cookies: picked
      .into_iter()
      .map(|(name, value)| CookieOut { name, value })
      .collect(),
    token,
  })
}

#[cfg(target_os = "linux")]
fn run_helper(app: &tauri::AppHandle, spec: &SiteSpec) -> Result<SiteSession, String> {
  let script = script_path(app)?;
  let payload = serde_json::json!({
    "title": spec.title,
    "startUrl": spec.start_url,
    "cookieUri": spec.cookie_uri,
    "hosts": spec.hosts,
    "cookieNames": spec.cookie_names,
    "readToken": spec.read_token,
  });
  let output = Command::new("python3")
    .arg(&script)
    .arg(payload.to_string())
    .output()
    .map_err(|err| format!("Could not open the sign-in window: {err}"))?;
  let stdout = String::from_utf8_lossy(&output.stdout);
  let line = stdout
    .lines()
    .rev()
    .find(|line| line.trim_start().starts_with('{'))
    .unwrap_or("")
    .trim();
  if line.is_empty() {
    return Err(window_error(&String::from_utf8_lossy(&output.stderr)));
  }
  let helper: HelperResult =
    serde_json::from_str(line).map_err(|err| format!("Sign-in window returned invalid data: {err}"))?;
  session_from_helper(spec, helper)
}

fn window_error(stderr: &str) -> String {
  let text = stderr.trim();
  let lower = text.to_ascii_lowercase();
  if lower.contains("wayland")
    || lower.contains("protocol error")
    || lower.contains("cannot open display")
  {
    return "Could not open the sign-in window on this display.".into();
  }
  let lines: Vec<&str> = text
    .lines()
    .map(str::trim)
    .filter(|line| !line.is_empty())
    .collect();
  if lines.is_empty() {
    return "Sign-in window closed without a session.".into();
  }
  let start = lines.len().saturating_sub(2);
  lines[start..].join(" ")
}

#[cfg(not(target_os = "linux"))]
fn run_helper(_app: &tauri::AppHandle, _spec: &SiteSpec) -> Result<SiteSession, String> {
  Err("Desktop sign-in is available on Linux builds.".into())
}

#[tauri::command]
pub async fn sign_in_site(app: tauri::AppHandle, site: String) -> Result<SiteSession, String> {
  let spec = site_by_id(&site)?;
  tauri::async_runtime::spawn_blocking(move || run_helper(&app, spec))
    .await
    .map_err(|err| err.to_string())?
}

#[cfg(test)]
mod tests {
  use super::{missing_required, navigation_allowed, pick_cookies};
  use url::Url;

  #[test]
  fn allows_site_hosts_only() {
    let hosts = &["www.furaffinity.net", "furaffinity.net"];
    assert!(navigation_allowed(
      hosts,
      &Url::parse("https://www.furaffinity.net/login/").unwrap()
    ));
    assert!(navigation_allowed(
      hosts,
      &Url::parse("https://furaffinity.net/").unwrap()
    ));
    assert!(!navigation_allowed(
      hosts,
      &Url::parse("https://evil.example/login").unwrap()
    ));
    assert!(!navigation_allowed(
      hosts,
      &Url::parse("http://www.furaffinity.net/login/").unwrap()
    ));
  }

  #[test]
  fn picks_allowlisted_cookies_in_order() {
    let found = vec![
      ("noise".into(), "1".into()),
      ("b".into(), "bee".into()),
      ("a".into(), "ay".into()),
    ];
    let picked = pick_cookies(&["a", "b"], &found);
    assert_eq!(
      picked,
      vec![("a".into(), "ay".into()), ("b".into(), "bee".into())]
    );
    assert!(missing_required(&["a", "b"], &picked).is_empty());
    assert_eq!(
      missing_required(&["_session"], &picked),
      vec!["_session".to_string()]
    );
  }
}
