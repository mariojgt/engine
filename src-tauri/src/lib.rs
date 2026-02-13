use std::fs;
use std::path::PathBuf;

// ============================================================
//  Project File I/O Commands
//  Uses std::fs directly — no plugin scope restrictions,
//  works identically on Windows, Linux, and macOS.
// ============================================================

#[tauri::command]
fn create_project_structure(base_path: String, name: String) -> Result<String, String> {
    let root = PathBuf::from(&base_path).join(&name);
    let dirs = ["Scenes", "Actors", "Config"];

    for dir in &dirs {
        fs::create_dir_all(root.join(dir)).map_err(|e| format!("Failed to create {}: {}", dir, e))?;
    }

    // Return the canonical project root path
    let canonical = root
        .canonicalize()
        .unwrap_or(root.clone());
    // Normalize to forward slashes for cross-platform consistency
    let path_str = canonical
        .to_string_lossy()
        .replace('\\', "/");
    // Strip Windows UNC prefix (\\?\)
    let clean = path_str
        .strip_prefix("///?/")
        .unwrap_or(&path_str)
        .to_string();

    Ok(clean)
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    // Ensure parent directory exists
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dirs: {}", e))?;
    }
    fs::write(&p, contents.as_bytes()).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
fn list_dir_files(path: String, extension: String) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(&path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read dir {}: {}", path, e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let name = entry.file_name().to_string_lossy().to_string();
            if extension.is_empty() || name.ends_with(&extension) {
                files.push(name);
            }
        }
    }

    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
        create_project_structure,
        write_file,
        read_file,
        file_exists,
        list_dir_files,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
