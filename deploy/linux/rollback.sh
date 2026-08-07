#!/bin/bash
# rollback.sh — 快速回滚到上一个版本
set -e

APP_DIR=/opt/twin/app

echo "=== 回滚到上一版本 ==="

if [ ! -f "$APP_DIR/demo-previous.jar.bak" ]; then
    echo "❌ 未找到备份 JAR: $APP_DIR/demo-previous.jar.bak"
    exit 1
fi

echo "停止当前服务..."
sudo systemctl stop twin
sleep 3

echo "替换 JAR..."
sudo cp "$APP_DIR/demo-previous.jar.bak" "$APP_DIR/demo-rollback.jar"
sudo chown twin:twin "$APP_DIR/demo-rollback.jar"

echo "启动服务..."
sudo systemctl start twin
sleep 25

HTTP=$(curl -sk -o /dev/null -w "%{http_code}" https://localhost -H "Host: aroultra.shsmu.edu.cn")
if [ "$HTTP" = "200" ]; then
    echo "✅ 回滚成功  HTTP $HTTP"
else
    echo "❌ 回滚后 HTTP $HTTP — 检查日志: sudo journalctl -u twin --no-pager -n 30"
    exit 1
fi
