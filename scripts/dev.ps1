$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-ListeningPid([int]$Port) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($null -ne $conn) { return [int]$conn.OwningProcess }
  } catch {
    # Get-NetTCPConnection throws when no objects are found.
  }
  return $null
}

function Wait-HttpOk([string]$Url, [int]$MaxSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($MaxSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $Url
      if ($resp.StatusCode -eq 200) { return $true }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  return $false
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$logsDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force $logsDir | Out-Null

$pidsPath = Join-Path $logsDir "dev-pids.json"
$existing = $null
if (Test-Path $pidsPath) {
  try { $existing = Get-Content $pidsPath -Raw | ConvertFrom-Json } catch { $existing = $null }
}

$apiPort = 8000
$webPort = 3000

$apiPidExisting = Get-ListeningPid -Port $apiPort
$webPidExisting = Get-ListeningPid -Port $webPort

$apiPid = $apiPidExisting
$webPid = $webPidExisting
$workerPid = $null

$hasWorkerPid = $false
if ($null -ne $existing) {
  $hasWorkerPid = $existing.PSObject.Properties.Name -contains "workerPid"
}
if ($hasWorkerPid -and $null -ne $existing.workerPid) {
  try {
    $p = Get-Process -Id ([int]$existing.workerPid) -ErrorAction Stop
    $workerPid = [int]$p.Id
  } catch {
    $workerPid = $null
  }
}

if ($null -eq $workerPid) {
  # If the pid file is stale/missing, reuse any already-running poller.
  try {
    $existingPoller = Get-CimInstance Win32_Process |
      Where-Object { $_.CommandLine -and $_.CommandLine -match "-m worker_app\\.poller" } |
      Select-Object -First 1
    if ($existingPoller) { $workerPid = [int]$existingPoller.ProcessId }
  } catch {
    $workerPid = $null
  }
}

if ($null -eq $apiPidExisting) {
  $apiOut = Join-Path $logsDir "api-dev.out.log"
  $apiErr = Join-Path $logsDir "api-dev.err.log"

  $apiProc = Start-Process -FilePath (Join-Path $root ".venv\\Scripts\\python.exe") -ArgumentList @(
    "-m", "uvicorn",
    "app.main:app",
    "--reload",
    "--host", "127.0.0.1",
    "--port", "$apiPort"
  ) -WorkingDirectory (Join-Path $root "apps\\api") -NoNewWindow -PassThru -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr

  $apiPid = [int]$apiProc.Id
}

if ($null -eq $webPidExisting) {
  $webOut = Join-Path $logsDir "web-dev.out.log"
  $webErr = Join-Path $logsDir "web-dev.err.log"

  $webProc = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev") -WorkingDirectory (Join-Path $root "apps\\web") -NoNewWindow -PassThru -RedirectStandardOutput $webOut -RedirectStandardError $webErr
  $webPid = [int]$webProc.Id
}

# Worker (DB-backed poller; no Redis needed)
if ($null -eq $workerPid) {
  $workerOut = Join-Path $logsDir "worker-dev.out.log"
  $workerErr = Join-Path $logsDir "worker-dev.err.log"
  $workerProc = Start-Process -FilePath (Join-Path $root ".venv\\Scripts\\python.exe") -ArgumentList @(
    "-m", "worker_app.poller"
  ) -WorkingDirectory (Join-Path $root "apps\\worker") -NoNewWindow -PassThru -RedirectStandardOutput $workerOut -RedirectStandardError $workerErr
  $workerPid = [int]$workerProc.Id
}

# Prefer recording the actual listening PID for stop-dev reliability.
$apiListenPid = Get-ListeningPid -Port $apiPort
$webListenPid = Get-ListeningPid -Port $webPort

$apiPidFinal = $apiPid
if ($null -ne $apiListenPid) { $apiPidFinal = $apiListenPid }

$webPidFinal = $webPid
if ($null -ne $webListenPid) { $webPidFinal = $webListenPid }

@{
  apiPid = $apiPidFinal
  webPid = $webPidFinal
  workerPid = $workerPid
  startedAt = (Get-Date).ToString("o")
  ports = @{ api = $apiPort; web = $webPort }
} | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $pidsPath

Write-Output ("API  : http://127.0.0.1:{0} (PID {1})" -f $apiPort, $apiPidFinal)
Write-Output ("WEB  : http://localhost:{0} (PID {1})" -f $webPort, $webPidFinal)
Write-Output ("WORK : poller (PID {0})" -f $workerPid)
Write-Output ("PIDs : {0}" -f $pidsPath)

if (-not (Wait-HttpOk -Url ("http://127.0.0.1:{0}/healthz" -f $apiPort) -MaxSeconds 30)) {
  Write-Output "API health check failed. See logs in .\\logs\\api-dev.*.log"
  exit 1
}
if (-not (Wait-HttpOk -Url ("http://127.0.0.1:{0}/" -f $webPort) -MaxSeconds 60)) {
  Write-Output "WEB health check failed. See logs in .\\logs\\web-dev.*.log"
  exit 1
}

Write-Output "Dev servers are up."
