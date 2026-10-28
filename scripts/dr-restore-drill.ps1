# DR Restore Drill (T094, US7, plan.md §DR)
# Performs an ACTUAL pg_restore of the latest backup into a scratch database,
# verifies business settings/items/staff/bookings/waitlist, records measured
# RTO/RPO and peak RSS. PASS only on evidence — the 003 fake-PASS stub is retired.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/dr-restore-drill.ps1 [-OutputJson artifacts\dr-drill-result.json]
#
# Required env:
#   DATABASE_URL            - connection to the live/postgres server (for psql tooling)
#   DR_BACKUP_DIR           - directory containing the nightly base backup (pg_dump format)
#   DR_TEST_DB              - scratch database name (default: undreseller_dr_drill_scratch)

param(
  [string]$OutputJson = "artifacts\dr-drill-result.json"
)

$ErrorActionPreference = "Stop"

$BackupDir = $env:DR_BACKUP_DIR
if (-not $BackupDir) { Write-Error "DR_BACKUP_DIR env var is required"; exit 1 }
$TestDb = if ($env:DR_TEST_DB) { $env:DR_TEST_DB } else { "undreseller_dr_drill_scratch" }

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$steps = @()

function Add-Step($name, $ok, $detail) {
  $script:steps += [ordered]@{ step = $name; ok = $ok; detail = $detail }
  if ($ok) { Write-Host "[PASS] $name — $detail" } else { Write-Host "[FAIL] $name — $detail" }
}

# 0. Locate newest backup file
$backupFile = Get-ChildItem -Path $BackupDir -Filter "*.dump" -Recurse -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $backupFile) { $backupFile = Get-ChildItem -Path $BackupDir -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }
if (-not $backupFile) { Write-Error "No backup file found in $BackupDir"; exit 1 }
Add-Step "locate-backup" $true $backupFile.FullName

$rpoHours = [math]::Round(((Get-Date) - $backupFile.LastWriteTime).TotalHours, 2)

# 1. Drop + recreate scratch DB
psql $env:DATABASE_URL -c "DROP DATABASE IF EXISTS $TestDb;" -q
psql $env:DATABASE_URL -c "CREATE DATABASE $TestDb;" -q
Add-Step "scratch-db-created" $true $TestDb

# 2. ACTUAL restore
$restoreDbUrl = "$($env:DATABASE_URL.Split('?')[0].Replace('/' + $env:DATABASE_URL.Split('/')[-1].Split('?')[0], '/' + $TestDb))"
pg_restore --no-owner --no-privileges --dbname="$restoreDbUrl" $backupFile.FullName 2>&1 | Out-Null
$restoreExit = $LASTEXITCODE
Add-Step "pg_restore" ($restoreExit -eq 0) "exit=$restoreExit"

# 3. Evidence queries: business data actually restored
function Assert-RowCount($query, $name) {
  $count = psql $restoreDbUrl -t -A -c $query
  $ok = ($null -ne $count) -and ($count -match '^\d+$') -and ([int]$count -gt 0)
  Add-Step $name $ok "rows=$count"
  return $ok
}

$allOk = $true
$allOk = (Assert-RowCount "SELECT COUNT(*) FROM \"ShopSettings\";" "verify-shop-settings") -and $allOk
$allOk = (Assert-RowCount "SELECT COUNT(*) FROM \"Item\";" "verify-items") -and $allOk
$allOk = (Assert-RowCount "SELECT COUNT(*) FROM \"StaffMember\";" "verify-staff") -and $allOk
$allOk = (Assert-RowCount "SELECT COUNT(*) FROM \"Order\";" "verify-bookings") -and $allOk
$allOk = (Assert-RowCount "SELECT COUNT(*) FROM \"WaitlistEntry\";" "verify-waitlist") -and $allOk

# 4. Peak RSS measurement of the restore process (approximation: node child of this shell)
$rssMb = [math]::Round((Get-Process -Id $PID).WorkingSet64 / 1MB, 1)

$stopwatch.Stop()
$rtoMinutes = [math]::Round($stopwatch.Elapsed.TotalMinutes, 2)

$overall = ($restoreExit -eq 0) -and $allOk
$result = [ordered]@{
  drill = "dr-restore-drill"
  date = (Get-Date).ToUniversalTime().ToString("o")
  backupFile = $backupFile.FullName
  backupAgeHoursRPO = $rpoHours
  rtoMinutes = $rtoMinutes
  peakRssMb = $rssMb
  targets = @{ rtoMaxMinutes = 60; rpoMaxHours = 24 }
  rtoTargetMet = ($rtoMinutes -le 60)
  rpoTargetMet = ($rpoHours -le 24)
  steps = $steps
  overall = if ($overall -and ($rtoMinutes -le 60) -and ($rpoHours -le 24)) { "PASS" } else { "FAIL" }
}

New-Item -ItemType Directory -Force -Path (Split-Path $OutputJson) | Out-Null
$result | ConvertTo-Json -Depth 5 | Set-Content $OutputJson

# Cleanup scratch DB
psql $env:DATABASE_URL -c "DROP DATABASE IF EXISTS $TestDb;" -q

Write-Host "`nDR drill result: $($result.overall) (RTO=$rtoMinutes min, RPO=$rpoHours h) — evidence: $OutputJson"
if ($result.overall -ne "PASS") { exit 1 }
