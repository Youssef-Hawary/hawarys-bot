@echo off
setlocal
title Update Hawary's Bot
rem This file replaces itself during the update, so it first runs from a copy in %TEMP%.
if not "%~1"=="--run" (
  copy /y "%~f0" "%TEMP%\hawarys-bot-update.bat" >nul
  "%TEMP%\hawarys-bot-update.bat" --run "%~dp0"
  exit /b
)
cd /d "%~2"

echo ============================================================
echo  Update Hawary's Bot
echo  Your settings, prices, accounts and orders (server\data) are KEPT.
echo  First close the window where the bot is running (start.bat).
echo ============================================================
pause

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set TS=%%i
if exist "server\data\hawary.db" (
  if not exist "server\data\backups" mkdir "server\data\backups"
  copy /y "server\data\hawary.db" "server\data\backups\before-update-%TS%.db" >nul
  if exist "server\data\hawary.db-wal" copy /y "server\data\hawary.db-wal" "server\data\backups\before-update-%TS%.db-wal" >nul
  echo Backup saved: server\data\backups\before-update-%TS%.db
)

echo Downloading the latest version from GitHub...
set "TMPDIR=%TEMP%\hawarys-bot-new"
if exist "%TMPDIR%" rmdir /s /q "%TMPDIR%"
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/Youssef-Hawary/hawarys-bot/archive/refs/heads/master.zip' -OutFile \"$env:TEMP\hawarys-bot.zip\"; Expand-Archive -Force \"$env:TEMP\hawarys-bot.zip\" \"$env:TEMP\hawarys-bot-new\"" || goto :fail
if not exist "%TMPDIR%\hawarys-bot-master\package.json" goto :fail

echo Copying the new code (server\data is left alone)...
robocopy "%TMPDIR%\hawarys-bot-master" "%CD%" /E /XD data node_modules .git /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail
rmdir /s /q "%TMPDIR%" 2>nul

echo Installing and building...
call npm run setup || goto :fail
call npm run build || goto :fail

echo.
echo ============================================================
echo  Updated. Now:
echo   1. Chrome: chrome://extensions  -^>  click the reload icon on Hawary's Bot
echo   2. Press F5 on your Eldorado tab
echo   3. Double-click start.bat
echo ============================================================
pause
exit /b

:fail
echo.
echo The update did not finish (see above). Your data was not changed.
pause
exit /b 1
