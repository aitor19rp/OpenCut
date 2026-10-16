@echo off
rem Descarga los cambios nuevos, recompila y vuelve a abrir OpenCut.
cd /d "%~dp0..\.."

echo [1/4] Cerrando el servidor si esta abierto...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

echo [2/4] Descargando cambios...
git pull

echo [3/4] Instalando dependencias...
call bun install

echo [4/4] Compilando (puede tardar unos minutos)...
cd apps\web
call bun run build
if errorlevel 1 (
  echo.
  echo La compilacion ha fallado. Haz una captura de este mensaje.
  pause
  exit /b 1
)

call "%~dp0OpenCut-iniciar.bat"
