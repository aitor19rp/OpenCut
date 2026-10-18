@echo off
rem Abre OpenCut en su propia ventana (sin navegador). Requiere haber ejecutado
rem antes OpenCut-crear-exe.bat o "bun run desktop:prepare" una vez.
cd /d "%~dp0..\..\apps\electron"
if not exist node_modules\electron (
  echo Instalando dependencias, solo la primera vez...
  pushd "%~dp0..\.."
  call bun install
  popd
)
start "" /b node_modules\.bin\electron.cmd .
