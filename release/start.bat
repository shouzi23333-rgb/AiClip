@echo off
setlocal
cd /d "%~dp0"

if not exist ".env.local" (
  copy ".env.sample" ".env.local" >nul
  echo Created .env.local. Please fill in your API settings, then run start.bat again.
  pause
  exit /b 0
)

if not exist ".venv\Scripts\python.exe" (
  set "PYTHON_CMD=python"
  %PYTHON_CMD% -m venv .venv
  if errorlevel 1 (
    echo Python was not found. Install Python 3, then run start.bat again.
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)

set "PYTHON_BIN=%CD%\.venv\Scripts\python.exe"
if not defined HOSTNAME set "HOSTNAME=127.0.0.1"
if not defined PORT set "PORT=3000"

echo AiClip is starting at http://%HOSTNAME%:%PORT%
node server.js
