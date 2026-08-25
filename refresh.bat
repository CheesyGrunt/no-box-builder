@echo off
setlocal EnableDelayedExpansion
title Virtual Services Dashboard - Refresh and Publish
cd /d "%~dp0"

echo.
echo  ==========================================================
echo   VIRTUAL SERVICES IMPACT DASHBOARD
echo   Refresh the numbers and push them live
echo  ==========================================================
echo.

REM ---- 1. Locate the workbook -------------------------------------------
set "WB=%~1"
if "%WB%"=="" (
  echo  Drag your VS_Database_v3.xlsx onto this window and press Enter,
  echo  or paste the full path to it.
  echo.
  set /p WB="  Workbook: "
)
set WB=%WB:"=%

if not exist "%WB%" (
  echo.
  echo  [STOP] Could not find that file:
  echo         %WB%
  echo         Check the path and run this again.
  echo.
  pause
  exit /b 1
)

REM ---- 2. Check Python ---------------------------------------------------
echo  [1/4] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [STOP] Python is not installed, or not on your PATH.
  echo         Install it from python.org and check "Add Python to PATH".
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('python --version') do echo        %%v

REM ---- 3. Make sure the libraries are there ------------------------------
echo  [2/4] Checking pandas and openpyxl...
python -c "import pandas, openpyxl" >nul 2>&1
if errorlevel 1 (
  echo        Missing. Installing now, this takes a minute...
  python -m pip install --quiet --upgrade pip
  python -m pip install --quiet pandas openpyxl
  if errorlevel 1 (
    echo.
    echo  [STOP] Install failed. Try running this in a terminal:
    echo         python -m pip install pandas openpyxl
    echo.
    pause
    exit /b 1
  )
)
echo        Ready.

REM ---- 4. Rebuild the dashboard ------------------------------------------
echo  [3/4] Reading the workbook and rebuilding the site...
echo.
python tools\refresh_data.py "%WB%"
if errorlevel 1 (
  echo.
  echo  [STOP] The rebuild failed. Read the error above.
  echo         Most common cause: a sheet was renamed in the workbook.
  echo.
  pause
  exit /b 1
)

REM ---- 5. Publish --------------------------------------------------------
echo.
echo  [4/4] Publishing to GitHub...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo        No git repo here yet, so nothing was pushed.
  echo        Your updated index.html is ready in this folder.
  goto done
)

git diff --quiet -- data.json index.html
if not errorlevel 1 (
  echo        Nothing changed. The numbers are already current.
  goto done
)

set "STAMP=%DATE%"
git add data.json index.html
git commit -m "Refresh Virtual Services data - %STAMP%"
if errorlevel 1 (
  echo        Commit failed. Push it manually when you get a chance.
  goto done
)
git push
if errorlevel 1 (
  echo.
  echo        Commit saved, but the push failed. Check your connection
  echo        or run: git push
  goto done
)
echo        Pushed. Render redeploys on its own, give it about a minute.

:done
echo.
echo  ==========================================================
echo   Done. Open index.html to check it before you share it.
echo  ==========================================================
echo.
pause
