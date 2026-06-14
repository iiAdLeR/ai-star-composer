@echo off
REM يشغّل الـ API والواجهة معًا (نافذتان منفصلتان). المجلد: جذر المشروع.
cd /d "%~dp0"

REM Defensive cleanup: any stale uvicorn instance from a previous run
REM will silently steal port 8000 and make every endpoint time out.
REM We grep python processes whose command line mentions "uvicorn" and
REM nuke them before starting fresh so the new server can bind cleanly.
echo Cleaning up any stale API process on port 8000...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -match 'uvicorn' } | ForEach-Object { Write-Host ('  killing PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Starting API on http://127.0.0.1:8000  (window 1)
echo Starting Vite on http://127.0.0.1:5173  (window 2)
echo Close each window to stop that process.
start "AI Star Composer API" cmd /k "cd /d %~dp0 && python -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --reload"
start "AI Star Composer Web" cmd /k "cd /d %~dp0web && npm run dev"
pause
