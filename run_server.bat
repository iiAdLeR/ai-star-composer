@echo off
REM تشغيل API من جذر المشروع (انقر مرتين أو شغّل من cmd)
cd /d "%~dp0"
echo Starting AI Star Composer API on http://127.0.0.1:8000
echo Stop: Ctrl+C
python -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --reload
pause
