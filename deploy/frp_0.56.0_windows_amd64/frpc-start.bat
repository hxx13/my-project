@echo off
chcp 65001 >nul
echo ============================================
echo   frp 内网穿透启动
echo   服务器: 47.101.61.184:7000
echo   转发: 8080 (HTTP) + 9092 (Socket.IO)
echo ============================================
cd /d "%~dp0"
frpc.exe -c frpc.toml
pause
