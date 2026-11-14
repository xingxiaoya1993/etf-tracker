@echo off
title ETF Tracker - Phone Server
cd /d "%~dp0"
echo ================================================
echo    ETF 份额追踪 · 手机版服务器
echo ================================================
echo.
echo  手机和电脑连同一个 WiFi，然后打开下面显示的地址。
echo.
python tools\serve.py --port 8080
echo.
echo [提示] 服务已停止。若提示找不到 python，请先安装 Python 3
echo        （安装时勾选 Add Python to PATH）。
pause