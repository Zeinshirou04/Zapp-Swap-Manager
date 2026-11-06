use serde::Serialize;
use std::net::{Ipv4Addr, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State};

const CORE_PORT: u16 = 8765;

// CREATE_NO_WINDOW (0x08000000) | DETACHED_PROCESS (0x00000008):
// run zapp-core.exe headless so no command prompt window flashes.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;

#[derive(Default)]
struct CoreState {
    // PID of the core process we spawned (None if an external process owns it — that process
    // is left alone; restart is still a no-op guarantee: start_core_daemon runs if port free).
    spawned_pid: Mutex<Option<u32>>,
}

#[derive(Serialize)]
struct CoreStatus {
    running: bool,
    pid: Option<u32>,
    port: u16,
}

#[derive(Serialize)]
struct StartResult {
    started: bool,
    pid: Option<u32>,
}

fn core_port_listening() -> bool {
    let addr = std::net::SocketAddr::from((Ipv4Addr::LOCALHOST, CORE_PORT));
    TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
}

fn find_core_exe(app: &tauri::AppHandle) -> Option<PathBuf> {
    // 1. In Tauri bundle resource directory (when bundled via tauri.conf.json resources)
    if let Ok(res_dir) = app.path().resource_dir() {
        let candidates = [
            res_dir.join("zapp-core.exe"),
            res_dir.join("resources").join("zapp-core.exe"),
            res_dir.join("bin").join("zapp-core.exe"),
        ];
        for c in candidates {
            if c.exists() {
                return Some(c);
            }
        }
    }

    // 2. Beside the running desktop executable (installed directory)
    if let Ok(curr) = std::env::current_exe() {
        if let Some(parent) = curr.parent() {
            let candidates = [
                parent.join("zapp-core.exe"),
                parent.join("resources").join("zapp-core.exe"),
            ];
            for c in candidates {
                if c.exists() {
                    return Some(c);
                }
            }
        }
    }

    // 3. Fall back to development build output
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../bin/zapp-core.exe");
    if dev.exists() {
        return Some(dev);
    }
    let dev_res = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/zapp-core.exe");
    if dev_res.exists() {
        return Some(dev_res);
    }

    None
}

#[tauri::command]
fn get_core_status(state: State<'_, CoreState>) -> CoreStatus {
    CoreStatus {
        running: core_port_listening(),
        pid: *state.spawned_pid.lock().unwrap(),
        port: CORE_PORT,
    }
}

#[tauri::command]
fn start_core_daemon(app: tauri::AppHandle, state: State<'_, CoreState>) -> Result<StartResult, String> {
    let existing_pid = *state.spawned_pid.lock().unwrap();
    if core_port_listening() {
        return Ok(StartResult {
            started: false,
            pid: existing_pid,
        });
    }
    let exe = find_core_exe(&app)
        .ok_or_else(|| "zapp-core.exe not found in application bundle or bin/ directory.".to_string())?;
    let child = spawn_detached(&exe).map_err(|e| format!("failed to spawn core: {e}"))?;
    let pid = child.id();
    *state.spawned_pid.lock().unwrap() = Some(pid);
    Ok(StartResult {
        started: true,
        pid: Some(pid),
    })
}

#[cfg(windows)]
fn spawn_detached(exe: &PathBuf) -> std::io::Result<std::process::Child> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new(exe)
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .spawn()
}

#[cfg(not(windows))]
fn spawn_detached(exe: &PathBuf) -> std::io::Result<std::process::Child> {
    std::process::Command::new(exe).spawn()
}

#[tauri::command]
fn restart_core_daemon(app: tauri::AppHandle, state: State<'_, CoreState>) -> Result<StartResult, String> {
    stop_spawned_core(&state);
    start_core_daemon(app, state)
}

#[tauri::command]
fn stop_core_daemon(state: State<'_, CoreState>) -> Result<bool, String> {
    stop_spawned_core(&state);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/IM", "zapp-core.exe", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    Ok(true)
}

#[cfg(windows)]
fn stop_spawned_core(state: &State<'_, CoreState>) {
    use std::os::windows::process::CommandExt;
    if let Some(pid) = *state.spawned_pid.lock().unwrap() {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        *state.spawned_pid.lock().unwrap() = None;
    }
}

#[cfg(not(windows))]
fn stop_spawned_core(_state: &State<'_, CoreState>) {}

#[tauri::command]
fn read_local_auth_token() -> Result<Option<String>, String> {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return Ok(None);
    };
    let path = PathBuf::from(appdata)
        .join("Zapp-Swap-Manager")
        .join("auth.token");
    match std::fs::read_to_string(path) {
        Ok(token) => Ok(Some(token.trim().to_string())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("failed to read local auth token: {e}")),
    }
}

#[tauri::command]
fn relaunch_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
fn open_logs_folder() -> Result<(), String> {
    #[cfg(windows)]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            let log_dir = PathBuf::from(appdata)
                .join("Zapp-Swap-Manager")
                .join("logs");
            let _ = std::fs::create_dir_all(&log_dir);
            let _ = std::process::Command::new("explorer").arg(log_dir).spawn();
        }
    }
    Ok(())
}

#[derive(Clone, Serialize)]
struct UpdateProgressPayload {
    percent: u8,
}

#[tauri::command]
async fn install_update_now(
    app: tauri::AppHandle,
    state: State<'_, CoreState>,
) -> Result<(), String> {
    use tauri::Emitter;
    use tauri_plugin_updater::UpdaterExt;

    // 1. Cleanly stop core daemon so resources/zapp-core.exe is not locked when installer runs
    stop_spawned_core(&state);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/IM", "zapp-core.exe", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    // 2. Build an updater instance overriding on_before_exit with a non-blocking hook.
    // This bypasses the known Tauri v2 WebView2 cleanup_before_exit deadlock (Issue #2558)
    // where window.hide() blocks the main thread during IPC execution.
    let updater = app
        .updater_builder()
        .on_before_exit(|| {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let _ = std::process::Command::new("taskkill")
                    .args(["/IM", "zapp-core.exe", "/F"])
                    .creation_flags(0x0800_0000)
                    .output();
            }
        })
        .build()
        .map_err(|e| format!("Failed to build updater: {e}"))?;

    // 3. Check for available update package
    let Some(update) = updater
        .check()
        .await
        .map_err(|e| format!("Failed to check for update: {e}"))?
    else {
        return Err("No update available to install".into());
    };

    // 4. Download and install with live progress streaming
    let app_clone = app.clone();
    let mut downloaded_bytes: usize = 0;
    let _ = app.emit("update-progress", UpdateProgressPayload { percent: 1 });
    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded_bytes += chunk_length;
                if let Some(total) = content_length {
                    if total > 0 {
                        let pct = ((downloaded_bytes as f64 / total as f64) * 100.0).clamp(1.0, 99.0) as u8;
                        let _ = app_clone.emit("update-progress", UpdateProgressPayload { percent: pct });
                    }
                }
            },
            || {
                let _ = app.emit("update-progress", UpdateProgressPayload { percent: 100 });
            },
        )
        .await
        .map_err(|e| format!("Update installation failed: {e}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(CoreState::default())
        .invoke_handler(tauri::generate_handler![
            start_core_daemon,
            restart_core_daemon,
            stop_core_daemon,
            get_core_status,
            read_local_auth_token,
            relaunch_app,
            open_logs_folder,
            install_update_now
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
