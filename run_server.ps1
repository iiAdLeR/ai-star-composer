# إعادة تشغيل نظيفة: يوقف ما يستمع على 8000 ثم يشغّل Uvicorn
# تشغيل: PowerShell → .\run_server.ps1
# إذا ظهرت رسالة ExecutionPolicy: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

$ErrorActionPreference = "SilentlyContinue"
Set-Location $PSScriptRoot

$port = 8000
$killed = $false
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    $script:killed = $true
}
if ($killed) {
    Write-Host "Stopped previous listener on port $port."
    Start-Sleep -Seconds 1
}

Write-Host "Starting API: http://127.0.0.1:8000  (Ctrl+C to stop)"
python -m uvicorn backend.api:app --host 127.0.0.1 --port $port --reload
