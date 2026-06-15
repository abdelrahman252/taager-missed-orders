!macro customInit
  ; Delete the old shortcuts if they exist so Windows knows they are gone
  Delete "$DESKTOP\Taager Orders.lnk"
  Delete "$SMPROGRAMS\Taager Orders.lnk"
!macroend

!macro customInstall
  ; Recreate desktop shortcut pointing to the new executable with the embedded icon
  CreateShortCut "$DESKTOP\Taager Orders.lnk" "$appExe" "" "$appExe" 0
  
  ; Recreate start menu shortcut
  CreateShortCut "$SMPROGRAMS\Taager Orders.lnk" "$appExe" "" "$appExe" 0

  ; Force Windows to rebuild its icon cache and refresh all desktop/start menu shortcuts and taskbar pins.
  ; 0x08000000 is SHCNE_ASSOCCHANGED, which notifies the shell that file associations and icon mappings have changed.
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
