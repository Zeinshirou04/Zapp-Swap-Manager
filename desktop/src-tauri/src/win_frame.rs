use core::ffi::c_void;
use windows_sys::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows_sys::Win32::Graphics::Dwm::{
    DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE,
};
use windows_sys::Win32::Graphics::Gdi::ScreenToClient;
use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
use windows_sys::Win32::UI::Controls::MARGINS;
use windows_sys::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetClientRect, IsZoomed, SetWindowPos, HTCLIENT, HTTOP, HTTOPLEFT, HTTOPRIGHT, HWND_NOTOPMOST,
    NCCALCSIZE_PARAMS, SM_CXFRAME, SM_CXPADDEDBORDER, SM_CYFRAME, SWP_FRAMECHANGED, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, WM_NCCALCSIZE, WM_NCDESTROY, WM_NCHITTEST,
};
use windows_sys::Win32::Foundation::CloseHandle;

const SUBCLASS_ID: usize = 0x5A41_5050; // "ZAPP"
const DWMWCP_ROUND: u32 = 2;

/// Runtime Windows frame and integrity-level diagnostics surfaced to the UI.
#[derive(Debug, Clone, serde::Serialize)]
pub struct WindowDiagnostics {
    pub elevated: bool,
    pub decorated_frame: bool,
}

/// Returns true when the current process runs with an elevated (Administrator) token.
///
/// An elevated window triggers UIPI isolation against medium-integrity utilities such as
/// ShareX capture hooks and can behave differently with medium-integrity always-on-top overlays.
pub fn is_process_elevated() -> bool {
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 || token.is_null() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut out_len: u32 = 0;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut c_void,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut out_len,
        );
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

/// Configures the main Tauri window on Windows so that ShareX window picking and DWM bounds
/// work reliably without clipping or trapping Always-On-Top windows beneath Zapp.
pub fn setup_window(window: &tauri::WebviewWindow) -> WindowDiagnostics {
    let elevated = is_process_elevated();

    // Ensure Zapp always lives in the normal (non-topmost) Z-order band.
    let _ = window.set_always_on_top(false);

    // Enable genuine Win32 styles (WS_CAPTION | WS_THICKFRAME | WS_SYSMENU) so DWM and window
    // pickers like ShareX treat Zapp as a standard top-level application window, while our
    // WM_NCCALCSIZE subclass removes only the default OS caption strip for the React titlebar.
    let decorated_frame = window.set_decorations(true).is_ok();

    if let Ok(raw_hwnd) = window.hwnd() {
        let hwnd = raw_hwnd.0 as HWND;
        unsafe {
            // Apply DWM rounded corners on Windows 11 (harmless E_INVALIDARG on Windows 10).
            let corner = DWMWCP_ROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE as u32,
                &corner as *const u32 as *const c_void,
                std::mem::size_of::<u32>() as u32,
            );

            // Extend 1px top DWM sheet so the borderless caption still receives the native halo/border.
            let margins = MARGINS {
                cxLeftWidth: 0,
                cxRightWidth: 0,
                cyTopHeight: 1,
                cyBottomHeight: 0,
            };
            let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);

            SetWindowSubclass(hwnd, Some(wnd_subclass_proc), SUBCLASS_ID, 0);

            // Flush style/non-client frame changes and guarantee HWND_NOTOPMOST before showing.
            SetWindowPos(
                hwnd,
                HWND_NOTOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
    }

    WindowDiagnostics {
        elevated,
        decorated_frame,
    }
}

/// Computes the standard top/side resize border thickness adjusted for window DPI.
unsafe fn resize_borders(hwnd: HWND) -> (i32, i32) {
    let dpi = GetDpiForWindow(hwnd);
    let pad = GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
    let bx = GetSystemMetricsForDpi(SM_CXFRAME, dpi) + pad;
    let by = GetSystemMetricsForDpi(SM_CYFRAME, dpi) + pad;
    (bx.max(4), by.max(4))
}

unsafe extern "system" fn wnd_subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    uid_subclass: usize,
    _dw_ref_data: usize,
) -> LRESULT {
    match msg {
        WM_NCCALCSIZE if wparam != 0 && lparam != 0 => {
            let params = &mut *(lparam as *mut NCCALCSIZE_PARAMS);
            let orig_top = params.rgrc[0].top;

            // Let DefSubclassProc compute exact Left/Right/Bottom borders and monitor work-area
            // bounds (preserving standard Win32 frame geometry for DWM & ShareX).
            let res = DefSubclassProc(hwnd, msg, wparam, lparam);

            if IsZoomed(hwnd) != 0 {
                // Maximized windows extend offscreen by the resize frame; keep the client area
                // inside the visible work area top edge without a native caption bar.
                let (_, border_y) = resize_borders(hwnd);
                params.rgrc[0].top = orig_top + border_y;
            } else {
                // Remove only the standard caption height while keeping L/R/B non-client borders.
                params.rgrc[0].top = orig_top;
            }
            res
        }
        WM_NCHITTEST => {
            let res = DefSubclassProc(hwnd, msg, wparam, lparam);
            if res == HTCLIENT as isize && IsZoomed(hwnd) == 0 {
                let mut pt = POINT {
                    x: (lparam as i32) & 0xFFFF,
                    y: ((lparam as i32) >> 16) & 0xFFFF,
                };
                // Sign-extend 16-bit screen coordinates for multi-monitor negative offsets.
                pt.x = (pt.x as i16) as i32;
                pt.y = (pt.y as i16) as i32;

                if ScreenToClient(hwnd, &mut pt) != 0 {
                    let (border_x, border_y) = resize_borders(hwnd);
                    let mut client = RECT {
                        left: 0,
                        top: 0,
                        right: 0,
                        bottom: 0,
                    };
                    if GetClientRect(hwnd, &mut client) != 0 && pt.y >= 0 && pt.y < border_y {
                        if pt.x < border_x {
                            return HTTOPLEFT as isize;
                        }
                        if pt.x >= client.right - border_x {
                            return HTTOPRIGHT as isize;
                        }
                        return HTTOP as isize;
                    }
                }
            }
            res
        }
        WM_NCDESTROY => {
            RemoveWindowSubclass(hwnd, Some(wnd_subclass_proc), uid_subclass);
            DefSubclassProc(hwnd, msg, wparam, lparam)
        }
        _ => DefSubclassProc(hwnd, msg, wparam, lparam),
    }
}
