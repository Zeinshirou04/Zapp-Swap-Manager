use serde::Serialize;
use std::net::{Ipv4Addr, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

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

fn find_core_exe() -> Option<PathBuf> {
    // Prefer zapp-core.exe next to the running desktop app; fall back to the dev build output.
    let beside = std::env::current_exe()
        .ok()?
        .parent()?
        .join("zapp-core.exe");
    if beside.exists() {
        return Some(beside);
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../bin/zapp-core.exe");
    dev.exists().then_some(dev)
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
fn start_core_daemon(state: State<'_, CoreState>) -> Result<StartResult, String> {
    let existing_pid = *state.spawned_pid.lock().unwrap();
    if core_port_listening() {
        return Ok(StartResult {
            started: false,
            pid: existing_pid,
        });
    }
    let exe = find_core_exe()
        .ok_or_else(|| "zapp-core.exe not found. Run `just build` first.".to_string())?;
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
fn restart_core_daemon(state: State<'_, CoreState>) -> Result<StartResult, String> {
    stop_spawned_core(&state);
    start_core_daemon(state)
}

#[cfg(windows)]
fn stop_spawned_core(state: &State<'_, CoreState>) {
    use std::os::windows::process::CommandExt;
    if let Some(pid) = *state.spawned_pid.lock().unwrap() {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        for _ in 0..30 {
            if !core_port_listening() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(CoreState::default())
        .invoke_handler(tauri::generate_handler![
            start_core_daemon,
            restart_core_daemon,
            get_core_status,
            read_local_auth_token,
            relaunch_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
