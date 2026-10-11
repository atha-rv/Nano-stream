$ErrorActionPreference = 'Stop'
$taskRuntimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$taskNodeDirectory = Join-Path $taskRuntimeRoot 'node\bin'
$taskPnpmDirectory = Join-Path $taskRuntimeRoot 'bin\fallback'
if (Test-Path -LiteralPath (Join-Path $taskNodeDirectory 'node.exe')) {
  $env:PATH = "$taskNodeDirectory;$taskPnpmDirectory;" + $env:PATH
}
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& pnpm preview
exit $LASTEXITCODE
