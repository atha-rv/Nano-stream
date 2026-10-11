param(
    [string]$BuildRoot = 'D:\NanoMonitorBuild',
    [string]$OutputRoot = 'D:\Apps',
    [string]$DataRoot = 'D:\NanoMonitor',
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$revision = '9c5bad9cadcc3fecd402a4bddef7a52d8b2ad54f'
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE." }
}
foreach ($directory in @($repository, $BuildRoot, $OutputRoot, $DataRoot)) {
    if (![IO.Path]::IsPathRooted($directory) -or [IO.Path]::GetFullPath($directory) -match '^C:\\') {
        throw 'Clone and build on D: or another non-C: drive to keep large runtimes off C:.'
    }
}
foreach ($command in @('git', 'node', 'pnpm', 'npm', 'py', 'ffmpeg', 'ffprobe')) {
    if (!(Get-Command $command -ErrorAction SilentlyContinue)) { throw "Install $command first; see README.md." }
}
$nodeVersion = [version](& node -p 'process.versions.node')
if ($nodeVersion -lt [version]'24.19.0') { throw 'Node.js 24.19.0 or later is required.' }
Push-Location $PSScriptRoot
try { $pnpmVersion = (& pnpm --version).Trim() } finally { Pop-Location }
if ($pnpmVersion -ne '11.19.0') { throw 'Install pnpm 11.19.0 to match the retained lockfile.' }
Invoke-Checked 'py' @('-3.13', '-c', 'import sys; assert sys.version_info[:2] == (3,13)')
if ($CheckOnly) { Write-Host 'Prerequisites found; no files downloaded or changed.'; exit 0 }

$BuildRoot = [IO.Path]::GetFullPath($BuildRoot)
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$DataRoot = [IO.Path]::GetFullPath($DataRoot)
foreach ($directory in @($BuildRoot, $OutputRoot, $DataRoot, "$BuildRoot\tmp", "$BuildRoot\toolchain")) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
$env:TEMP = "$BuildRoot\tmp"
$env:TMP = $env:TEMP
$env:npm_config_cache = "$BuildRoot\npm-cache"
$env:PIP_CACHE_DIR = "$BuildRoot\pip-cache"
$env:ELECTRON_CACHE = "$BuildRoot\electron-cache"
$env:NANO_BUILD_ROOT = $BuildRoot
$env:NANO_TOOLCHAIN = "$BuildRoot\toolchain"
$env:NANO_OUTPUT_ROOT = $OutputRoot
$env:NANO_DATA_ROOT = $DataRoot
$env:NANO_FFMPEG_DIRECTORY = Split-Path -Parent (Get-Command ffmpeg).Source

$engine = Join-Path $repository '.research\osmo-offload'
if (!(Test-Path -LiteralPath $engine)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $engine) | Out-Null
    Invoke-Checked 'git' @('clone', 'https://github.com/intermittech/OsmoOffload.git', $engine)
    Invoke-Checked 'git' @('-C', $engine, 'checkout', '--detach', $revision)
}
$actualRevision = (& git -C $engine rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualRevision -ne $revision) {
    throw 'Unexpected existing camera engine revision; setup will not reset or overwrite it.'
}
$python = Join-Path $engine '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) { Invoke-Checked 'py' @('-3.13', '-m', 'venv', "$engine\.venv") }
Invoke-Checked $python @('-m', 'pip', 'install', 'pip==26.2.1')
# Import upstream core directly from src; its unused PySide6 GUI is not installed.
Invoke-Checked $python @('-m', 'pip', 'install', '-r', (Join-Path $repository 'tools\nano-transfer\runtime-lock.txt'))
Push-Location $PSScriptRoot
try {
    Invoke-Checked 'pnpm' @('install', '--frozen-lockfile', '--store-dir', "$BuildRoot\pnpm-store")
} finally { Pop-Location }
Copy-Item -LiteralPath "$PSScriptRoot\desktop\package.json" -Destination "$BuildRoot\toolchain\package.json"
Copy-Item -LiteralPath "$PSScriptRoot\desktop\package-lock.json" -Destination "$BuildRoot\toolchain\package-lock.json"
Push-Location "$BuildRoot\toolchain"
try { Invoke-Checked 'npm' @('ci') } finally { Pop-Location }
Invoke-Checked 'node' @((Join-Path $PSScriptRoot 'desktop\build.mjs'))
Write-Host 'Built Nano Monitor. Double-click Start Nano Monitor.cmd to open it.'
Write-Host 'Keep this checkout: the app uses its local camera runtime. No camera connection was attempted during setup.'
