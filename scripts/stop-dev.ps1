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

function Stop-ProcessIdIfRunning([int]$ProcessId) {
  if ($ProcessId -le 0) { return }
  try {
    $p = Get-Process -Id $ProcessId -ErrorAction Stop
    Stop-Process -Id $ProcessId -Force
    Write-Output ("Stopped PID {0} ({1})" -f $ProcessId, $p.ProcessName)
  } catch {
    # Already stopped or PID not found.
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$pidsPath = Join-Path $root "logs\\dev-pids.json"

if (Test-Path $pidsPath) {
  $json = Get-Content $pidsPath -Raw | ConvertFrom-Json
  $hasWorkerPid = $json.PSObject.Properties.Name -contains "workerPid"
  if ($hasWorkerPid -and $null -ne $json.workerPid) {
    Stop-ProcessIdIfRunning -ProcessId ([int]$json.workerPid)
  }

  # Stop any stray pollers (covers duplicate starts).
  try {
    $pollers = Get-CimInstance Win32_Process |
      Where-Object { $_.CommandLine -and $_.CommandLine -match "-m worker_app\\.poller" }
    foreach ($p in $pollers) {
      Stop-ProcessIdIfRunning -ProcessId ([int]$p.ProcessId)
    }
  } catch {
    # ignore
  }

  Stop-ProcessIdIfRunning -ProcessId ([int]$json.webPid)
  Stop-ProcessIdIfRunning -ProcessId ([int]$json.apiPid)

  # Also stop whatever is currently listening on the dev ports (covers hot-reload respawns).
  $apiListenPid = Get-ListeningPid -Port 8000
  if ($null -ne $apiListenPid) { Stop-ProcessIdIfRunning -ProcessId $apiListenPid }
  $webListenPid = Get-ListeningPid -Port 3000
  if ($null -ne $webListenPid) { Stop-ProcessIdIfRunning -ProcessId $webListenPid }

  Remove-Item -Force $pidsPath -ErrorAction SilentlyContinue
  Write-Output "Stopped dev servers."
  exit 0
}

Write-Output "No .\\logs\\dev-pids.json found. Nothing to stop."
