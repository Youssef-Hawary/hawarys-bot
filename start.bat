@echo off
title Hawary's Bot
cd /d "%~dp0"
if not exist "server\node_modules" (
  echo First start: installing, this takes a minute...
  call npm run setup || goto :fail
)
if not exist "web\dist\index.html" (
  call npm run build || goto :fail
)
echo.
echo  Hawary's Bot is starting. Dashboard: http://127.0.0.1:8787
echo  KEEP THIS WINDOW OPEN. Closing it stops the bot.
echo.
start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & start http://127.0.0.1:8787"
call npm start
echo.
echo The bot stopped.
pause
exit /b

:fail
echo.
echo Something went wrong (see above). Is Node.js installed? https://nodejs.org
pause
