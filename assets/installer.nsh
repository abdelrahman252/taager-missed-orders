!macro customInstall
  ; Force Windows to rebuild its icon cache and refresh all desktop/start menu shortcuts and taskbar pins.
  ; 0x08000000 is SHCNE_ASSOCCHANGED, which notifies the shell that file associations and icon mappings have changed.
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
