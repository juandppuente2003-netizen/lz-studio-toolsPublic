Option Explicit
Dim fso, folder, pythonw, script, shell
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
pythonw = folder & "\.venv\Scripts\pythonw.exe"
script = folder & "\panel.pyw"
If Not fso.FileExists(pythonw) Then
  MsgBox "Ejecuta instalar-windows.bat antes de abrir el conector.", 48, "LZ Studio K40"
  WScript.Quit 1
End If
Set shell = CreateObject("WScript.Shell")
shell.Run Chr(34) & pythonw & Chr(34) & " " & Chr(34) & script & Chr(34), 0, False
