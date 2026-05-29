@echo off
REM 复制为项目根目录 start-public.bat（已在 .gitignore，勿提交口令）
REM 对外穿透：HTTP 8080 + Socket.IO 9092，配合 deploy\frp_0.56.0_windows_amd64\frpc.exe

set WINCC_USERNAME=admin
set WINCC_PASSWORD=111111
set DB_PASSWORD=SuperAdmin@2026

java -jar target\demo-0.0.1-SNAPSHOT.jar --server.port=8080
