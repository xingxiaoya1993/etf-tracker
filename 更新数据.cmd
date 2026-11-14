@echo off
title ETF Tracker - Update Data
cd /d "%~dp0"
echo ================================================
echo    从原系统重新生成手机版数据 data\etf-data.json
echo ================================================
echo.
python tools\build_data.py
if errorlevel 1 goto failed
echo.
echo [完成] 如果 App 部署在 GitHub Pages / 网盘，
echo        请把 data\etf-data.json 上传覆盖旧文件。
echo.
pause
exit /b 0
:failed
echo.
echo [失败] 没找到数据源。原系统默认路径：
echo        桌面\ETF份额追踪系统\ETF份额追踪.html
echo        如果不在这个位置，请手动运行：
echo        python tools\build_data.py --src "你的html路径"
echo.
pause