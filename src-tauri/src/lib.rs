use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::collections::HashMap;

// ============================================================
//  Project File I/O Commands
//  Uses std::fs directly — no plugin scope restrictions,
//  works identically on Windows, Linux, and macOS.
// ============================================================

#[tauri::command]
fn create_project_structure(base_path: String, name: String) -> Result<String, String> {
    let root = PathBuf::from(&base_path).join(&name);
    let dirs = ["Scenes", "Actors", "Structures", "Enums", "Meshes", "AnimBlueprints", "Widgets", "Textures", "Fonts", "Config", "GameInstances", "SaveGameClasses", "Events", "Sounds", "SoundCues"];

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
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dirs: {}", e))?;
    }
    fs::write(&p, contents).map_err(|e| format!("Failed to write binary {}: {}", path, e))
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Failed to read binary {}: {}", path, e))
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("Failed to delete {}: {}", path, e))
    } else {
        Ok(()) // already deleted — no-op
    }
}

#[tauri::command]
fn delete_directory(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        fs::remove_dir_all(&p).map_err(|e| format!("Failed to delete directory {}: {}", path, e))
    } else {
        Ok(()) // already deleted — no-op
    }
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

// ============================================================
//  Build System Commands
// ============================================================

/// Run an external command during the build pipeline.
/// Returns exit code, stdout, and stderr.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
fn run_build_command(cwd: String, command: String, args: Vec<String>) -> Result<CommandResult, String> {
    let output = Command::new(&command)
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to spawn '{}': {}", command, e))?;

    Ok(CommandResult {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

/// Recursively copy a directory tree from src to dest.
#[tauri::command]
fn copy_directory(src: String, dest: String) -> Result<(), String> {
    let src_path = PathBuf::from(&src);
    let dest_path = PathBuf::from(&dest);
    copy_dir_recursive(&src_path, &dest_path)
}

fn copy_dir_recursive(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("Source does not exist: {}", src.display()));
    }
    fs::create_dir_all(dest).map_err(|e| format!("Failed to create {}: {}", dest.display(), e))?;

    for entry in fs::read_dir(src).map_err(|e| format!("Cannot read dir {}: {}", src.display(), e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let dest_child = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_child)?;
        } else {
            fs::copy(entry.path(), &dest_child)
                .map_err(|e| format!("Failed to copy {}: {}", entry.path().display(), e))?;
        }
    }
    Ok(())
}

/// Check whether a command is available in PATH.
/// Returns the resolved path string, or empty string if not found.
#[tauri::command]
fn check_command_available(command: String) -> String {
    // Use `which` on unix, `where` on windows
    #[cfg(target_os = "windows")]
    let result = Command::new("where").arg(&command).output();
    #[cfg(not(target_os = "windows"))]
    let result = Command::new("which").arg(&command).output();

    match result {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => String::new(),
    }
}

/// Reveal a path in the system file manager (Finder on macOS, Explorer on Windows, Nautilus on Linux).
#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        // xdg-open the parent directory
        let parent = PathBuf::from(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path.clone());
        Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Return the engine's root directory (the working directory of the Tauri process).
/// This is used by the build system to locate the engine source code,
/// regardless of where the user's project is stored on disk.
#[tauri::command]
fn get_engine_root() -> Result<String, String> {
    // CARGO_MANIFEST_DIR is set at compile time to the src-tauri/ directory.
    // The engine root is its parent.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let engine_root = manifest_dir
        .parent()
        .ok_or_else(|| "Could not determine engine root from CARGO_MANIFEST_DIR".to_string())?;
    let canonical = engine_root
        .canonicalize()
        .unwrap_or_else(|_| engine_root.to_path_buf());
    let path_str = canonical.to_string_lossy().replace('\\', "/");
    let clean = path_str
        .strip_prefix("///?/")
        .unwrap_or(&path_str)
        .to_string();
    Ok(clean)
}

// ============================================================
//  HTTP Proxy Command — allows frontend to make API calls
//  through the Rust backend (avoids CORS/CSP issues in webview)
// ============================================================

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

#[tauri::command]
async fn http_post_json(
    url: String,
    headers: HashMap<String, String>,
    body: String,
) -> Result<HttpResponse, String> {
    let client = reqwest::Client::new();
    let mut req = client.post(&url);

    for (key, value) in &headers {
        req = req.header(key.as_str(), value.as_str());
    }

    req = req.header("Content-Type", "application/json");
    req = req.body(body);

    let response = req
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status().as_u16();
    let response_body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(HttpResponse {
        status,
        body: response_body,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
        create_project_structure,
        write_file,
        write_binary_file,
        read_file,
        read_binary_file,
        file_exists,
        delete_file,
        delete_directory,
        list_dir_files,
        run_build_command,
        copy_directory,
        check_command_available,
        show_in_folder,
        get_engine_root,
        http_post_json,
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
