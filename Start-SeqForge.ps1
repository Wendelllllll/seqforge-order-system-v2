param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$seqRoot = $PSScriptRoot
$seqLocal = Join-Path $env:LOCALAPPDATA 'SeqForge'
$seqPgCtl = Join-Path $seqLocal 'tools\pgsql\bin\pg_ctl.exe'
$seqNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $seqNode) {
    $seqNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $seqNode)) { throw 'Install Node.js 22.13 or later, then follow PC_HANDOFF_ZH.md.' }
$seqVersion = [version]((& $seqNode --version).TrimStart('v'))
if ($seqVersion -lt [version]'22.13.0') { throw 'Node.js 22.13 or later is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $seqRoot '.env'))) { throw 'Run npm.cmd ci and npm.cmd run setup, then configure .env. See PC_HANDOFF_ZH.md.' }
$seqNext = Join-Path $seqRoot 'node_modules\next\dist\bin\next'
if (-not (Test-Path -LiteralPath $seqNext)) { throw 'Dependencies are missing. Run npm.cmd ci and npm.cmd run setup first.' }
New-Item -ItemType Directory -Path $seqLocal -Force | Out-Null
# The original PC uses a portable cluster. Other PCs may use an installed
# PostgreSQL service or another server configured by DATABASE_URL instead.
if ((Test-Path -LiteralPath $seqPgCtl) -and (Test-Path -LiteralPath "$seqLocal\pgdata\PG_VERSION")) {
    & $seqPgCtl -D "$seqLocal\pgdata" status *> $null
    if ($LASTEXITCODE -ne 0) {
        & $seqPgCtl -D "$seqLocal\pgdata" -l "$seqLocal\postgres.log" -w start
        if ($LASTEXITCODE -ne 0) { throw 'The portable PostgreSQL server could not start. See the local postgres.log.' }
    }
} else {
    Write-Host 'Using the PostgreSQL server configured in .env. Its service must already be running.'
}
$seqReady = $false
try {
    $seqResponse = Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing -TimeoutSec 3
    if ($seqResponse.Content -match 'SeqForge') { $seqReady = $true }
    else { throw 'Port 3000 is used by another application.' }
} catch {
    if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
        throw 'Port 3000 is already occupied. Close the other application and try again.'
    }
}
if (-not $seqReady) {
    $env:PATH = (Split-Path $seqNode) + ';' + "$seqLocal\tools\npm\package\bin;" + $env:PATH
    $seqProcess = Start-Process -FilePath $seqNode -ArgumentList @(('"' + $seqNext + '"'), 'dev', '--webpack', '--hostname', 'localhost', '--port', '3000') -WorkingDirectory $seqRoot -WindowStyle Hidden -RedirectStandardOutput "$seqLocal\website.log" -RedirectStandardError "$seqLocal\website-error.log" -PassThru
    $seqProcess.Id | Set-Content -LiteralPath "$seqLocal\website.pid"
    for ($seqAttempt = 0; $seqAttempt -lt 60; $seqAttempt++) {
        if ($seqProcess.HasExited) { throw "Website stopped. See $seqLocal\website-error.log" }
        try {
            $seqResponse = Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing -TimeoutSec 3
            if ($seqResponse.StatusCode -eq 200) { $seqReady = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
}
if (-not $seqReady) { throw "Website is not ready. See $seqLocal\website-error.log" }
Write-Host 'SeqForge is running: http://localhost:3000'
if ($OpenBrowser) { Start-Process 'http://localhost:3000' }
