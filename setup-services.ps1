# Installs the feed generator + Caddy as auto-starting Windows services (NSSM).
# Must be run elevated (it creates services). Logs everything to service-setup.log
# so the result can be read after the elevated window closes.
#
#   Run elevated:  powershell -ExecutionPolicy Bypass -File .\setup-services.ps1

$ErrorActionPreference = 'Continue'
# This script's own directory = the repo root (no hardcoded path).
$repo = $PSScriptRoot
$log = Join-Path $repo 'service-setup.log'
Start-Transcript -Path $log -Force | Out-Null

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
$caddy = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter caddy.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if (-not $caddy) { $caddy = (Get-Command caddy -ErrorAction SilentlyContinue).Source }
Write-Output "node:  $node"
Write-Output "caddy: $caddy"

$feedSvc = 'LouisvilleFeedGen'
$caddySvc = 'LouisvilleFeedCaddy'

function Remove-Svc($name) {
  if (Get-Service $name -ErrorAction SilentlyContinue) {
    Write-Output "Removing existing service $name"
    nssm stop $name confirm 2>$null
    nssm remove $name confirm 2>$null
    Start-Sleep -Seconds 1
  }
}

Remove-Svc $feedSvc
Remove-Svc $caddySvc

# --- Feed generator service ---
nssm install $feedSvc $node 'dist\src\index.js'
nssm set $feedSvc AppDirectory $repo
nssm set $feedSvc DisplayName 'Louisville Feed Generator'
nssm set $feedSvc Description 'Self-hosted Bluesky feed generator (ingest + serve)'
nssm set $feedSvc Start SERVICE_AUTO_START
nssm set $feedSvc AppStdout (Join-Path $repo 'service-feedgen.log')
nssm set $feedSvc AppStderr (Join-Path $repo 'service-feedgen.log')
nssm set $feedSvc AppRotateFiles 1
nssm set $feedSvc AppRotateBytes 10485760
nssm set $feedSvc AppExit Default Restart
nssm set $feedSvc AppRestartDelay 3000

# --- Caddy service ---
nssm install $caddySvc $caddy 'run' '--config' (Join-Path $repo 'Caddyfile')
nssm set $caddySvc AppDirectory $repo
nssm set $caddySvc DisplayName 'Louisville Feed Caddy (HTTPS)'
nssm set $caddySvc Description 'Caddy reverse proxy / TLS for feeds.chasecrawford.dev'
nssm set $caddySvc Start SERVICE_AUTO_START
nssm set $caddySvc AppStdout (Join-Path $repo 'service-caddy.log')
nssm set $caddySvc AppStderr (Join-Path $repo 'service-caddy.log')
nssm set $caddySvc AppRotateFiles 1
nssm set $caddySvc AppRotateBytes 10485760
nssm set $caddySvc AppExit Default Restart
nssm set $caddySvc AppRestartDelay 3000

Write-Output 'Starting services...'
Start-Service $feedSvc
Start-Service $caddySvc
Start-Sleep -Seconds 4

Get-Service $feedSvc, $caddySvc | Select-Object Name, Status, StartType | Format-Table -AutoSize | Out-String | Write-Output
Write-Output 'DONE'
Stop-Transcript | Out-Null
