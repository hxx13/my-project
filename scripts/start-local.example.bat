@echo off
REM 复制为项目根目录 start.bat（已在 .gitignore）
REM 本地调试：HTTP 8081，不需 frp

set SPRING_PROFILES_ACTIVE=local
set WINCC_USERNAME=admin
set WINCC_PASSWORD=111111
set DB_PASSWORD=SuperAdmin@2026

java -jar target\demo-0.0.1-SNAPSHOT.jar
