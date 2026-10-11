$ErrorActionPreference = 'Stop'
$manifest = Join-Path $PSScriptRoot 'desktop-install.json'
$executable = 'D:\Apps\Nano Monitor-win32-x64\Nano Monitor.exe'
if (Test-Path -LiteralPath $manifest) {
    $executable = (Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json).executable
}
if (!$executable -or !(Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw 'Nano Monitor desktop app is missing. Run Setup-Desktop.ps1 first; see the repository README.'
}
# This is the user-facing interactive app; helper processes stay hidden.
Start-Process -FilePath $executable -WindowStyle Normal
