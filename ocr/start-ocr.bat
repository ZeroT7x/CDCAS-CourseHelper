@echo off
setlocal
cd /d "%~dp0"
title CX OCR server  (keep this window open)

set PY=.venv\Scripts\python.exe

if not exist "%PY%" goto make_venv
goto check_dep

:make_venv
echo [1/3] creating venv...
python -m venv .venv
if not exist "%PY%" goto no_python

:check_dep
"%PY%" -c "import ddddocr" >nul 2>nul
if errorlevel 1 goto install_dep
goto run

:install_dep
echo [2/3] installing ddddocr, first run downloads about 75 MB ...
"%PY%" -m pip install -U pip
"%PY%" -m pip install -U ddddocr
"%PY%" -c "import ddddocr" >nul 2>nul
if errorlevel 1 goto install_fail

:run
echo [3/3] starting service on http://127.0.0.1:8899
echo open http://127.0.0.1:8899/health in a browser, expect ok true
"%PY%" ddddocr_server.py 8899
echo.
echo server stopped.
pause
goto :eof

:no_python
echo [x] python not found. Install Python 3.9+ and tick "Add python.exe to PATH".
pause
goto :eof

:install_fail
echo [x] ddddocr install failed. Try the mirror manually:
echo     .venv\Scripts\python.exe -m pip install -U ddddocr -i https://pypi.tuna.tsinghua.edu.cn/simple
pause
goto :eof
