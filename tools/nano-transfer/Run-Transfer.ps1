param(
    [ValidateSet('list', 'one', 'all')]
    [string]$Mode = 'list',
    [string]$Destination = ''
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$enginePath = Join-Path $taskRoot '.research\osmo-offload'
$pythonPath = Join-Path $enginePath '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $pythonPath)) {
    throw 'The local transfer runtime is missing. See README.md for setup.'
}
$actualRevision = (& git -C $enginePath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualRevision -ne '9c5bad9cadcc3fecd402a4bddef7a52d8b2ad54f') {
    throw 'Unexpected OsmoOffload revision. Review the engine before using it.'
}
Write-Host "Nano transfer: $Mode. Uses Nano Monitor's remembered save location unless overridden."
Write-Host 'Keep your Nano nearby, powered on, with Mimo disconnected.'
Write-Host 'Approve on its Vision Dock if prompted. Wi-Fi internet may pause during copying.'
$transferArgs = @('--mode', $Mode)
if ($Destination) { $transferArgs += @('--destination', $Destination) }
& $pythonPath (Join-Path $PSScriptRoot 'transfer.py') @transferArgs
exit $LASTEXITCODE
