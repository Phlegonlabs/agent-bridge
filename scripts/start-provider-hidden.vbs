Option Explicit

' Runs start-provider.ps1 with no console window. Task Scheduler launching
' powershell.exe directly flashes a console at startup even with
' -WindowStyle Hidden; wscript has no console, so the PowerShell process it
' starts with window style 0 stays fully hidden.
Dim quote, shell, fso, scriptDir, target, status
quote = Chr(34)
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
target = scriptDir & "\start-provider.ps1"

On Error Resume Next
status = shell.Run("powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & quote & target & quote, 0, True)
If Err.Number <> 0 Then
  WScript.Quit 1
End If
On Error Goto 0
WScript.Quit status
