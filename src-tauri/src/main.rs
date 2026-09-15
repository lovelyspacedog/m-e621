// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp"];
const VIDEO_EXTS: &[&str] = &["webm", "mp4", "mkv", "mov"];
const AUDIO_EXTS: &[&str] = &["flac", "mp3", "m4a", "ogg", "opus", "wav"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalFileEntry {
  relative_path: String,
  name: String,
  ext: String,
  size: u64,
  last_modified: u64,
  kind: String,
}

fn ext_of(name: &str) -> String {
  Path::new(name)
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_ascii_lowercase())
    .unwrap_or_default()
}

fn kind_for_ext(ext: &str) -> Option<&'static str> {
  if IMAGE_EXTS.contains(&ext) {
    Some("image")
  } else if VIDEO_EXTS.contains(&ext) {
    Some("video")
  } else if AUDIO_EXTS.contains(&ext) {
    Some("audio")
  } else {
    None
  }
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
  meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn walk_media(root: &Path, dir: &Path, prefix: &str, out: &mut Vec<LocalFileEntry>) -> Result<(), String> {
  let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
  for entry in entries {
    let entry = entry.map_err(|e| e.to_string())?;
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().to_string();
    if name.starts_with('.') {
      continue;
    }
    let meta = entry.metadata().map_err(|e| e.to_string())?;
    if meta.is_dir() {
      let next_prefix = if prefix.is_empty() {
        name.clone()
      } else {
        format!("{}/{}", prefix, name)
      };
      walk_media(root, &path, &next_prefix, out)?;
      continue;
    }
    if !meta.is_file() {
      continue;
    }
    let ext = ext_of(&name);
    let Some(kind) = kind_for_ext(&ext) else {
      continue;
    };
    let relative_path = if prefix.is_empty() {
      name.clone()
    } else {
      format!("{}/{}", prefix, name)
    };
    out.push(LocalFileEntry {
      relative_path,
      name,
      ext,
      size: meta.len(),
      last_modified: mtime_ms(&meta),
      kind: kind.to_string(),
    });
  }
  Ok(())
}

fn resolve_under_root(root: &str, relative_or_abs: &str) -> Result<PathBuf, String> {
  let root_path = PathBuf::from(root)
    .canonicalize()
    .map_err(|e| format!("Invalid root folder: {}", e))?;
  let candidate = {
    let p = PathBuf::from(relative_or_abs);
    if p.is_absolute() {
      p
    } else {
      root_path.join(p)
    }
  };
  let canonical = candidate
    .canonicalize()
    .map_err(|e| format!("Invalid path: {}", e))?;
  if !canonical.starts_with(&root_path) {
    return Err("Path escapes Local browse root".into());
  }
  Ok(canonical)
}

#[tauri::command]
fn pick_local_folder() -> Result<Option<String>, String> {
  let folder = tauri::api::dialog::blocking::FileDialogBuilder::new()
    .set_title("Choose Local browse folder")
    .pick_folder();
  Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn list_local_media(root: String) -> Result<Vec<LocalFileEntry>, String> {
  let root_path = PathBuf::from(&root)
    .canonicalize()
    .map_err(|e| format!("Invalid root folder: {}", e))?;
  if !root_path.is_dir() {
    return Err("Local browse root is not a directory".into());
  }
  let mut out = Vec::new();
  walk_media(&root_path, &root_path, "", &mut out)?;
  out.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
  Ok(out)
}

#[tauri::command]
fn read_local_file(root: String, relative_path: String) -> Result<Vec<u8>, String> {
  let path = resolve_under_root(&root, &relative_path)?;
  fs::read(path).map_err(|e| e.to_string())
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      pick_local_folder,
      list_local_media,
      read_local_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
