@echo off
setlocal
set "APP_DIRECTORY=%~dp0"

if not exist "%APP_DIRECTORY%.venv\Scripts\python.exe" (
  echo FIRETRACE AI setup is incomplete.
  echo Open PowerShell in this folder and run:
  echo python -m venv .venv
  echo .\.venv\Scripts\python.exe -m pip install -r requirements.txt
  pause
  exit /b 1
)

echo Starting FIRETRACE AI at http://127.0.0.1:8000
echo Keep this window open while demonstrating the dashboard.
echo Press Ctrl+C to stop the server.
"%APP_DIRECTORY%.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000

endlocal
