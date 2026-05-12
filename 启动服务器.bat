@echo off
chcp 65001 >nul
echo ===== 正在启动校园运营管理系统本地服务器 =====
echo.
cd /d "%~dp0"
"C:\Users\Windows\.workbuddy\binaries\python\versions\3.13.12\python.exe" -m http.server 8080
pause
