@echo off
rem Solo arranca el servidor, sin abrir el navegador. Pensado para la carpeta de inicio de Windows.
cd /d "%~dp0..\..\apps\web"
call bun run start
