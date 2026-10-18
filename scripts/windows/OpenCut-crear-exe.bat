@echo off
rem Crea el programa de escritorio de OpenCut (instalador .exe y version portable).
rem Solo hace falta ejecutarlo la primera vez y cada vez que actualices el codigo.
cd /d "%~dp0..\.."

echo [1/3] Instalando dependencias...
call bun install || goto :error

echo [2/3] Compilando la app web...
call node scripts\prepare-desktop.mjs || goto :error

echo [3/3] Creando el .exe (puede tardar varios minutos)...
cd apps\electron
call bun run dist || goto :error

echo.
echo LISTO. Los archivos estan en: %cd%\dist
echo   - OpenCut Setup *.exe  = instalador (crea acceso directo y icono en inicio)
echo   - OpenCut *.exe        = version portable (sin instalar)
start "" "%cd%\dist"
pause
exit /b 0

:error
echo.
echo ERROR: algo ha fallado, copia el mensaje de arriba y pasamelo.
pause
exit /b 1
