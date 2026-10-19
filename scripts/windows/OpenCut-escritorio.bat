@echo off
rem Abre OpenCut en su propia ventana, sin instalar nada.
rem Cada vez: baja los cambios (git pull) y, solo si hay codigo nuevo, vuelve a
rem compilar (unos minutos). Si no hay cambios, abre al instante.
cd /d "%~dp0..\.."

echo Buscando cambios...
git pull --ff-only
for /f %%i in ('git rev-parse HEAD') do set HEADCOMMIT=%%i

set STAMP=%cd%\apps\web\.next\desktop-build-commit.txt
set BUILT=
if exist "%STAMP%" set /p BUILT=<"%STAMP%"
if not exist "%cd%\apps\web\.next\standalone\apps\web\server.js" set BUILT=
if not exist "%cd%\apps\electron\node_modules" set BUILT=

if "%BUILT%"=="%HEADCOMMIT%" goto :open

echo Hay cambios nuevos: compilando (tarda unos minutos, no cierres la ventana)...
call bun install || goto :error
call bun scripts\prepare-desktop.mjs || goto :error
>"%STAMP%" echo %HEADCOMMIT%

:open
cd apps\electron
start "OpenCut" /min cmd /c "bun run start"
exit /b 0

:error
echo.
echo ERROR: algo ha fallado, copia el mensaje de arriba y pasamelo.
pause
exit /b 1
