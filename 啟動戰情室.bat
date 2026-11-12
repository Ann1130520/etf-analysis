@echo off
chcp 65001 >nul
title 台股 ETF 四強情報戰情室
echo ===================================================
echo   正在啟動【台股 ETF 四強情報戰情室】(0050 / 0056 / 00981A / 00940)
echo ===================================================
echo.
python --version >nul 2>&1
if errorlevel 1 (
    echo 未偵測到 Python，改為直接開啟本地網頁 index.html...
    start "" "%~dp0index.html"
    pause
    exit /b 0
)
echo 正在啟動本地伺服器並開啟瀏覽器 (http://127.0.0.1:8089/index.html)...
echo 注意：使用期間請保持此視窗開啟，關閉此視窗即停止伺服器。
echo.
python "%~dp0server.py"
pause
