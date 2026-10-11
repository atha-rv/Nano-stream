param([switch] $NoBrowser)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$python = Join-Path $workspace '.research\osmo-offload\.venv\Scripts\python.exe'
$node = Join-Path $runtime 'node\bin\node.exe'
$web = Join-Path $PSScriptRoot 'apps\web'
$logs = Join-Path $workspace '.research\nano-monitor-runtime'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
foreach ($required in @($python, $node, (Join-Path $web 'node_modules\next\dist\bin\next'))) {
    if (!(Test-Path -LiteralPath $required)) { throw "Missing local dependency: $required. See nano-monitor/README.md." }
}
function Quote-Argument([string] $value) { return '"' + $value + '"' }
$bridge = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
if (!$bridge) {
    Start-Process -FilePath $python -ArgumentList (Quote-Argument (Join-Path $PSScriptRoot 'camera\server.py')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'bridge.log') -RedirectStandardError (Join-Path $logs 'bridge-errors.log') | Out-Null
}
$site = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3020 -State Listen -ErrorAction SilentlyContinue
if (!$site) {
    $env:TEMPLATE_PREVIEW_ENABLED = 'true'
    $env:NEXT_PUBLIC_CI = 'true'
    $env:GIT_HASH = 'local-preview'
    $env:PATH = (Join-Path $runtime 'node\bin') + ';' + $env:PATH
    $cli = Join-Path $web 'node_modules\dotenv-cli\cli.js'
    $next = Join-Path $web 'node_modules\next\dist\bin\next'
    $arguments = @((Quote-Argument $cli), '-e', '.env.local', '-e', '.env.development', '--', (Quote-Argument $node), (Quote-Argument $next), 'dev', '--hostname', '127.0.0.1', '--port', '3020')
    Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $web -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'web.log') -RedirectStandardError (Join-Path $logs 'web-errors.log') | Out-Null
}
Write-Host 'Starting Nano Monitor…'
$deadline = (Get-Date).AddSeconds(90)
do {
    try {
        $state = Invoke-RestMethod 'http://127.0.0.1:3020/api/camera/state' -TimeoutSec 3
        if ($state.destination -and $state.phase) {
            if (!$NoBrowser) { Start-Process 'http://127.0.0.1:3020/monitor' }
            Write-Host 'Nano Monitor is open. Disconnect in the app when finished to restore your Wi-Fi.'
            exit 0
        }
    } catch { }
    Start-Sleep -Seconds 1
} while ((Get-Date) -lt $deadline)
throw "Nano Monitor did not become ready. Logs: $logs"
