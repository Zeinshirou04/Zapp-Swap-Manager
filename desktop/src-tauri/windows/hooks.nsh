; Zapp Swap Manager NSIS Installer Hooks
; Ensures running zapp-core.exe and zapp-desktop.exe are terminated
; before installing, updating, or uninstalling so files are not locked.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping Zapp services before installation..."
  nsExec::Exec 'taskkill /F /IM zapp-core.exe'
  nsExec::Exec 'taskkill /F /IM zapp-desktop.exe'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping Zapp services before uninstallation..."
  nsExec::Exec 'taskkill /F /IM zapp-core.exe'
  nsExec::Exec 'taskkill /F /IM zapp-desktop.exe'
!macroend
