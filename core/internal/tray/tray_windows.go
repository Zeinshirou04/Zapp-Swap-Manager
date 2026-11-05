//go:build windows

package tray

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/logger"
	"github.com/Zeinshirou04/Zapp-Swap-Manager/core/internal/service"
)

var (
	modKernel32 = syscall.NewLazyDLL("kernel32.dll")
	modUser32   = syscall.NewLazyDLL("user32.dll")
	modShell32  = syscall.NewLazyDLL("shell32.dll")

	procGetModuleHandleW    = modKernel32.NewProc("GetModuleHandleW")
	procRegisterClassExW    = modUser32.NewProc("RegisterClassExW")
	procUnregisterClassW    = modUser32.NewProc("UnregisterClassW")
	procCreateWindowExW     = modUser32.NewProc("CreateWindowExW")
	procDefWindowProcW      = modUser32.NewProc("DefWindowProcW")
	procDestroyWindow       = modUser32.NewProc("DestroyWindow")
	procPostQuitMessage     = modUser32.NewProc("PostQuitMessage")
	procPostMessageW        = modUser32.NewProc("PostMessageW")
	procGetMessageW         = modUser32.NewProc("GetMessageW")
	procTranslateMessage    = modUser32.NewProc("TranslateMessage")
	procDispatchMessageW    = modUser32.NewProc("DispatchMessageW")
	procCreatePopupMenu     = modUser32.NewProc("CreatePopupMenu")
	procAppendMenuW         = modUser32.NewProc("AppendMenuW")
	procTrackPopupMenu      = modUser32.NewProc("TrackPopupMenu")
	procDestroyMenu         = modUser32.NewProc("DestroyMenu")
	procSetForegroundWindow = modUser32.NewProc("SetForegroundWindow")
	procGetCursorPos        = modUser32.NewProc("GetCursorPos")
	procLoadIconW           = modUser32.NewProc("LoadIconW")
	procShellNotifyIconW    = modShell32.NewProc("Shell_NotifyIconW")
)

const (
	wmApp         = 0x8000
	wmTrayNotify  = wmApp + 1
	wmCommand     = 0x0111
	wmClose       = 0x0010
	wmDestroy     = 0x0002
	wmLButtonUp   = 0x0202
	wmRButtonUp   = 0x0205

	nimAdd        = 0x00000000
	nimModify     = 0x00000001
	nimDelete     = 0x00000002

	nifMessage    = 0x00000001
	nifIcon       = 0x00000002
	nifTip        = 0x00000004

	mfString      = 0x00000000
	mfSeparator   = 0x00000800
	mfGrayed      = 0x00000001

	tpmRightButton = 0x0002
	idiApplication = 32512

	cmdDashboard = 1001
	cmdStatus    = 1002
	cmdLogs      = 1003
	cmdExit      = 1004
)

type point struct {
	x, y int32
}

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
}

type wndClassExW struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type notifyIconDataW struct {
	cbSize           uint32
	hWnd             uintptr
	uID              uint32
	uFlags           uint32
	uCallbackMessage uint32
	hIcon            uintptr
	szTip            [128]uint16
	dwState          uint32
	dwStateMask      uint32
	szInfo           [256]uint16
	uTimeoutOrVersion uint32
	szInfoTitle      [64]uint16
	dwInfoFlags      uint32
	guidItem         [16]byte
	hBalloonIcon     uintptr
}

// WindowsRunner implements tray Runner on Windows using Win32 API.
type WindowsRunner struct {
	actions Actions
	mu      sync.Mutex
	hwnd    uintptr
	hMenu   uintptr
}

// NewRunner creates a platform-appropriate Runner.
func NewRunner(actions Actions) Runner {
	return &WindowsRunner{actions: actions}
}

