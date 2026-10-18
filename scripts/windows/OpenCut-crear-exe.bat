@echo off
rem Crea el programa de escritorio de OpenCut (instalador .exe y version portable).
rem Solo usa bun (no hace falta Node). Guarda todo lo que pasa en crear-exe.log.
cd /d "%~dp0..\.."
set LOG=%cd%\crear-exe.log
echo Registro en %LOG%
echo === %date% %time% === > "%LOG%"

echo [1/3] Instalando dependencias...
call bun install >> "%LOG%" 2>&1 || goto :error

echo [2/3] Compilando la app web (varios minutos)...
call bun scripts\prepare-desktop.mjs >> "%LOG%" 2>&1 || goto :error

echo [3/3] Creando el .exe (varios minutos)...
cd apps\electron
call bun --bun run dist >> "%LOG%" 2>&1 || goto :error

echo.
echo LISTO. Los archivos estan en: %cd%\dist
echo   - OpenCut Setup *.exe  = instalador (crea acceso directo y icono en inicio)
echo   - OpenCut *.exe        = version portable (sin instalar)
start "" "%cd%\dist"
pause
exit /b 0

:error
echo.
echo ERROR. Mira las ultimas lineas del registro:
powershell -NoProfile -Command "Get-Content -Tail 25 '%LOG%'"
echo.
echo El registro completo esta en %LOG%
pause
exit /b 1
