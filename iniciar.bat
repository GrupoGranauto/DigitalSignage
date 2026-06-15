@echo off
title Servidor Local - Citas de Servicio
echo ==========================================================
echo    INICIANDO SERVIDOR LOCAL PARA DIGITAL SIGNAGE
echo ==========================================================
echo.

:: Detectar Node.js
where node >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js detectado.
    echo Iniciando servidor en: http://localhost:8080
    echo.
    echo (Presiona Ctrl+C en esta ventana para detener el servidor)
    echo ==========================================================
    node server.js
    goto end
)

:: Detectar Python
where python >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python detectado.
    echo Iniciando servidor en: http://localhost:8080
    echo.
    echo (Presiona Ctrl+C en esta ventana para detener el servidor)
    echo ==========================================================
    python -m http.server 8080
    goto end
)

:: Fallback si no hay Node ni Python
echo [ADVERTENCIA] No se detectó Node.js ni Python en el sistema.
echo Se recomienda instalar alguno para evitar bloqueos de seguridad (CORS) del navegador.
echo.
echo Abriendo index.html directamente en el navegador...
echo.
start index.html

:end
pause