func (r *WindowsRunner) Run(ctx context.Context, svc *service.Service) error {
	if svc.Config().Headless {
		slog.Info("running in headless mode, system tray disabled")
		return svc.Run(ctx)
	}

	// Must lock the OS thread for Win32 GUI message pump
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	if err := svc.Start(ctx); err != nil {
		return fmt.Errorf("starting service: %w", err)
	}
	defer func() { _ = svc.Stop() }()

	hInst, _, _ := procGetModuleHandleW.Call(0)
	className, _ := syscall.UTF16PtrFromString("ZappSwapManagerTrayClass")

	var currentHwnd uintptr
	wndProc := syscall.NewCallback(func(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
		switch msg {
		case wmTrayNotify:
			if lParam == wmRButtonUp || lParam == wmLButtonUp {
				var pt point
				procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
				procSetForegroundWindow.Call(hwnd)
				procTrackPopupMenu.Call(r.hMenu, tpmRightButton, uintptr(pt.x), uintptr(pt.y), 0, hwnd, 0)
				procPostMessageW.Call(hwnd, 0, 0, 0) // WM_NULL
				return 0
			}
		case wmCommand:
			switch wParam {
			case cmdDashboard:
				if r.actions.OnOpenDashboard != nil {
					r.actions.OnOpenDashboard()
				} else {
					url := fmt.Sprintf("http://%s/health", svc.Config().BindAddr)
					cmd := exec.Command("cmd", "/c", "start", url)
					cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
					_ = cmd.Start()
				}
				return 0
			case cmdLogs:
				logDir := logger.LogDir()
				_ = os.MkdirAll(logDir, 0755)
				cmd := exec.Command("explorer", logDir)
				cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
				_ = cmd.Start()
				return 0
			case cmdExit:
				if r.actions.OnExit != nil {
					r.actions.OnExit()
				}
				procDestroyWindow.Call(hwnd)
				return 0
			}
		case wmClose:
			procDestroyWindow.Call(hwnd)
			return 0
		case wmDestroy:
			procPostQuitMessage.Call(0)
			return 0
		}
		ret, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
		return ret
	})

	wc := wndClassExW{
		cbSize:        uint32(unsafe.Sizeof(wndClassExW{})),
		lpfnWndProc:   wndProc,
		hInstance:     hInst,
		lpszClassName: className,
	}

	atom, _, _ := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	if atom == 0 {
		return fmt.Errorf("register window class failed")
	}
	defer procUnregisterClassW.Call(uintptr(unsafe.Pointer(className)), hInst)

	windowName, _ := syscall.UTF16PtrFromString("ZappSwapManagerTray")
	hwnd, _, _ := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(windowName)),
		0,
		0, 0, 0, 0,
		0, 0, hInst, 0,
	)
	if hwnd == 0 {
		return fmt.Errorf("create window failed")
	}
	currentHwnd = hwnd
	r.hwnd = hwnd

	hIcon, _, _ := procLoadIconW.Call(0, uintptr(idiApplication))

	var nid notifyIconDataW
	nid.cbSize = uint32(unsafe.Sizeof(nid))
	nid.hWnd = hwnd
	nid.uID = 1
	nid.uFlags = nifMessage | nifIcon | nifTip
	nid.uCallbackMessage = wmTrayNotify
	nid.hIcon = hIcon
	copyTip(&nid.szTip, "Zapp Swap Manager (Active)")

	procShellNotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(&nid)))
	defer procShellNotifyIconW.Call(nimDelete, uintptr(unsafe.Pointer(&nid)))

	// Build context menu
	hMenu, _, _ := procCreatePopupMenu.Call()
	r.hMenu = hMenu
	defer procDestroyMenu.Call(hMenu)

	statusStr, _ := syscall.UTF16PtrFromString("Status: Running")
	dashStr, _ := syscall.UTF16PtrFromString("Open Web Dashboard")
	logsStr, _ := syscall.UTF16PtrFromString("Open Logs Folder")
	exitStr, _ := syscall.UTF16PtrFromString("Exit Zapp Swap Manager")

	procAppendMenuW.Call(hMenu, mfString|mfGrayed, cmdStatus, uintptr(unsafe.Pointer(statusStr)))
	procAppendMenuW.Call(hMenu, mfSeparator, 0, 0)
	procAppendMenuW.Call(hMenu, mfString, cmdDashboard, uintptr(unsafe.Pointer(dashStr)))
	procAppendMenuW.Call(hMenu, mfString, cmdLogs, uintptr(unsafe.Pointer(logsStr)))
	procAppendMenuW.Call(hMenu, mfSeparator, 0, 0)
	procAppendMenuW.Call(hMenu, mfString, cmdExit, uintptr(unsafe.Pointer(exitStr)))

	// Listen for context cancellation to break out of message loop
	go func() {
		<-ctx.Done()
		procPostMessageW.Call(currentHwnd, wmClose, 0, 0)
	}()

	slog.Info("tray icon initialized and message loop running")

	var m msg
	for {
		res, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(res) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}

	return nil
}

func copyTip(dest *[128]uint16, src string) {
	chars, _ := syscall.UTF16FromString(src)
	copy(dest[:], chars)
}
