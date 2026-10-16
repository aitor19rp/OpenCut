@echo off
rem Abre OpenCut: arranca el servidor (minimizado) si no esta en marcha y abre el navegador.
cd /d "%~dp0..\..\apps\web"

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if errorlevel 1 start "OpenCut servidor" /min cmd /c "bun run start"

timeout /t 4 /nobreak >nul
start "" http://localhost:3000/projects
